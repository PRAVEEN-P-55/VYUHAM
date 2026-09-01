"""Spec 6.4 -- Network Explorer graph query (collapsed edges + evidence)."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.deps import Investigator, require_case_access
from app.services import graph_store

router = APIRouter(tags=["graph"])


class GraphQuery(BaseModel):
    root_entity_id: str | None = None
    hops: int = Field(2, ge=1, le=4)
    relationship_types: list[str] | None = None
    time_from: str | None = None
    time_to: str | None = None


@router.post("/cases/{case_id}/graph/query")
def graph_query(
    case_id: str,
    body: GraphQuery,
    investigator: Investigator = Depends(require_case_access),
):
    return graph_store.query(
        case_id,
        root_entity_id=body.root_entity_id,
        hops=body.hops,
        rel_types=body.relationship_types,
        time_from=body.time_from,
        time_to=body.time_to,
    )
