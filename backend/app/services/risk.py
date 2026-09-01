"""Composite risk score for an entity -- one defensible number, one sentence.

    score = curved(pattern signal) + centrality contribution + risk-indicator bump

Each pattern hit is weighted by  base_weight x confidence x recency_decay,
where recency is measured against the case's own most-recent activity (the
data is synthetic and dated 2024, so decaying against "now" would zero
everything out). Nothing here is a verdict: the score ships AI_SUGGESTED
with a confidence and a plain-language narrative.
"""
from __future__ import annotations

import math
from datetime import datetime
from functools import lru_cache

from app.services import centrality, graph_store, patterns
from app.services.db import query

# half-life ~45 days
_LAMBDA = math.log(2) / 45.0

_PATTERN_WEIGHT = {
    "STRUCTURING": 9.0,
    "CIRCULAR_FLOW": 9.0,
    "MULE_ACCOUNT": 8.0,
    "PRE_INCIDENT_CALL_BURST": 7.0,
    "COORDINATED_SEQUENCE": 8.0,
    "CROSS_CASE_RECURRENCE": 6.0,
    "UNUSUAL_TIMING": 4.0,
}
_DESCRIPTOR = {
    "STRUCTURING": "structuring sub-threshold transfers",
    "CIRCULAR_FLOW": "circular fund flow returning to origin",
    "MULE_ACCOUNT": "mule-account pass-through behaviour",
    "PRE_INCIDENT_CALL_BURST": "a call burst in the hours before an incident",
    "COORDINATED_SEQUENCE": "communication chained directly into money movement",
    "CROSS_CASE_RECURRENCE": "recurrence across multiple cases",
    "UNUSUAL_TIMING": "activity clustered at unusual hours",
}


def _dt(v) -> datetime | None:
    if not v:
        return None
    try:
        return datetime.fromisoformat(str(v).replace("Z", "").replace("+00:00", ""))
    except ValueError:
        return None


@lru_cache(maxsize=64)
def _case_reference_time(case_id: str) -> datetime | None:
    """Most recent activity timestamp we can see for the case."""
    latest: datetime | None = None
    for sql, col in (
        ("SELECT MAX(incident_time) t FROM incidents WHERE case_id = ?", "t"),
    ):
        row = query(sql, (case_id,))
        if row and (d := _dt(row[0][col])):
            latest = max(latest, d) if latest else d
    # widest net: latest valid_from across the case's relationships
    for rid in graph_store.case_relationship_ids(case_id):
        r = graph_store.relationship_row(rid)
        if r and (d := _dt(r.get("valid_to") or r.get("valid_from"))):
            latest = max(latest, d) if latest else d
    return latest


@lru_cache(maxsize=32)
def _case_patterns(case_id: str) -> tuple[dict, ...]:
    return tuple(patterns.detect_case(case_id))


@lru_cache(maxsize=1)
def _owned_by() -> dict:
    """person_id -> {their phone_ids + account_ids} (reverse ownership)."""
    from collections import defaultdict
    out: dict[str, set[str]] = defaultdict(set)
    for owned, person in graph_store._ownership_projection().items():
        out[person].add(owned)
    return {k: v for k, v in out.items()}


def _band(score: float) -> str:
    if score >= 75:
        return "CRITICAL"
    if score >= 50:
        return "HIGH"
    if score >= 25:
        return "MEDIUM"
    return "LOW"


def entity_risk(case_id: str, entity_id: str) -> dict:
    graph_store.ensure_loaded()
    canon = graph_store._canon(entity_id)
    node = graph_store.get_node(canon) or {}
    name = node.get("label", canon)
    ref = _case_reference_time(case_id)

    # an entity "participates" in a hypothesis if it -- or a phone/account it
    # owns -- appears in the hypothesis's entity list
    own = _owned_by().get(canon, set()) | {canon}
    hits = [h for h in _case_patterns(case_id) if own & set(h.get("entity_ids", []))]

    factors: list[dict] = []
    signal = 0.0
    for h in hits:
        ptype = h["pattern_type"]
        weight = _PATTERN_WEIGHT.get(ptype, 5.0)
        conf = float(h.get("confidence", 0.6))
        decay = _pattern_decay(h, ref)
        contribution = weight * conf * decay
        signal += contribution
        factors.append({
            "pattern_type": ptype,
            "descriptor": _DESCRIPTOR.get(ptype, ptype.lower().replace("_", " ")),
            "base_weight": weight,
            "recency_factor": round(decay, 2),
            "contribution": round(contribution, 2),
        })
    factors.sort(key=lambda f: f["contribution"], reverse=True)

    # curved 0..45 from pattern signal (saturating)
    pattern_component = 45.0 * (signal / (signal + 12.0)) if signal else 0.0

    infl = centrality.entity_influence(case_id, canon)
    centrality_component = min(40.0, (infl or {}).get("influence_score", 0.0) * 55.0)

    indicators = node.get("risk_indicators", []) or []
    indicator_component = min(15.0, 4.0 * len(indicators))

    score = round(min(100.0, pattern_component + centrality_component + indicator_component), 1)
    band = _band(score)

    return {
        "entity_id": canon,
        "risk_score": score,
        "risk_band": band,
        "components": {
            "pattern_signal": round(pattern_component, 1),
            "network_centrality": round(centrality_component, 1),
            "risk_indicators": round(indicator_component, 1),
        },
        "contributing_factors": factors[:5],
        "risk_indicators": indicators,
        "narrative": _narrative(name, score, band, factors, infl, indicators),
        "review_status": "AI_SUGGESTED",
        "confidence": round(0.5 + min(0.4, score / 250.0), 2),
    }


def _pattern_decay(h: dict, ref: datetime | None) -> float:
    if ref is None:
        return 1.0
    dates = [d for d in (_dt(x) for x in h.get("key_dates", [])) if d]
    if not dates:
        return 1.0
    age_days = max(0.0, (ref - max(dates)).total_seconds() / 86400.0)
    return math.exp(-_LAMBDA * age_days)


def _narrative(name, score, band, factors, infl, indicators) -> str:
    if not factors and not infl and not indicators:
        return f"{name} carries a {band} risk score of {score}. No suspicious patterns were triggered."

    top: list[str] = []
    for f in factors:
        if f["descriptor"] not in top:
            top.append(f["descriptor"])
        if len(top) == 3:
            break
    if len(top) == 1:
        driver = top[0]
    elif len(top) == 2:
        driver = f"{top[0]} and {top[1]}"
    elif len(top) >= 3:
        driver = f"{top[0]}, {top[1]}, and {top[2]}"
    else:
        driver = None

    parts = [f"{name} is assigned a {band} risk score of {score}"]
    if driver:
        parts.append(f", driven mainly by {driver}")
    if infl and infl.get("influence_reasons"):
        parts.append(
            f". The entity also ranks highly for network influence "
            f"({', '.join(infl['influence_reasons'][:2]).lower().replace('_', ' ')})"
        )
    if indicators:
        parts.append(f". Prior analysis flagged: {', '.join(indicators[:3]).replace('_', ' ')}")
    return "".join(parts).rstrip(".") + ". This is an investigative signal, not a determination."
