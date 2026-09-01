"""Spec 7.1 -- influencer ranking over the case subgraph.

Computes the four centralities and tags each top entity with an influence
reason drawn from the controlled vocabulary in spec 2.4.
"""
from __future__ import annotations

from functools import lru_cache

import networkx as nx

from app.services import graph_store

CENTRALITY_TYPES = ("EIGENVECTOR", "DEGREE", "BETWEENNESS", "PAGERANK", "KATZ", "CLOSENESS")
INFLUENCE_REASONS = (
    "ORG_LEADER", "HUB_OF_COMMUNICATION", "FINANCIER",
    "BROKER_BETWEEN_CLUSTERS", "RECRUITER",
)


def _safe_eigenvector(g: nx.Graph) -> dict:
    try:
        return nx.eigenvector_centrality_numpy(g)
    except Exception:
        try:
            return nx.eigenvector_centrality(g, max_iter=1000, tol=1e-4)
        except Exception:
            return nx.degree_centrality(g)


def _safe_katz(g: nx.Graph) -> dict:
    # alpha must be < 1 / largest eigenvalue; 0.1 is safe for graphs this size.
    try:
        return nx.katz_centrality_numpy(g, alpha=0.1)
    except Exception:
        try:
            return nx.katz_centrality(g, alpha=0.05, max_iter=2000, tol=1e-4)
        except Exception:
            return nx.degree_centrality(g)


def _safe_closeness(g: nx.Graph) -> dict:
    try:
        return nx.closeness_centrality(g)
    except Exception:
        return nx.degree_centrality(g)


@lru_cache(maxsize=64)
def compute(case_id: str) -> dict:
    g = graph_store.case_graph(case_id)
    if g.number_of_nodes() == 0:
        return {"scores": {}, "ranked": {}, "reasons": {}}

    scores = {
        "DEGREE": nx.degree_centrality(g),
        "PAGERANK": nx.pagerank(g, weight="weight"),
        "EIGENVECTOR": _safe_eigenvector(g),
        "BETWEENNESS": nx.betweenness_centrality(g, weight=None),
        "KATZ": _safe_katz(g),
        "CLOSENESS": _safe_closeness(g),
    }
    ranked = {
        ctype: [n for n, _ in sorted(s.items(), key=lambda kv: kv[1], reverse=True)]
        for ctype, s in scores.items()
    }

    # directed helpers for reason tagging
    member_of = graph_store.directed_case_graph(case_id, "MEMBER_OF")
    transfers = graph_store.directed_case_graph(case_id, "TRANSFERRED_TO")

    reasons: dict[str, list[str]] = {}

    def tag(entity_id: str, reason: str):
        reasons.setdefault(entity_id, [])
        if reason not in reasons[entity_id]:
            reasons[entity_id].append(reason)

    for n in ranked["EIGENVECTOR"][:5]:
        is_org = g.nodes[n].get("entity_type") == "ORGANIZATION"
        has_members = member_of.has_node(n) and member_of.in_degree(n) > 0
        if is_org or has_members:
            tag(n, "ORG_LEADER")
    for n in ranked["DEGREE"][:5]:
        if g.nodes[n].get("entity_type") == "PHONE":
            tag(n, "HUB_OF_COMMUNICATION")
    for n in ranked["BETWEENNESS"][:5]:
        tag(n, "BROKER_BETWEEN_CLUSTERS")
    if transfers.number_of_nodes():
        for n, _ in sorted(transfers.in_degree(), key=lambda kv: kv[1], reverse=True)[:3]:
            tag(n, "FINANCIER")
    if member_of.number_of_nodes():
        for n, d in sorted(member_of.out_degree(), key=lambda kv: kv[1], reverse=True)[:3]:
            if d >= 2:
                tag(n, "RECRUITER")

    return {"scores": scores, "ranked": ranked, "reasons": reasons}


def top_influencers(case_id: str, limit: int = 15) -> list[dict]:
    data = compute(case_id)
    if not data["ranked"]:
        return []
    # combined score = mean of normalised ranks
    agg: dict[str, float] = {}
    for ctype, order in data["ranked"].items():
        n = len(order) or 1
        for rank, node in enumerate(order):
            agg[node] = agg.get(node, 0.0) + (1 - rank / n)
    ordered = sorted(agg.items(), key=lambda kv: kv[1], reverse=True)[:limit]
    out = []
    for node, raw in ordered:
        node_meta = graph_store.get_node(node) or {}
        out.append({
            "entity_id": node,
            "entity_type": node_meta.get("entity_type", "UNKNOWN"),
            "label": node_meta.get("label", node),
            "influence_score": round(raw / len(data["ranked"]), 3),
            "centrality": {
                c: round(data["scores"][c].get(node, 0.0), 4) for c in data["scores"]
            },
            "influence_reasons": data["reasons"].get(node, []),
            "review_status": "AI_SUGGESTED",
            "confidence": round(min(0.95, 0.55 + raw / (2 * len(data["ranked"]))), 2),
        })
    return out


def entity_influence(case_id: str, entity_id: str) -> dict | None:
    entity_id = graph_store._canon(entity_id) if graph_store._state else entity_id
    for row in top_influencers(case_id, limit=9999):
        if row["entity_id"] == entity_id:
            return row
    return None
