"""Spec 6.8 -- MO comparison for an incident."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from app.deps import Investigator, get_current_investigator
from app.services import mo_similarity

router = APIRouter(tags=["mo"])


@router.get("/incidents/{incident_id}/similar-mo")
def similar_mo(incident_id: str, investigator: Investigator = Depends(get_current_investigator)):
    return {"items": mo_similarity.similar_to(incident_id)}
