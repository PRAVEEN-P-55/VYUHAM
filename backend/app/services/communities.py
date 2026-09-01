"""Spec 7.2 -- community detection (Louvain) over the case subgraph."""
from __future__ import annotations

from functools import lru_cache

import networkx as nx

from app.services import graph_store

try:
    import community as community_louvain  # python-louvain

    _HAVE_LOUVAIN = True
except Exception:  # pragma: no cover
    _HAVE_LOUVAIN = False


@lru_cache(maxsize=64)
def detect(case_id: str) -> dict[str, int]:
    g = graph_store.case_graph(case_id)
    if g.number_of_nodes() == 0:
        return {}
    if _HAVE_LOUVAIN:
        return community_louvain.best_partition(g, weight="weight", random_state=42)
    communities = nx.algorithms.community.greedy_modularity_communities(g, weight="weight")
    return {n: idx for idx, comm in enumerate(communities) for n in comm}


def community_of(case_id: str, entity_id: str) -> int | None:
    return detect(case_id).get(graph_store._canon(entity_id))


def members(case_id: str, entity_id: str, limit: int = 12) -> list[str]:
    part = detect(case_id)
    cid = part.get(graph_store._canon(entity_id))
    if cid is None:
        return []
    return [n for n, c in part.items() if c == cid and n != entity_id][:limit]
