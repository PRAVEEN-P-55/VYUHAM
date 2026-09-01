"""Enhancement-layer endpoints (roadmap Phase 1-3).

    POST /cases/{id}/graph/path        -- how are two entities connected?
    GET  /cases/{id}/suggested-links   -- likely-but-unrecorded links (AI_SUGGESTED)
    GET  /cases/{id}/persons-of-interest
    GET  /cases/{id}/entities/near     -- geospatial radius
    GET  /cases/{id}/entities/{id}/risk
    GET  /analytics/capabilities       -- self-describing analytics surface
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.deps import Investigator, get_current_investigator, require_case_access
from app.services import analytics_ext, graph_store, risk

router = APIRouter(tags=["analytics"])


class PathQuery(BaseModel):
    source_entity_id: str
    target_entity_id: str
    max_hops: int = Field(4, ge=1, le=6)
    max_paths: int = Field(5, ge=1, le=15)


@router.post("/cases/{case_id}/graph/path")
def connection_path(
    case_id: str, body: PathQuery, investigator: Investigator = Depends(require_case_access)
):
    return analytics_ext.connection_paths(
        case_id, body.source_entity_id, body.target_entity_id,
        max_hops=body.max_hops, max_paths=body.max_paths,
    )


@router.get("/cases/{case_id}/suggested-links")
def suggested_links(
    case_id: str,
    limit: int = Query(15, ge=1, le=50),
    investigator: Investigator = Depends(require_case_access),
):
    return {"items": analytics_ext.suggested_links(case_id, limit=limit)}


@router.get("/cases/{case_id}/persons-of-interest")
def persons_of_interest(
    case_id: str,
    limit: int = Query(12, ge=1, le=50),
    investigator: Investigator = Depends(require_case_access),
):
    return {"items": analytics_ext.persons_of_interest(case_id, limit=limit)}


@router.get("/cases/{case_id}/entities/near")
def entities_near(
    case_id: str,
    location_id: str | None = Query(None),
    lat: float | None = Query(None),
    lon: float | None = Query(None),
    radius_m: float = Query(500.0, ge=10, le=50_000),
    limit: int = Query(50, ge=1, le=200),
    investigator: Investigator = Depends(require_case_access),
):
    return analytics_ext.entities_near(
        case_id, location_id=location_id, lat=lat, lon=lon,
        radius_m=radius_m, limit=limit,
    )


@router.get("/cases/{case_id}/entities/{entity_id}/risk")
def entity_risk(
    case_id: str, entity_id: str, investigator: Investigator = Depends(require_case_access)
):
    if not graph_store.get_node(entity_id):
        raise HTTPException(404, "Entity not found")
    return risk.entity_risk(case_id, entity_id)


@router.get("/analytics/capabilities")
def capabilities(investigator: Investigator = Depends(get_current_investigator)):
    return analytics_ext.capabilities()
