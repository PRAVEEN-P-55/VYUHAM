"""Enhancement layer -- capabilities the baseline doesn't have.

All in-process over the same NetworkX case subgraph the rest of the API
uses. Nothing here is a verdict: predicted links ship as AI_SUGGESTED with
a confidence, and every path hop cites the evidence behind it.

    connection_paths(case_id, a, b)      -> how are these two linked?
    suggested_links(case_id)             -> likely-but-unrecorded links
    persons_of_interest(case_id)         -> peripheral figures worth a look
    entities_near(case_id, ...)          -> everything within N metres
    capabilities()                       -> self-describing algorithm list
"""
from __future__ import annotations

import math

import networkx as nx

from app.services import centrality, communities, graph_store
from app.services.db import jcol, query, query_one, row_to_dict

_EARTH_M = 6_371_000


def _f(v) -> float | None:
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _haversine(lat1, lon1, lat2, lon2) -> float:
    lat1, lon1, lat2, lon2 = float(lat1), float(lon1), float(lat2), float(lon2)
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * _EARTH_M * math.asin(math.sqrt(a))


# ---------------------------------------------------------------------------
# 1. connection path  (POLE: "how are these two connected?")
# ---------------------------------------------------------------------------
def connection_paths(
    case_id: str, source_id: str, target_id: str, max_hops: int = 4, max_paths: int = 5
) -> dict:
    g = graph_store.case_graph(case_id)
    s, t = graph_store._canon(source_id), graph_store._canon(target_id)

    if s == t:
        return {"found": False, "reason": "source and target are the same entity", "paths": []}
    if not g.has_node(s) or not g.has_node(t):
        missing = [e for e, ok in ((source_id, g.has_node(s)), (target_id, g.has_node(t))) if not ok]
        return {"found": False, "reason": f"not in this case graph: {', '.join(missing)}", "paths": []}

    try:
        raw = list(nx.all_shortest_paths(g, s, t))
    except nx.NetworkXNoPath:
        return {"found": False, "reason": "no connecting path within this case",
                "shortest_length": None, "paths": []}

    actual_len = len(raw[0]) - 1 if raw else None
    if actual_len and actual_len > max_hops:
        return {
            "found": False,
            "reason": f"shortest connection is {actual_len} hops (limit {max_hops}); "
                      f"raise max_hops to see it",
            "shortest_length": actual_len,
            "paths": [],
        }

    paths = []
    for chain in raw:
        if len(chain) - 1 > max_hops:
            continue
        hops = []
        for a, b in zip(chain, chain[1:]):
            between = graph_store.edges_between(case_id, a, b)
            hops.append({
                "source_entity_id": a,
                "target_entity_id": b,
                "edges": between,
                "relationship_types": sorted({e["relationship_type"] for e in between}),
            })
        paths.append({
            "length": len(chain) - 1,
            "entity_ids": chain,
            "nodes": [graph_store.node_public(n) for n in chain],
            "hops": hops,
        })
        if len(paths) >= max_paths:
            break

    return {
        "found": bool(paths),
        "reason": None if paths else f"shortest path exceeds {max_hops} hops",
        "shortest_length": paths[0]["length"] if paths else None,
        "paths": paths,
    }


# ---------------------------------------------------------------------------
# 2. suggested links  (ROXANNE: predict, don't just describe)
# ---------------------------------------------------------------------------
def suggested_links(case_id: str, limit: int = 15) -> list[dict]:
    g = graph_store.case_graph(case_id)
    if g.number_of_nodes() < 4 or g.number_of_edges() < 3:
        return []

    part = communities.detect(case_id)

    # Score non-adjacent pairs that already share neighbours. Prefer >= 2
    # shared (strong signal); fall back to >= 1 on sparse cases. Capped so
    # dense cases stay tractable.
    def _candidates(min_shared: int) -> list[tuple[str, str]]:
        out: list[tuple[str, str]] = []
        nodes = list(g.nodes())
        for i, u in enumerate(nodes):
            nu = set(g[u])
            for v in nodes[i + 1:]:
                if g.has_edge(u, v):
                    continue
                if len(nu & set(g[v])) >= min_shared:
                    out.append((u, v))
                    if len(out) >= 6000:
                        return out
        return out

    candidates = _candidates(2) or _candidates(1)
    if not candidates:
        return []
    candidates = candidates[:6000]

    aa = {frozenset((u, v)): s for u, v, s in nx.adamic_adar_index(g, candidates)}
    jc = {frozenset((u, v)): s for u, v, s in nx.jaccard_coefficient(g, candidates)}
    aa_max = max(aa.values()) or 1.0

    scored = []
    for pair in candidates:
        key = frozenset(pair)
        u, v = pair
        aa_n = aa.get(key, 0.0) / aa_max
        jac = jc.get(key, 0.0)
        score = round(0.6 * aa_n + 0.4 * jac, 3)
        if score < 0.05:
            continue
        shared = sorted(set(g[u]) & set(g[v]))
        same_comm = part.get(u) is not None and part.get(u) == part.get(v)
        scored.append({
            "pair_id": f"SL_{min(u, v)}_{max(u, v)}",
            "source_entity_id": u,
            "target_entity_id": v,
            "nodes": [graph_store.node_public(u), graph_store.node_public(v)],
            "score": score,
            "shared_connections": shared[:10],
            "shared_count": len(shared),
            "same_community": same_comm,
            "reason": (
                f"{graph_store.node_public(u)['label']} and "
                f"{graph_store.node_public(v)['label']} share {len(shared)} connection(s) "
                f"({', '.join(shared[:3])}{'…' if len(shared) > 3 else ''}) "
                f"but have no recorded link"
                + (" and sit in the same detected sub-group" if same_comm else "")
                + "."
            ),
            "review_status": "AI_SUGGESTED",
            "confidence": round(min(0.9, 0.4 + score / 2), 2),
        })
    scored.sort(key=lambda r: r["score"], reverse=True)
    return scored[:limit]


