"""Spec 6.3 -- Document Intake (upload + job events + case document list)."""
from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile

from app.deps import Investigator, get_current_investigator, require_case_access
from app.services import audit, jobs

router = APIRouter(tags=["documents"])


@router.post("/cases/{case_id}/documents", status_code=202)
async def upload_document(
    case_id: str,
    background: BackgroundTasks,
    file: UploadFile = File(...),
    investigator: Investigator = Depends(require_case_access),
):
    created = jobs.create_job(case_id, file.filename or "upload.bin", None)
    background.add_task(jobs.run_pipeline, created["job_id"], case_id, file.filename or "")
    audit.record(
        investigator_id=investigator.id, role=investigator.role,
        action="DOCUMENT_UPLOAD", resource=f"{case_id}/{created['document_id']}",
        description=f"Uploaded {file.filename}",
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
