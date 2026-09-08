"""Document-intake job state machine (spec 6.3 / 3.B).

The live OCR/translation pipeline is stubbed: a job advances through the
seven canonical stages on a background timer, and language / entity counts
are pulled from the seed tables when the upload matches a known FIR image.
On GRAPH_UPDATE completion the extracted entity IDs are registered in the
graph store so the Network Explorer can scope the view to just that evidence.
"""
from __future__ import annotations

import asyncio
import json
import time
import uuid

from app.services.db import execute, query, query_one, row_to_dict

STAGES = [
    "UPLOADED", "OCR", "LANGUAGE_DETECTION", "TRANSLATION",
    "ENTITY_EXTRACTION", "IDENTITY_RESOLUTION", "GRAPH_UPDATE",
]


def ensure_schema() -> None:
    """Apply additive upload-job columns needed by newer app versions."""
    columns = {str(row["name"]) for row in query("PRAGMA table_info(upload_jobs)")}
    if columns and "extracted_entity_ids" not in columns:
        execute(
            "ALTER TABLE upload_jobs "
            "ADD COLUMN extracted_entity_ids TEXT NOT NULL DEFAULT '[]'"
        )


def create_job(case_id: str, filename: str, document_id: str | None) -> dict:
    job_id = "JOB" + uuid.uuid4().hex[:10].upper()
    doc_id = document_id or ("DOCUP" + uuid.uuid4().hex[:8].upper())
    execute(
        "INSERT INTO upload_jobs "
        "(job_id, document_id, case_id, filename, stage, status, updated_at) "
        "VALUES (?,?,?,?,?,?,?)",
        (job_id, doc_id, case_id, filename, "UPLOADED", "processing",
         time.strftime("%Y-%m-%dT%H:%M:%SZ")),
    )
    return {"job_id": job_id, "document_id": doc_id}


def get_job(job_id: str) -> dict | None:
    row = row_to_dict(query_one(
        "SELECT * FROM upload_jobs WHERE job_id = ?", (job_id,)
    ))
    if not row:
        return None
    raw = row.get("extracted_entity_ids") or "[]"
    try:
        entity_ids: list[str] = json.loads(raw)
    except Exception:
        entity_ids = []
    return {
        "job_id": row["job_id"],
        "document_id": row["document_id"],
        "stage": row["stage"],
        "status": row["status"],
        "detected_language": row["detected_language"],
        "extracted_entity_count": (
            int(row["extracted_entity_count"]) if row["extracted_entity_count"] else None
        ),
        "extracted_entity_ids": entity_ids,
        "error": row["error"],
    }


# ---------------------------------------------------------------------------
# seed metadata helpers
# ---------------------------------------------------------------------------

def _jl(value):
    """Decode a JSON list column safely."""
    from app.services.db import jcol
    v = jcol(value)
    return v if isinstance(v, list) else []


def _seed_metadata(case_id: str, filename: str) -> tuple[str | None, int | None, list[str]]:
    """Return (language, entity_count, entity_ids) from seed FIR tables."""
    stem = filename.rsplit("/", 1)[-1].rsplit(".", 1)[0].upper()
    doc = row_to_dict(query_one(
        "SELECT * FROM documents WHERE UPPER(image_path) LIKE ? OR UPPER(fir_id) = ?",
        (f"%{stem}%", stem),
    ))
    lang = doc["language"] if doc else None
    fir = None
    if doc and doc.get("fir_id"):
        fir = row_to_dict(query_one(
            "SELECT * FROM firs WHERE fir_id = ?", (doc["fir_id"],)
        ))
    if not fir:
        fir = row_to_dict(query_one(
            "SELECT * FROM firs WHERE case_id = ? LIMIT 1", (case_id,)
        ))

    entity_ids: list[str] = []
    if not fir:
        return lang, None, entity_ids

    lang = lang or fir.get("language")
    seen: set[str] = set()

    def add(eid: str) -> None:
        s = str(eid).strip()
        if s and s not in seen:
            seen.add(s)
            entity_ids.append(s)

    # Persons
    for pid in _jl(fir.get("suspect_person_ids")) + _jl(fir.get("victim_person_ids")):
        add(str(pid))

    # Phones — resolve number → phone_id
    for phone_num in _jl(fir.get("mentioned_phone_numbers")):
        row = row_to_dict(query_one(
            "SELECT phone_id FROM phone_ownership WHERE phone_number = ? LIMIT 1",
            (str(phone_num),),
        ))
        if row and row.get("phone_id"):
            add(row["phone_id"])

    # Vehicles — resolve reg → vehicle_id
    for reg in _jl(fir.get("mentioned_vehicles")):
        row = row_to_dict(query_one(
            "SELECT vehicle_id FROM vehicles WHERE registration_number = ? LIMIT 1",
            (str(reg),),
        ))
        if row and row.get("vehicle_id"):
            add(row["vehicle_id"])

    # Bank accounts
    for acc in _jl(fir.get("mentioned_account_ids")):
        add(str(acc))

    # Orgs
    for org in _jl(fir.get("mentioned_org_ids")):
        add(str(org))

    return lang, len(entity_ids), entity_ids


# ---------------------------------------------------------------------------
# pipeline runner
# ---------------------------------------------------------------------------