# ---------------------------------------------------------------------------
# 3. persons of interest  (POLE: peripheral figures)
# ---------------------------------------------------------------------------
def persons_of_interest(case_id: str, limit: int = 12) -> list[dict]:
    g = graph_store.case_graph(case_id)
    if g.number_of_nodes() == 0:
        return []

    named_suspects: set[str] = set()
    for r in query("SELECT suspect_person_ids FROM firs WHERE case_id = ?", (case_id,)):
        for pid in (jcol(r["suspect_person_ids"]) or []):
            named_suspects.add(graph_store._canon(pid))
    if not named_suspects:
        # fall back: entities that carry a risk indicator
        named_suspects = {
            n for n in g.nodes()
            if (graph_store.get_node(n) or {}).get("risk_indicators")
        }
    if not named_suspects:
        return []

    def _scan(min_suspects: int) -> list[dict]:
        rows: list[dict] = []
        for n in g.nodes():
            node = graph_store.get_node(n) or {}
            if node.get("entity_type") != "PERSON" or n in named_suspects:
                continue
            suspect_neighbours = sorted(set(g[n]) & named_suspects)
            if len(suspect_neighbours) < min_suspects:
                continue
            other_cases = [c for c in graph_store._entity_case_ids(n) if c != case_id]
            rows.append({
                "entity_id": n,
                "name": node.get("label", n),
                "suspect_neighbour_count": len(suspect_neighbours),
                "suspect_neighbours": suspect_neighbours,
                "degree_in_case": g.degree(n),
                "also_in_cases": other_cases,
                "reason": (
                    f"Connected to {len(suspect_neighbours)} named suspect(s) "
                    f"({', '.join(suspect_neighbours[:3])}) but is not itself named in any FIR"
                    + (f"; also appears in {len(other_cases)} other case(s)" if other_cases else "")
                    + "."
                ),
                "review_status": "AI_SUGGESTED",
                "confidence": round(min(0.85, 0.4 + 0.1 * len(suspect_neighbours)), 2),
            })
        rows.sort(key=lambda r: (r["suspect_neighbour_count"], r["degree_in_case"]), reverse=True)
        return rows

    return (_scan(2) or _scan(1))[:limit]


