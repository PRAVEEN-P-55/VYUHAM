"""Document-intake job state machine (spec 6.3 / 3.B).

The live OCR/translation pipeline is stubbed: a job advances through the
seven canonical stages on a background timer, and language / entity counts
are pulled from the seed tables when the upload matches a known FIR image.
"""
from __future__ import annotations

import asyncio
import time
import uuid

from app.services.db import execute, query, query_one, row_to_dict

STAGES = [
    "UPLOADED", "OCR", "LANGUAGE_DETECTION", "TRANSLATION",
    "ENTITY_EXTRACTION", "IDENTITY_RESOLUTION", "GRAPH_UPDATE",
]


def create_job(case_id: str, filename: str, document_id: str | None) -> dict:
    job_id = "JOB" + uuid.uuid4().hex[:10].upper()
    doc_id = document_id or ("DOCUP" + uuid.uuid4().hex[:8].upper())
    execute(
        "INSERT INTO upload_jobs (job_id, document_id, case_id, filename, stage, status, updated_at) "
        "VALUES (?,?,?,?,?,?,?)",
        (job_id, doc_id, case_id, filename, "UPLOADED", "processing",
         time.strftime("%Y-%m-%dT%H:%M:%SZ")),
    )
    return {"job_id": job_id, "document_id": doc_id}


def get_job(job_id: str) -> dict | None:
    row = row_to_dict(query_one("SELECT * FROM upload_jobs WHERE job_id = ?", (job_id,)))
    if not row:
        return None
    return {
        "job_id": row["job_id"],
        "document_id": row["document_id"],
        "stage": row["stage"],
        "status": row["status"],
        "detected_language": row["detected_language"],
        "extracted_entity_count": int(row["extracted_entity_count"]) if row["extracted_entity_count"] else None,
        "error": row["error"],
    }


def _seed_metadata(case_id: str, filename: str) -> tuple[str | None, int | None]:
    stem = filename.rsplit("/", 1)[-1].rsplit(".", 1)[0].upper()
    doc = row_to_dict(query_one(
        "SELECT * FROM documents WHERE UPPER(image_path) LIKE ? OR UPPER(fir_id) = ?",
        (f"%{stem}%", stem),
    ))
    lang = doc["language"] if doc else None
    fir = None
    if doc and doc["fir_id"]:
        fir = row_to_dict(query_one("SELECT * FROM firs WHERE fir_id = ?", (doc["fir_id"],)))
    if not fir:
        fir = row_to_dict(query_one("SELECT * FROM firs WHERE case_id = ? LIMIT 1", (case_id,)))
    count = None
    if fir:
        count = sum(len(fir.get(k) or []) for k in (
            "suspect_person_ids", "victim_person_ids", "mentioned_phone_numbers",
            "mentioned_vehicles", "mentioned_account_ids", "mentioned_org_ids",
        ))
        lang = lang or fir.get("language")
    return lang, count


async def run_pipeline(job_id: str, case_id: str, filename: str, step_delay: float = 1.2) -> None:
    lang, entity_count = _seed_metadata(case_id, filename)
    for stage in STAGES:
        await asyncio.sleep(step_delay)
        fields = {"stage": stage, "status": "processing",
                  "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ")}
        if stage == "LANGUAGE_DETECTION" and lang:
            fields["detected_language"] = lang
        if stage == "ENTITY_EXTRACTION" and entity_count is not None:
            fields["extracted_entity_count"] = entity_count
        _update(job_id, fields)
    _update(job_id, {"stage": "GRAPH_UPDATE", "status": "completed",
                     "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ")})


def _update(job_id: str, fields: dict) -> None:
    sets = ", ".join(f"{k} = ?" for k in fields)
    execute(f"UPDATE upload_jobs SET {sets} WHERE job_id = ?", [*fields.values(), job_id])


def list_case_documents(case_id: str) -> list[dict]:
    """Seed FIR documents for the case + any live uploads, in one table."""
    out = []
    for row in query(
        "SELECT d.document_id, d.image_path, d.language, f.suspect_person_ids, "
        "f.mentioned_phone_numbers FROM documents d LEFT JOIN firs f ON f.fir_id = d.fir_id "
        "WHERE d.case_id = ?", (case_id,)
    ):
        r = row_to_dict(row)
        cnt = len((r.get("suspect_person_ids") or [])) + len((r.get("mentioned_phone_numbers") or []))
        out.append({
            "document_id": r["document_id"],
            "status": "completed",
            "detected_language": r["language"],
            "extracted_entity_count": cnt,
            "view_url": r["image_path"],
        })
    for row in query("SELECT * FROM upload_jobs WHERE case_id = ?", (case_id,)):
        r = row_to_dict(row)
        out.append({
            "document_id": r["document_id"],
            "status": r["status"],
            "detected_language": r["detected_language"],
            "extracted_entity_count": int(r["extracted_entity_count"]) if r["extracted_entity_count"] else None,
            "view_url": f"/uploads/{r['filename']}",
        })
    return out
