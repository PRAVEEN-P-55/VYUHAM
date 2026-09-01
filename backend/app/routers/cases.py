"""Spec 6.11 (registry) + 6.2 (overview summary)."""
from __future__ import annotations

from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Query

from app.common import Page
from app.deps import Investigator, get_current_investigator, require_case_access
from app.services import centrality, graph_store, risk
from app.services.db import query, query_one, row_to_dict

router = APIRouter(tags=["cases"])

_PRIORITY_RANK = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}
_GAP_TITLES = {
    "MISSING_LOCATION_DATA": "Missing location data",
    "UNVERIFIED_ACCOUNT": "Unverified bank account",
    "MISSING_INCIDENT_LINK": "Missing incident link",
    "INCOMPLETE_WITNESS_DESCRIPTION": "Incomplete witness description",
    "NO_DEVICE_RECORD": "No device record",
}


@router.get("/cases")
def list_cases(
    page: Page = Depends(),
    status: str | None = Query(None),
    district: str | None = Query(None),
    search: str | None = Query(None),
    investigator: Investigator = Depends(get_current_investigator),
):
    where, params = [], []
    if status:
        where.append("status = ?")
        params.append(status)
    if district:
        where.append("district = ?")
        params.append(district)
    if search:
        where.append("(case_title LIKE ? OR case_id LIKE ? OR investigating_officer LIKE ?)")
        params += [f"%{search}%"] * 3
    if not investigator.is_superuser:
        ids = investigator.case_ids or ["__none__"]
        where.append(f"case_id IN ({','.join('?' * len(ids))})")
        params += ids

    clause = ("WHERE " + " AND ".join(where)) if where else ""
    total = query(f"SELECT COUNT(*) c FROM cases {clause}", params)[0]["c"]
    rows = query(
        f"SELECT case_id, case_title, district, investigating_officer, opened_date, status, "
        f"review_status FROM cases {clause} ORDER BY case_id LIMIT ? OFFSET ?",
        [*params, page.page_size, page.offset],
    )
    return page.envelope([dict(r) for r in rows], total)


@router.get("/cases/{case_id}/summary")
def case_summary(case_id: str, investigator: Investigator = Depends(require_case_access)):
    case = row_to_dict(query_one("SELECT * FROM cases WHERE case_id = ?", (case_id,)))
    if not case:
        raise HTTPException(404, "Case not found")

    graph_store.ensure_loaded()
    rel_ids = graph_store.case_relationship_ids(case_id)
    rel_rows = [graph_store.relationship_row(r) for r in rel_ids]
    rel_rows = [r for r in rel_rows if r]

    entities = set()
    per_day: dict[str, dict[str, int]] = defaultdict(lambda: {"relationships_added": 0, "evidence_added": 0})
    for r in rel_rows:
        entities.add(r["source_entity_id"])
        entities.add(r["target_entity_id"])
        day = str(r.get("valid_from") or "")[:10]
        if day:
            per_day[day]["relationships_added"] += 1
            if r.get("evidence_id"):
                per_day[day]["evidence_added"] += 1

    evidence_count = query(
        "SELECT COUNT(*) c FROM evidence WHERE case_id = ?", (case_id,)
    )[0]["c"]
    gap_rows = query("SELECT * FROM evidence_gaps WHERE case_id = ?", (case_id,))
    gaps = sorted(
        (dict(g) for g in gap_rows),
        key=lambda g: _PRIORITY_RANK.get(g.get("expected_priority"), 3),
    )

    # keep the activity window near the case's own lifetime -- ownership edges
    # carry decade-old valid_from dates that would otherwise swamp the chart.
    opened = str(case.get("opened_date") or "")[:10]
    cutoff = (opened[:4] and f"{int(opened[:4]) - 1}-01-01") or "0000"
    timeseries = [
        {"date": d, **v} for d, v in sorted(per_day.items()) if d and d >= cutoff
    ]

    follow_ups = [
        {
            "gap_id": g["gap_id"],
            "entity_id": g["entity_id"],
            "issue_title": _GAP_TITLES.get(g["missing_evidence_type"], g["missing_evidence_type"]),
            "reason": g["reason_it_matters"],
            "status": "OPEN",
            "severity": g["expected_priority"],
        }
        for g in gaps[:5]
    ]

    return {
        "case": {
            "case_id": case["case_id"],
            "case_title": case["case_title"],
            "district": case["district"],
            "state": case["state"],
            "status": case["status"],
            "opened_date": case["opened_date"],
            "review_status": case["review_status"],
        },
        "kpis": {
            "entities_indexed": len(entities),
            "evidence_records": evidence_count,
            "relationships": len(rel_rows),
            "open_evidence_gaps": len(gap_rows),
        },
        "activity_timeseries": timeseries,
        "priority_follow_ups": follow_ups,
    }


@router.get("/cases/{case_id}/influencers")
def case_influencers(
    case_id: str,
    limit: int = Query(15, ge=1, le=50),
    investigator: Investigator = Depends(require_case_access),
):
    """Spec 7.1 -- ranked influencers with centrality + influence reasons + risk."""
    items = centrality.top_influencers(case_id, limit=limit)
    for row in items:
        r = risk.entity_risk(case_id, row["entity_id"])
        row["risk_score"] = r["risk_score"]
        row["risk_band"] = r["risk_band"]
    return {"items": items}
