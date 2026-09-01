"""Spec 6.9 -- identity resolution review + reversible actions."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.deps import Investigator, require_case_access
from app.services import audit, graph_store, identity_resolution
from app.services.db import execute, query_one

router = APIRouter(tags=["identity"])


class ActionBody(BaseModel):
    action: str  # ACCEPT | DEFER | REJECT
    investigator_id: str | None = None


@router.get("/cases/{case_id}/resolution-candidates")
def resolution_candidates(
    case_id: str, investigator: Investigator = Depends(require_case_access)
):
    return {"items": identity_resolution.candidates_for_case(case_id)}


@router.post("/cases/{case_id}/resolution-candidates/{candidate_id}/action")
def resolution_action(
    case_id: str,
    candidate_id: str,
    body: ActionBody,
    investigator: Investigator = Depends(require_case_access),
):
    action = body.action.upper()
    if action not in {"ACCEPT", "DEFER", "REJECT"}:
        raise HTTPException(400, "action must be ACCEPT, DEFER or REJECT")
    pair = identity_resolution.candidate_pair_ids(candidate_id)
    if not pair:
        raise HTTPException(400, "malformed candidate_id")

    inv_id = body.investigator_id or investigator.id
    execute(
        "INSERT INTO identity_resolution_actions (candidate_id, action, investigator_id) VALUES (?,?,?)",
        (candidate_id, action, inv_id),
    )
    if action == "ACCEPT":
        canonical, other = pair
        graph_store.merge_nodes(canonical, other)
    elif action == "REJECT":
        graph_store.unmerge_nodes(pair[1])

    audit.record(
        investigator_id=inv_id, role=investigator.role,
        action=f"IDENTITY_{action}", resource=f"{case_id}/{candidate_id}",
        description=f"Identity resolution {action} on {' <-> '.join(pair)}",
    )
    return {"candidate_id": candidate_id, "action": action, "reversible": True}


@router.post("/cases/{case_id}/resolution-candidates/{candidate_id}/reverse")
def reverse_action(
    case_id: str,
    candidate_id: str,
    investigator: Investigator = Depends(require_case_access),
):
    last = query_one(
        "SELECT * FROM identity_resolution_actions WHERE candidate_id = ? AND reversed = 0 "
        "ORDER BY id DESC LIMIT 1", (candidate_id,),
    )
    if not last:
        raise HTTPException(404, "no action to reverse")
    execute("UPDATE identity_resolution_actions SET reversed = 1 WHERE id = ?", (last["id"],))
    pair = identity_resolution.candidate_pair_ids(candidate_id)
    if pair and last["action"] == "ACCEPT":
        graph_store.unmerge_nodes(pair[1])
    audit.record(
        investigator_id=investigator.id, role=investigator.role,
        action="IDENTITY_REVERSE", resource=f"{case_id}/{candidate_id}",
        description=f"Reversed {last['action']}",
    )
    return {"candidate_id": candidate_id, "reversed_action": last["action"]}
