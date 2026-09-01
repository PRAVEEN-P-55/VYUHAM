"""Spec 6.8 -- modus-operandi similarity between incidents.

Six equally-weighted features (exactly the set in mo_ground_truth.jsonl):
entry_method, target_type, weapon_or_tool, escape_method,
distinctive_action, vehicle_description. score = matches / 6.
"""
from __future__ import annotations

from app.services.db import query, query_one, row_to_dict

FEATURES = (
    "entry_method", "target_type", "weapon_or_tool",
    "escape_method", "distinctive_action", "vehicle_description",
)


def _norm(v) -> str:
    return (v or "").strip().lower()


def compare(incident_a: dict, incident_b: dict) -> dict:
    matching, non_matching = [], []
    for f in FEATURES:
        a, b = _norm(incident_a.get(f)), _norm(incident_b.get(f))
        if a and b and a == b:
            matching.append(f)
        else:
            non_matching.append(f)
    return {
        "similarity_pct": round(len(matching) / len(FEATURES), 2),
        "matching_features": matching,
        "non_matching_features": non_matching,
    }


def similar_to(incident_id: str, min_similarity: float = 0.34, limit: int = 25) -> list[dict]:
    base = row_to_dict(query_one("SELECT * FROM incidents WHERE incident_id = ?", (incident_id,)))
    if not base:
        return []
    out = []
    for row in query("SELECT * FROM incidents WHERE incident_id != ?", (incident_id,)):
        other = dict(row)
        cmp = compare(base, other)
        if cmp["similarity_pct"] >= min_similarity:
            out.append({
                "incident_id": other["incident_id"],
                "case_id": other["case_id"],
                "crime_type": other["crime_type"],
                "incident_time": other["incident_time"],
                "similarity_pct": cmp["similarity_pct"],
                "matching_features": cmp["matching_features"],
                "non_matching_features": cmp["non_matching_features"],
                "review_status": other.get("review_status", "AI_SUGGESTED"),
            })
    out.sort(key=lambda x: x["similarity_pct"], reverse=True)
    return out[:limit]