# ---------------------------------------------------------------------------
# 4. geospatial radius  (POLE: tie activity to physical space)
# ---------------------------------------------------------------------------
def entities_near(
    case_id: str,
    location_id: str | None = None,
    lat: float | None = None,
    lon: float | None = None,
    radius_m: float = 500.0,
    limit: int = 50,
) -> dict:
    anchor_name = None
    if location_id:
        loc = row_to_dict(query_one(
            "SELECT location_name, latitude, longitude FROM locations WHERE location_id = ?",
            (location_id,),
        ))
        lat, lon = _f(loc["latitude"]) if loc else None, _f(loc["longitude"]) if loc else None
        if lat is None:
            return {"anchor": None, "reason": "unknown or un-geocoded location", "locations": []}
        anchor_name = loc["location_name"]
    lat, lon = _f(lat), _f(lon)
    if lat is None or lon is None:
        return {"anchor": None, "reason": "provide location_id or lat+lon", "locations": []}

    # location events in scope: evidence-linked PLUS any touching a case
    # phone / person (the evidence table only links ~4 per case)
    g = graph_store.case_graph(case_id)
    case_people = [n for n in g.nodes() if (graph_store.get_node(n) or {}).get("entity_type") == "PERSON"]
    case_phones = [n for n in g.nodes() if (graph_store.get_node(n) or {}).get("entity_type") == "PHONE"]
    events: list[dict] = []
    if case_people or case_phones:
        ids = case_people + case_phones
        marks = ",".join("?" * len(ids))
        events = [dict(r) for r in query(
            f"SELECT * FROM location_events "
            f"WHERE person_id IN ({marks}) OR phone_id IN ({marks}) LIMIT 5000",
            [*ids, *ids],
        )]

    # also incident locations for the case
    inc_loc_ids = {
        r["location_id"] for r in query(
            "SELECT location_id FROM incidents WHERE case_id = ?", (case_id,)
        ) if r["location_id"]
    }

    loc_ids = {e["location_id"] for e in events if e.get("location_id")} | inc_loc_ids
    if not loc_ids:
        return {"anchor": {"location_id": location_id, "name": anchor_name, "lat": lat, "lon": lon},
                "reason": "no located activity in this case", "locations": []}

    marks = ",".join("?" * len(loc_ids))
    loc_rows = {
        r["location_id"]: dict(r) for r in query(
            f"SELECT * FROM locations WHERE location_id IN ({marks})", list(loc_ids)
        )
    }

    by_loc: dict[str, dict] = {}
    for lid, lr in loc_rows.items():
        la, lo = _f(lr["latitude"]), _f(lr["longitude"])
        if la is None:
            continue
        dist = _haversine(lat, lon, la, lo)
        if dist > radius_m:
            continue
        by_loc[lid] = {
            "location_id": lid,
            "location_name": lr["location_name"],
            "location_type": lr["location_type"],
            "distance_m": round(dist, 1),
            "is_incident_site": lid in inc_loc_ids,
            "observed_entities": [],
        }
    for e in events:
        slot = by_loc.get(e["location_id"])
        if slot is None:
            continue
        who = e.get("person_id") or e.get("phone_id")
        slot["observed_entities"].append({
            "entity_id": who,
            "timestamp": e.get("timestamp"),
            "source_type": e.get("source_type"),
        })

    ordered = sorted(by_loc.values(), key=lambda x: x["distance_m"])[:limit]
    return {
        "anchor": {"location_id": location_id, "name": anchor_name, "lat": lat, "lon": lon,
                   "radius_m": radius_m},
        "reason": None,
        "locations": ordered,
    }


# ---------------------------------------------------------------------------
# 5. capabilities  (ROXANNE: self-describing analytics surface)
# ---------------------------------------------------------------------------
def capabilities() -> dict:
    return {
        "graph_engine": "networkx (in-process)",
        "centrality": {
            "types": list(centrality.CENTRALITY_TYPES),
            "endpoint": "GET /api/v1/cases/{case_id}/influencers",
            "influence_reasons": list(centrality.INFLUENCE_REASONS),
        },
        "community_detection": {
            "algorithm": "louvain (falls back to greedy modularity)",
            "surfaced_in": "entity summary -> community_peers",
        },
        "link_prediction": {
            "features": ["adamic_adar_index", "jaccard_coefficient"],
            "endpoint": "GET /api/v1/cases/{case_id}/suggested-links",
            "output_review_status": "AI_SUGGESTED",
        },
        "connection_path": {
            "algorithm": "all_shortest_paths with per-hop evidence",
            "endpoint": "POST /api/v1/cases/{case_id}/graph/path",
        },
        "persons_of_interest": {
            "method": "peripheral adjacency to named suspects",
            "endpoint": "GET /api/v1/cases/{case_id}/persons-of-interest",
        },
        "geospatial": {
            "method": "haversine radius over location_events + incident sites",
            "endpoint": "GET /api/v1/cases/{case_id}/entities/near",
        },
        "pattern_detectors": {
            "canonical": [
                "STRUCTURING", "CIRCULAR_FLOW", "MULE_ACCOUNT",
                "PRE_INCIDENT_CALL_BURST", "UNUSUAL_TIMING", "CROSS_CASE_RECURRENCE",
            ],
            "extended": ["COORDINATED_SEQUENCE"],
            "endpoint": "GET /api/v1/cases/{case_id}/patterns",
        },
        "risk_scoring": {
            "method": "pattern weight x confidence x source reliability x recency decay",
            "bands": ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
            "surfaced_in": "entity summary -> risk, influencers -> risk",
        },
        "pole_model": {
            "categories": ["PERSON", "OBJECT", "LOCATION", "EVENT"],
            "surfaced_in": "every graph node -> pole_category",
        },
    }