async def run_pipeline(
    job_id: str, case_id: str, filename: str, step_delay: float = 1.2
) -> None:
    lang, entity_count, entity_ids = _seed_metadata(case_id, filename)

    # Retrieve document_id for later graph-store registration
    job_row = row_to_dict(query_one(
        "SELECT document_id FROM upload_jobs WHERE job_id = ?", (job_id,)
    ))
    document_id: str | None = job_row["document_id"] if job_row else None

    for stage in STAGES:
        await asyncio.sleep(step_delay)
        fields: dict = {
            "stage": stage,
            "status": "processing",
            "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
        }
        if stage == "LANGUAGE_DETECTION" and lang:
            fields["detected_language"] = lang
        if stage == "ENTITY_EXTRACTION" and entity_count is not None:
            fields["extracted_entity_count"] = entity_count
        if stage == "GRAPH_UPDATE" and entity_ids:
            fields["extracted_entity_ids"] = json.dumps(entity_ids)
        _update(job_id, fields)

    # Mark completed
    _update(job_id, {
        "stage": "GRAPH_UPDATE",
        "status": "completed",
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
    })

    # Register extracted entities in the in-memory graph store so the
    # network view can be scoped to this document's evidence.
    if document_id and entity_ids:
        try:
            from app.services import graph_store
            graph_store.register_document_entities(document_id, entity_ids)
        except Exception:
            pass  # Non-fatal — graph still works at case level


def _update(job_id: str, fields: dict) -> None:
    sets = ", ".join(f"{k} = ?" for k in fields)
    execute(f"UPDATE upload_jobs SET {sets} WHERE job_id = ?",
            [*fields.values(), job_id])


# ---------------------------------------------------------------------------
# document listing
# ---------------------------------------------------------------------------

def list_case_documents(case_id: str) -> list[dict]:
    """Seed FIR documents for the case + any live uploads, in one list."""
    out: list[dict] = []

    # Seed FIR documents
    for row in query(
        "SELECT d.document_id, d.image_path, d.language, "
        "f.suspect_person_ids, f.mentioned_phone_numbers "
        "FROM documents d LEFT JOIN firs f ON f.fir_id = d.fir_id "
        "WHERE d.case_id = ?",
        (case_id,),
    ):
        r = row_to_dict(row)
        cnt = (
            len(_jl(r.get("suspect_person_ids")))
            + len(_jl(r.get("mentioned_phone_numbers")))
        )
        out.append({
            "document_id": r["document_id"],
            "status": "completed",
            "detected_language": r["language"],
            "extracted_entity_count": cnt,
            "extracted_entity_ids": [],
            "view_url": r["image_path"],
        })

    # Live uploads
    for row in query(
        "SELECT * FROM upload_jobs WHERE case_id = ?", (case_id,)
    ):
        r = row_to_dict(row)
        raw = r.get("extracted_entity_ids") or "[]"
        try:
            eids: list[str] = json.loads(raw)
        except Exception:
            eids = []
        out.append({
            "document_id": r["document_id"],
            "status": r["status"],
            "detected_language": r["detected_language"],
            "extracted_entity_count": (
                int(r["extracted_entity_count"]) if r["extracted_entity_count"] else None
            ),
            "extracted_entity_ids": eids,
            "view_url": f"/uploads/{r['filename']}",
        })
    return out


# ---------------------------------------------------------------------------
# entity resolution for seed (FIR) documents
# ---------------------------------------------------------------------------

def get_document_entity_ids_from_seed(document_id: str, case_id: str) -> list[str]:
    """Resolve entity IDs for a seed FIR document by its document_id."""
    doc = row_to_dict(query_one(
        "SELECT d.*, f.suspect_person_ids, f.victim_person_ids, "
        "f.mentioned_phone_numbers, f.mentioned_vehicles, "
        "f.mentioned_account_ids, f.mentioned_org_ids "
        "FROM documents d LEFT JOIN firs f ON f.fir_id = d.fir_id "
        "WHERE d.document_id = ?",
        (document_id,),
    ))
    if not doc:
        return []

    entity_ids: list[str] = []
    seen: set[str] = set()

    def add(eid: str) -> None:
        s = str(eid).strip()
        if s and s not in seen:
            seen.add(s)
            entity_ids.append(s)

    for pid in _jl(doc.get("suspect_person_ids")) + _jl(doc.get("victim_person_ids")):
        add(str(pid))
    for phone_num in _jl(doc.get("mentioned_phone_numbers")):
        row = row_to_dict(query_one(
            "SELECT phone_id FROM phone_ownership WHERE phone_number = ? LIMIT 1",
            (str(phone_num),),
        ))
        if row and row.get("phone_id"):
            add(row["phone_id"])
    for reg in _jl(doc.get("mentioned_vehicles")):
        row = row_to_dict(query_one(
            "SELECT vehicle_id FROM vehicles WHERE registration_number = ? LIMIT 1",
            (str(reg),),
        ))
        if row and row.get("vehicle_id"):
            add(row["vehicle_id"])
    for acc in _jl(doc.get("mentioned_account_ids")):
        add(str(acc))
    for org in _jl(doc.get("mentioned_org_ids")):
        add(str(org))

    return entity_ids
