"""Spec 6.3 -- Document Intake (upload + job events + case document list)."""
from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile

from app.config import settings
from app.deps import Investigator, get_current_investigator, require_case_access
from app.services import audit, jobs, graph_store

router = APIRouter(tags=["documents"])

_ALLOWED_SUFFIXES = {".pdf", ".jpg", ".jpeg", ".png"}
_MAX_UPLOAD_BYTES = 25 * 1024 * 1024
_UPLOADS = Path(settings.db_path).parent / "uploads"


@router.post("/cases/{case_id}/documents", status_code=202)
async def upload_document(
    case_id: str,
    background: BackgroundTasks,
    file: UploadFile = File(...),
    investigator: Investigator = Depends(require_case_access),
):
    original_name = file.filename or ""
    safe_name = Path(original_name).name
    suffix = Path(safe_name).suffix.lower()
    if not safe_name or suffix not in _ALLOWED_SUFFIXES:
        raise HTTPException(400, "Upload a PDF, JPG, JPEG, or PNG document")

    content = await file.read(_MAX_UPLOAD_BYTES + 1)
    if len(content) > _MAX_UPLOAD_BYTES:
        raise HTTPException(413, "Document exceeds the 25 MB upload limit")
    if not content:
        raise HTTPException(400, "The selected document is empty")

    _UPLOADS.mkdir(parents=True, exist_ok=True)
    (_UPLOADS / safe_name).write_bytes(content)

    created = jobs.create_job(case_id, safe_name, None)
    background.add_task(jobs.run_pipeline, created["job_id"], case_id, safe_name)
    audit.record(
        investigator_id=investigator.id, role=investigator.role,
        action="DOCUMENT_UPLOAD", resource=f"{case_id}/{created['document_id']}",
        description=f"Uploaded {safe_name}",
    )
    return created


@router.get("/jobs/{job_id}/events")
def job_events(job_id: str, investigator: Investigator = Depends(get_current_investigator)):
    job = jobs.get_job(job_id)
    if not job:
        raise HTTPException(404, "job not found")
    return job


@router.get("/cases/{case_id}/documents")
def case_documents(case_id: str, investigator: Investigator = Depends(require_case_access)):
    items = jobs.list_case_documents(case_id)
    return {"items": items, "total": len(items)}


@router.get("/cases/{case_id}/documents/{document_id}/entities")
def document_entities(
    case_id: str,
    document_id: str,
    investigator: Investigator = Depends(require_case_access),
):
    """Return entity IDs extracted from a specific document.

    The uploaded evidence becomes the conceptual center of the network —
    the frontend uses these IDs to scope the radial graph so the document
    is ring 0 and all connected entities fan outward from it.
    """
    # Try live-upload registry first (set after GRAPH_UPDATE completes)
    entity_ids = graph_store.get_document_entity_ids(document_id)

    # Fall back to seed FIR documents for the demo case records
    if not entity_ids:
        entity_ids = jobs.get_document_entity_ids_from_seed(document_id, case_id)

    # Also register them now so subsequent graph queries can find them
    if entity_ids:
        graph_store.register_document_entities(document_id, entity_ids)

    return {
        "document_id": document_id,
        "case_id": case_id,
        "entity_ids": entity_ids,
        "total": len(entity_ids),
    }
