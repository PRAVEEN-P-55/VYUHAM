"""Authorised cross-case clue search."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.deps import Investigator, get_current_investigator
from app.services import graph_store

router = APIRouter(tags=["search"])


@router.get("/search/entities")
def search_entities(
    q: str = Query(..., min_length=2, max_length=120),
    entity_type: str | None = Query(None),
    limit: int = Query(40, ge=1, le=100),
    investigator: Investigator = Depends(get_current_investigator),
):
    authorised = None if investigator.is_superuser else investigator.case_ids
    items = graph_store.search_entities(q, authorised, entity_type, limit)
    return {"items": items, "total": len(items)}
