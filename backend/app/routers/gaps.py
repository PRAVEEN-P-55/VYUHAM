"""Spec 6.10 -- evidence gaps (pass-through of evidence_gaps for seed cases)."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from app.deps import Investigator, require_case_access
from app.services.db import query

router = APIRouter(tags=["gaps"])

_RANK = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}


@router.get("/cases/{case_id}/evidence-gaps")
def evidence_gaps(case_id: str, investigator: Investigator = Depends(require_case_access)):
    rows = [dict(r) for r in query("SELECT * FROM evidence_gaps WHERE case_id = ?", (case_id,))]
    rows.sort(key=lambda g: _RANK.get(g.get("expected_priority"), 3))
    items = [
        {
            "gap_id": g["gap_id"],
            "entity_id": g["entity_id"],
            "missing_evidence_type": g["missing_evidence_type"],
            "reason_it_matters": g["reason_it_matters"],
            "time_from": g["time_from"],
            "time_to": g["time_to"],
            "expected_priority": g["expected_priority"],
        }
        for g in rows
    ]
    return {"items": items}
