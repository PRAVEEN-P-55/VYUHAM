"""Spec 6.6 -- unified case timeline."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from app.deps import Investigator, require_case_access
from app.services import timeline as timeline_svc

router = APIRouter(tags=["timeline"])


@router.get("/cases/{case_id}/timeline")
def case_timeline(case_id: str, investigator: Investigator = Depends(require_case_access)):
    return {"items": timeline_svc.build(case_id)}
