"""Spec 7.4 / 6.9 -- identity resolution candidate generation + scoring.

Fuzzy name match across full_name / alias / full_name_transliterated,
boosted by matching date_of_birth and district. Signal vocabulary mirrors
identity_ground_truth.xlsx's `expected_signals`.
"""
from __future__ import annotations

from rapidfuzz import fuzz

from app.services import graph_store
from app.services.db import query, query_one, row_to_dict


def _names(p: dict) -> list[str]:
    return [
        str(v) for v in (
            p.get("full_name"), p.get("alias"),
            p.get("full_name_transliterated"), p.get("full_name_native"),
        ) if v
    ]


def _name_similarity(a: dict, b: dict) -> float:
    best = 0.0
    for na in _names(a):
        for nb in _names(b):
            best = max(best, fuzz.token_sort_ratio(na, nb) / 100.0,
                       fuzz.partial_ratio(na.lower(), nb.lower()) / 100.0)
    return round(best, 3)


def score_pair(a: dict, b: dict) -> dict:
    name_sim = _name_similarity(a, b)
    supporting, conflicting = [], []

    if name_sim >= 0.82:
        supporting.append("name/transliteration similarity")
    dob_a, dob_b = a.get("date_of_birth"), b.get("date_of_birth")
    if dob_a and dob_b:
        (supporting if dob_a == dob_b else conflicting).append(
            "matching DOB" if dob_a == dob_b else "different DOB"
        )
    dist_a, dist_b = a.get("district"), b.get("district")
    if dist_a and dist_b:
        (supporting if dist_a == dist_b else conflicting).append(
            "matching district" if dist_a == dist_b else "different district"
        )
    if a.get("address") and b.get("address") and a["address"] != b["address"]:
        conflicting.append("different address period")

    conf = name_sim
    if "matching DOB" in supporting:
        conf = min(1.0, conf + 0.15)
    if "matching district" in supporting:
        conf = min(1.0, conf + 0.05)
    if "different DOB" in conflicting:
        conf -= 0.25

    same_person = (
        (name_sim >= 0.84 and ("matching DOB" in supporting or "matching district" in supporting))
        or name_sim >= 0.93
    ) and "different DOB" not in conflicting

    return {
        "match_confidence": round(max(0.0, min(1.0, conf)), 2),
        "supporting": supporting,
        "conflicting": conflicting,
        "same_person": same_person,
        "name_similarity": name_sim,
    }


def _case_person_ids(case_id: str) -> set[str]:
    ids: set[str] = set()
    for rid in graph_store.case_relationship_ids(case_id):
        r = graph_store.relationship_row(rid)
        if not r:
            continue
        for eid, etype in ((r["source_entity_id"], r["source_entity_type"]),
                           (r["target_entity_id"], r["target_entity_type"])):
            if etype == "PERSON":
                ids.add(eid)
    for f in query("SELECT suspect_person_ids, victim_person_ids FROM firs WHERE case_id = ?", (case_id,)):
        for col in ("suspect_person_ids", "victim_person_ids"):
            for pid in (f[col] and __import__("json").loads(f[col])) or []:
                ids.add(pid)
    return ids


def candidates_for_case(case_id: str, threshold: float = 0.7, limit: int = 40) -> list[dict]:
    person_ids = _case_person_ids(case_id)
    if not person_ids:
        return []
    anchors = [
        row_to_dict(query_one("SELECT * FROM people WHERE person_id = ?", (pid,)))
        for pid in person_ids
    ]
    anchors = [a for a in anchors if a]
    all_people = [dict(r) for r in query("SELECT * FROM people")]

    seen: set[tuple[str, str]] = set()
    out: list[dict] = []
    for a in anchors:
        for b in all_people:
            if a["person_id"] == b["person_id"]:
                continue
            key = tuple(sorted((a["person_id"], b["person_id"])))
            if key in seen:
                continue
            s = score_pair(a, b)
            if s["name_similarity"] < threshold:
                continue
            seen.add(key)
            out.append({
                "candidate_id": f"IDC_{key[0]}_{key[1]}",
                "record_a": _person_card(a),
                "record_b": _person_card(b),
                "match_confidence": s["match_confidence"],
                "supporting": s["supporting"],
                "conflicting": s["conflicting"],
                "recommended_action": "ACCEPT" if s["same_person"] else "REJECT",
            })
    out.sort(key=lambda c: c["match_confidence"], reverse=True)
    return out[:limit]


def _person_card(p: dict) -> dict:
    return {
        "person_id": p["person_id"],
        "full_name": p.get("full_name"),
        "alias": p.get("alias"),
        "full_name_transliterated": p.get("full_name_transliterated"),
        "date_of_birth": p.get("date_of_birth"),
        "district": p.get("district"),
        "state": p.get("state"),
        "language": p.get("language"),
    }


def candidate_pair_ids(candidate_id: str) -> tuple[str, str] | None:
    parts = candidate_id.split("_")
    if len(parts) >= 3:
        return parts[1], parts[2]
    return None
