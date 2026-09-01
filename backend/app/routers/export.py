"""Spec 6.12 -- Case Briefing export (structured JSON)."""
from __future__ import annotations

import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.deps import Investigator, require_case_access
from app.services import audit, centrality, graph_store
from app.services.db import query, query_one, row_to_dict

router = APIRouter(tags=["export"])

_PHONE_RE = re.compile(r"\b\d{10}\b")


class ExportBody(BaseModel):
    redact: bool = False


def _redact(text: str) -> str:
    return _PHONE_RE.sub("[REDACTED]", text or "")


@router.post("/cases/{case_id}/export")
def export_briefing(
    case_id: str, body: ExportBody, investigator: Investigator = Depends(require_case_access)
):
    case = row_to_dict(query_one("SELECT * FROM cases WHERE case_id = ?", (case_id,)))
    if not case:
        raise HTTPException(404, "case not found")

    influencers = centrality.top_influencers(case_id, limit=8)
    key_entities = [
        {
            "entity_id": i["entity_id"],
            "name": _redact(i["label"]) if body.redact and i["entity_type"] == "PERSON" else i["label"],
            "entity_type": i["entity_type"],
            "influence_reasons": i["influence_reasons"],
            "confidence": i["confidence"],
        }
        for i in influencers
    ]

    edges = graph_store.query(case_id).get("edges", [])
    edges.sort(key=lambda e: e["confidence"], reverse=True)
    key_relationships = [
        f"{graph_store.get_node(e['source_entity_id'])['label'] if graph_store.get_node(e['source_entity_id']) else e['source_entity_id']}"
        f" {e['relationship_type'].replace('_', ' ').lower()} "
        f"{graph_store.get_node(e['target_entity_id'])['label'] if graph_store.get_node(e['target_entity_id']) else e['target_entity_id']}"
        f" - {e['evidence_summary']['explanation']} ({e['review_status']}, conf {e['confidence']})"
        for e in edges[:12]
    ]
    if body.redact:
        key_relationships = [_redact(r) for r in key_relationships]

    gaps = [
        {
            "gap_id": g["gap_id"], "entity_id": g["entity_id"],
            "missing_evidence_type": g["missing_evidence_type"],
            "reason_it_matters": g["reason_it_matters"],
            "expected_priority": g["expected_priority"],
        }
        for g in query("SELECT * FROM evidence_gaps WHERE case_id = ?", (case_id,))
    ]

    next_steps = [
        f"Close evidence gap {g['gap_id']} ({g['missing_evidence_type']}) for {g['entity_id']}."
        for g in gaps[:5]
    ] or ["Review AI_SUGGESTED relationships and confirm or dispute each."]
    next_steps.append("Corroborate every AI_SUGGESTED link against the cited source evidence before charging decisions.")

    audit.record(
        investigator_id=investigator.id, role=investigator.role,
        action="CASE_EXPORT", resource=case_id,
        description=f"Exported briefing (redact={body.redact})",
    )

    return {
        "content": {
            "case_title": case["case_title"],
            "case_id": case_id,
            "status": case["status"],
            "district": case["district"],
            "generated_for": investigator.name,
            "redacted": body.redact,
            "key_entities": key_entities,
            "key_relationships_plain": key_relationships,
            "open_evidence_gaps": gaps,
            "recommended_next_steps": next_steps,
            "disclaimer": "AI-assisted analysis. No item here is a verdict; every link traces to cited evidence and carries a confidence and review status.",
        }
    }
