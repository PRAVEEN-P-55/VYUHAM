"""Spec 6.7 -- suspicious-pattern hypotheses."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.deps import Investigator, require_case_access
from app.services import patterns as pattern_svc

router = APIRouter(tags=["patterns"])


@router.get("/cases/{case_id}/patterns")
def case_patterns(
    case_id: str,
    type: str | None = Query(None, description="filter to one pattern_type"),
    cross_case: bool | None = Query(None),
    investigator: Investigator = Depends(require_case_access),
):
    items = pattern_svc.detect_case(case_id)
    if type:
        items = [i for i in items if i["pattern_type"] == type]
    if cross_case is not None:
        items = [i for i in items if i["cross_case"] is cross_case]
    return {"items": items}
