"""Spec 6.5 -- Entity Profile drawer, relationship detail, document mentions."""
from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException

from app.deps import Investigator, require_case_access
from app.services import centrality, communities, graph_store, risk
from app.services.db import query, query_one, row_to_dict

router = APIRouter(tags=["entities"])


@router.get("/cases/{case_id}/entities/{entity_id}/summary")
def entity_summary(
    case_id: str, entity_id: str, investigator: Investigator = Depends(require_case_access)
):
    node = graph_store.get_node(entity_id)
    if not node:
        raise HTTPException(404, "Entity not found")

    canon = node["entity_id"]
    seed = row_to_dict(query_one(
        "SELECT * FROM entity_summaries WHERE entity_id = ?", (canon,)
    ))
    influence = centrality.entity_influence(case_id, canon)

    identity_fields = _identity_fields(canon, node["entity_type"])
    connections = _evidence_connections(case_id, canon)

    summary_text = seed["summary_text"] if seed else _templated_summary(node, identity_fields)
    confidence = float(seed["confidence"]) if seed else round(
        (influence or {}).get("confidence", 0.7), 2
    )

    return {
        "entity_id": canon,
        "entity_type": node["entity_type"],
        "name": node["label"],
        "aliases": _aliases(canon, node["entity_type"]),
        "identity_fields": identity_fields,
        "summary_text": summary_text,
        "confidence": confidence,
        "review_status": "AI_SUGGESTED" if not seed else "AI_SUGGESTED",
        "risk_indicators": node.get("risk_indicators", []),
        "risk": risk.entity_risk(case_id, canon),
        "influence": influence,
        "community_peers": communities.members(case_id, canon),
        "evidence_connections": connections,
    }


@router.get("/cases/{case_id}/relationships/{relationship_id}")
def relationship_detail(
    case_id: str, relationship_id: str, investigator: Investigator = Depends(require_case_access)
):
    edge = graph_store.collapsed_edge_by_relationship(case_id, relationship_id)
    if not edge:
        raise HTTPException(404, "Relationship not found in this case")
    return edge


@router.get("/cases/{case_id}/entities/{entity_id}/document-mentions")
def document_mentions(
    case_id: str, entity_id: str, investigator: Investigator = Depends(require_case_access)
):
    node = graph_store.get_node(entity_id)
    canon = node["entity_id"] if node else entity_id
    rows = query(
        "SELECT e.evidence_id, e.text_excerpt, e.bounding_box, e.document_id, d.image_path "
        "FROM evidence e JOIN documents d ON d.document_id = e.document_id "
        "WHERE e.case_id = ? AND e.bounding_box IS NOT NULL", (case_id,),
    )
    label = node["label"] if node else ""
    seen: set[tuple] = set()
    out = []
    for r in rows:
        excerpt = r["text_excerpt"] or ""
        if not (canon in excerpt or (label and label in excerpt)):
            continue
        bbox = json.loads(r["bounding_box"])
        key = (r["document_id"], excerpt)
        if key in seen:
            continue
        seen.add(key)
        out.append({
            "document_id": r["document_id"],
            "image_path": r["image_path"],
            "bounding_box": bbox,
            "matched_text": excerpt,
        })
        if len(out) >= 25:
            break
    return out


# ---------------------------------------------------------------------------
def _aliases(entity_id: str, etype: str) -> list[str]:
    if etype != "PERSON":
        return []
    p = row_to_dict(query_one("SELECT * FROM people WHERE person_id = ?", (entity_id,)))
    if not p:
        return []
    return [v for v in (p.get("alias"), p.get("full_name_native"),
                        p.get("full_name_transliterated")) if v]


def _identity_fields(entity_id: str, etype: str) -> dict:
    fields: dict[str, list] = {
        "phones": [], "vehicles": [], "accounts": [], "linked_firs": [], "related_cases": []
    }
    if etype == "PERSON":
        fields["phones"] = [
            r["phone_number"] for r in query(
                "SELECT phone_number FROM phone_ownership WHERE person_id = ?", (entity_id,))
        ]
        fields["vehicles"] = [
            r["registration_number"] for r in query(
                "SELECT registration_number FROM vehicles WHERE owner_person_id = ?", (entity_id,))
        ]
        fields["accounts"] = [
            r["account_id"] for r in query(
                "SELECT account_id FROM bank_accounts WHERE person_id = ?", (entity_id,))
        ]
        firs = query(
            "SELECT fir_id, case_id FROM firs WHERE suspect_person_ids LIKE ? OR victim_person_ids LIKE ?",
            (f'%{entity_id}%', f'%{entity_id}%'),
        )
        fields["linked_firs"] = [r["fir_id"] for r in firs]
    fields["related_cases"] = list(graph_store._entity_case_ids(entity_id))
    return fields


def _evidence_connections(case_id: str, entity_id: str) -> list[dict]:
    out = []
    for rid in graph_store.case_relationship_ids(case_id):
        r = graph_store.relationship_row(rid)
        if not r or entity_id not in (r["source_entity_id"], r["target_entity_id"]):
            continue
        ev = graph_store.evidence_for(r.get("evidence_id"))
        other = r["target_entity_id"] if r["source_entity_id"] == entity_id else r["source_entity_id"]
        other_node = graph_store.get_node(other) or {"label": other}
        out.append({
            "chain": f"{entity_id} - {r['relationship_type']} - {other_node.get('label', other)}"
                     + (f" - {ev['source_record_id']}" if ev else ""),
            "source_type": ev["source_type"] if ev else None,
            "timestamp": r.get("valid_from"),
            "confidence": r.get("confidence"),
            "evidence_id": r.get("evidence_id"),
        })
        if len(out) >= 50:
            break
    return out


def _templated_summary(node: dict, identity_fields: dict) -> str:
    bits = [f"{node['label']} ({node['entity_id']}) is a {node['entity_type'].lower()}"]
    rc = identity_fields.get("related_cases") or []
    if rc:
        bits.append(f"linked across {len(rc)} case record(s)")
    if identity_fields.get("phones"):
        bits.append(f"associated with {len(identity_fields['phones'])} phone number(s)")
    if identity_fields.get("accounts"):
        bits.append(f"{len(identity_fields['accounts'])} bank account(s)")
    return ", ".join(bits) + ". Links remain investigative associations, not conclusions."
