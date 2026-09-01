"""In-process graph store (NetworkX) + collapsed-edge API.

Stands in for Neo4j. One global directed multigraph is built from the
entity tables + relationships.jsonl at startup. Per-case subgraphs are
scoped through evidence_mapping_log.case_id (1:1 with relationships) and
cached. The public surface the routers use:

    graph_store.ensure_loaded()
    graph_store.get_node(entity_id)
    graph_store.case_relationship_ids(case_id)
    graph_store.query(case_id, root_entity_id, hops, rel_types, time_from, time_to)
    graph_store.collapsed_edge_by_relationship(case_id, relationship_id)
    graph_store.case_graph(case_id)            -> networkx.Graph for analytics
    graph_store.merge_nodes / unmerge_nodes    -> identity resolution
"""
from __future__ import annotations

import threading
from collections import defaultdict, deque
from functools import lru_cache

import networkx as nx

from app.config import settings
from app.services import explain
from app.services.db import get_conn, jcol

# ---------------------------------------------------------------------------
# constants
# ---------------------------------------------------------------------------
TYPE_NORMALISE = {"ORG": "ORGANIZATION"}
SYMMETRIC_TYPES = {"CALLED", "CO_LOCATED_WITH", "ASSOCIATED_WITH", "MENTIONED_WITH"}

# POLE ontology (Person / Object / Location / Event) -- the model law
# enforcement already works in. Every node carries its POLE class so the
# frontend and the pitch can frame the graph in standard terms.
POLE_CATEGORY = {
    "PERSON": "PERSON",
    "ORGANIZATION": "PERSON",
    "PHONE": "OBJECT",
    "ACCOUNT": "OBJECT",
    "VEHICLE": "OBJECT",
    "DEVICE": "OBJECT",
    "LOCATION": "LOCATION",
    "INCIDENT": "EVENT",
}
REVIEW_CONFIDENCE = {
    "CONFIRMED": 0.9,
    "AI_SUGGESTED": 0.6,
    "PENDING_REVIEW": 0.5,
    "DISPUTED": 0.3,
}
REVIEW_PRIORITY = ["DISPUTED", "PENDING_REVIEW", "AI_SUGGESTED", "CONFIRMED"]

_ENTITY_SOURCES = [
    # (table, id col, type, label col)
    ("people", "person_id", "PERSON", "full_name"),
    ("phone_ownership", "phone_id", "PHONE", "phone_number"),
    ("bank_accounts", "account_id", "ACCOUNT", "account_id"),
    ("organizations", "org_id", "ORGANIZATION", "org_name"),
    ("locations", "location_id", "LOCATION", "location_name"),
    ("vehicles", "vehicle_id", "VEHICLE", "registration_number"),
]

_lock = threading.Lock()
_state: dict = {}


# ---------------------------------------------------------------------------
# loading
# ---------------------------------------------------------------------------
def ensure_loaded() -> None:
    if _state:
        return
    with _lock:
        if _state:
            return
        _load()


def _load() -> None:
    graph = nx.MultiDiGraph()
    nodes: dict[str, dict] = {}

    with get_conn() as conn:
        # ---- nodes -----------------------------------------------------
        for table, id_col, etype, label_col in _ENTITY_SOURCES:
            for row in conn.execute(f"SELECT * FROM {table}"):
                r = {k: jcol(row[k]) for k in row.keys()}
                eid = r[id_col]
                if not eid or eid in nodes:
                    continue
                label = r.get(label_col) or eid
                nodes[eid] = {
                    "entity_id": eid,
                    "entity_type": etype,
                    "label": str(label),
                    "props": r,
                    "risk_indicators": [],
                }

        # entity_summaries -> risk indicators + confidence
        for row in conn.execute(
            "SELECT entity_id, risk_indicators, confidence FROM entity_summaries"
        ):
            n = nodes.get(row["entity_id"])
            if n:
                n["risk_indicators"] = jcol(row["risk_indicators"]) or []
                n["summary_confidence"] = float(row["confidence"] or 0.0)

        # ---- relationship -> case map -------------------------------------
        rel_case: dict[str, str] = {}
        for row in conn.execute(
            "SELECT relationship_id, case_id FROM evidence_mapping_log"
        ):
            rel_case.setdefault(row["relationship_id"], row["case_id"])

        # ---- edges ---------------------------------------------------------
        case_rels: dict[str, list[str]] = defaultdict(list)
        rel_rows: dict[str, dict] = {}
        for row in conn.execute("SELECT * FROM relationships"):
            r = {k: jcol(row[k]) for k in row.keys()}
            src, tgt = r["source_entity_id"], r["target_entity_id"]
            for missing in (src, tgt):
                if missing not in nodes:
                    nodes[missing] = {
                        "entity_id": missing,
                        "entity_type": TYPE_NORMALISE.get(
                            r["source_entity_type" if missing == src else "target_entity_type"],
                            "UNKNOWN",
                        ),
                        "label": missing,
                        "props": {},
                        "risk_indicators": [],
                    }
            rid = r["relationship_id"]
            case_id = rel_case.get(rid)
            r["case_id"] = case_id
            r["confidence"] = REVIEW_CONFIDENCE.get(r.get("review_status"), 0.5)
            rel_rows[rid] = r
            if case_id:
                case_rels[case_id].append(rid)
            graph.add_edge(src, tgt, key=rid, **r)

        # ---- evidence index ---------------------------------------------
        evidence: dict[str, dict] = {}
        for row in conn.execute("SELECT * FROM evidence"):
            evidence[row["evidence_id"]] = {k: jcol(row[k]) for k in row.keys()}

    for eid, data in nodes.items():
        if not graph.has_node(eid):
            graph.add_node(eid)
        graph.nodes[eid].update(data)

    _state.update(
        graph=graph,
        nodes=nodes,
        rel_rows=rel_rows,
        case_rels={k: v for k, v in case_rels.items()},
        evidence=evidence,
        merges={},          # canonical_id -> [merged_away_ids]
        merged_into={},     # merged_away_id -> canonical_id
    )


# ---------------------------------------------------------------------------
# lookups
# ---------------------------------------------------------------------------
def get_node(entity_id: str) -> dict | None:
    ensure_loaded()
    entity_id = _state["merged_into"].get(entity_id, entity_id)
    return _state["nodes"].get(entity_id)


def case_relationship_ids(case_id: str) -> list[str]:
    ensure_loaded()
    return _state["case_rels"].get(case_id, [])


def relationship_row(relationship_id: str) -> dict | None:
    ensure_loaded()
    return _state["rel_rows"].get(relationship_id)


def evidence_for(evidence_id: str | None) -> dict | None:
    if not evidence_id:
        return None
    ensure_loaded()
    return _state["evidence"].get(evidence_id)


def node_public(entity_id: str) -> dict:
    n = get_node(entity_id) or {
        "entity_id": entity_id, "entity_type": "UNKNOWN", "label": entity_id,
        "risk_indicators": [],
    }
    return {
        "entity_id": n["entity_id"],
        "entity_type": n["entity_type"],
        "pole_category": POLE_CATEGORY.get(n["entity_type"], "OBJECT"),
        "label": n["label"],
        "case_ids": _entity_case_ids(entity_id),
        "risk_indicators": n.get("risk_indicators", []),
        "confidence": round(float(n.get("summary_confidence", 0.7)), 2),
    }


@lru_cache(maxsize=4096)
def _entity_case_ids(entity_id: str) -> tuple[str, ...]:
    ensure_loaded()
    out: set[str] = set()
    for rid in _state["rel_rows"]:
        r = _state["rel_rows"][rid]
        if r["source_entity_id"] == entity_id or r["target_entity_id"] == entity_id:
            if r.get("case_id"):
                out.add(r["case_id"])
    return tuple(sorted(out))


# ---------------------------------------------------------------------------
# collapsed edges
# ---------------------------------------------------------------------------
def _canon(eid: str) -> str:
    return _state["merged_into"].get(eid, eid)


def _collapse_key(src: str, tgt: str, rtype: str) -> tuple[str, str, str, bool]:
    a, b = _canon(src), _canon(tgt)
    if rtype in SYMMETRIC_TYPES:
        lo, hi = sorted((a, b))
        return lo, hi, rtype, True
    return a, b, rtype, False


def _dominant_review(statuses: list[str]) -> str:
    for level in REVIEW_PRIORITY:
        if level in statuses:
            return level
    return "AI_SUGGESTED"


def _build_collapsed(rel_ids: list[str]) -> list[dict]:
    groups: dict[tuple, list[dict]] = defaultdict(list)
    for rid in rel_ids:
        r = _state["rel_rows"].get(rid)
        if not r:
            continue
        key = _collapse_key(r["source_entity_id"], r["target_entity_id"], r["relationship_type"])
        groups[key].append(r)

    edges = []
    for (a, b, rtype, symmetric), rows in groups.items():
        rows.sort(key=lambda r: str(r.get("valid_from") or ""))
        rel_id_list = [r["relationship_id"] for r in rows]
        statuses = [r.get("review_status", "AI_SUGGESTED") for r in rows]
        vfroms = [r.get("valid_from") for r in rows if r.get("valid_from")]
        vtos = [r.get("valid_to") for r in rows if r.get("valid_to")]
        ev_records = []
        for r in rows:
            ev = _state["evidence"].get(r.get("evidence_id"))
            if ev:
                ev_records.append({
                    "evidence_id": ev["evidence_id"],
                    "source_type": ev.get("source_type"),
                    "source_record_id": ev.get("source_record_id"),
                    "text_excerpt": ev.get("text_excerpt"),
                    "reliability": ev.get("reliability"),
                    "document_id": ev.get("document_id"),
                    "bounding_box": jcol(ev.get("bounding_box")),
                })
        # direction: for symmetric use the first row's order
        source_id, target_id = (rows[0]["source_entity_id"], rows[0]["target_entity_id"])
        edges.append({
            "edge_id": f"E_{a}_{b}_{rtype}",
            "source_entity_id": _canon(source_id),
            "target_entity_id": _canon(target_id),
            "relationship_type": rtype,
            "review_status": _dominant_review(statuses),
            "confidence": round(
                sum(REVIEW_CONFIDENCE.get(s, 0.5) for s in statuses) / len(statuses), 2
            ),
            "valid_from": min(vfroms) if vfroms else None,
            "valid_to": max(vtos) if vtos else None,
            "relationship_ids": rel_id_list,
            "evidence_summary": explain.summarize(ev_records),
            "evidence": ev_records,
        })
    return edges


# ---------------------------------------------------------------------------
# query
# ---------------------------------------------------------------------------
def query(
    case_id: str,
    root_entity_id: str | None = None,
    hops: int = 2,
    rel_types: list[str] | None = None,
    time_from: str | None = None,
    time_to: str | None = None,
) -> dict:
    ensure_loaded()
    rel_ids = case_relationship_ids(case_id)
    rows = [_state["rel_rows"][r] for r in rel_ids if r in _state["rel_rows"]]

    if rel_types:
        wanted = set(rel_types)
        rows = [r for r in rows if r["relationship_type"] in wanted]
    if time_from:
        rows = [r for r in rows if (r.get("valid_to") or r.get("valid_from") or "") >= time_from]
    if time_to:
        rows = [r for r in rows if (r.get("valid_from") or r.get("valid_to") or "") <= time_to]

    # adjacency for BFS (undirected)
    adj: dict[str, set[str]] = defaultdict(set)
    for r in rows:
        a, b = _canon(r["source_entity_id"]), _canon(r["target_entity_id"])
        adj[a].add(b)
        adj[b].add(a)

    if root_entity_id:
        root = _canon(root_entity_id)
        keep = {root}
        frontier = deque([(root, 0)])
        while frontier:
            node, depth = frontier.popleft()
            if depth >= hops:
                continue
            for nbr in adj[node]:
                if nbr not in keep:
                    keep.add(nbr)
                    frontier.append((nbr, depth + 1))
    else:
        keep = set(adj)
        if len(keep) > settings.max_graph_nodes:
            keep = set(
                sorted(keep, key=lambda n: len(adj[n]), reverse=True)[: settings.max_graph_nodes]
            )

    kept_rows = [
        r for r in rows
        if _canon(r["source_entity_id"]) in keep and _canon(r["target_entity_id"]) in keep
    ]
    edges = _build_collapsed([r["relationship_id"] for r in kept_rows])
    node_ids = {e["source_entity_id"] for e in edges} | {e["target_entity_id"] for e in edges}
    if root_entity_id:
        node_ids.add(_canon(root_entity_id))
    nodes = [node_public(nid) for nid in sorted(node_ids)]
    return {"nodes": nodes, "edges": edges}


def collapsed_edge_by_relationship(case_id: str, relationship_id: str) -> dict | None:
    ensure_loaded()
    base = _state["rel_rows"].get(relationship_id)
    if not base:
        return None
    key = _collapse_key(
        base["source_entity_id"], base["target_entity_id"], base["relationship_type"]
    )
    siblings = [
        rid for rid in case_relationship_ids(case_id)
        if (r := _state["rel_rows"].get(rid))
        and _collapse_key(r["source_entity_id"], r["target_entity_id"], r["relationship_type"]) == key
    ]
    if not siblings:
        siblings = [relationship_id]
    built = _build_collapsed(siblings)
    return built[0] if built else None


def edges_between(case_id: str, a: str, b: str) -> list[dict]:
    """All collapsed edges (any relationship type) linking a<->b within a case."""
    ensure_loaded()
    a, b = _canon(a), _canon(b)
    rids = [
        rid for rid in case_relationship_ids(case_id)
        if (r := _state["rel_rows"].get(rid))
        and {_canon(r["source_entity_id"]), _canon(r["target_entity_id"])} == {a, b}
    ]
    return _build_collapsed(rids)


# ---------------------------------------------------------------------------
# analytics subgraph
# ---------------------------------------------------------------------------
@lru_cache(maxsize=64)
def case_graph(case_id: str) -> nx.Graph:
    """Undirected simple graph for centrality/community analytics."""
    ensure_loaded()
    g = nx.Graph()
    for rid in case_relationship_ids(case_id):
        r = _state["rel_rows"].get(rid)
        if not r:
            continue
        a, b = _canon(r["source_entity_id"]), _canon(r["target_entity_id"])
        if g.has_edge(a, b):
            g[a][b]["weight"] += 1
            g[a][b]["types"].add(r["relationship_type"])
        else:
            g.add_edge(a, b, weight=1, types={r["relationship_type"]})
    for n in g.nodes:
        node = _state["nodes"].get(n, {})
        g.nodes[n]["entity_type"] = node.get("entity_type", "UNKNOWN")
        g.nodes[n]["label"] = node.get("label", n)
    return g


def directed_case_graph(case_id: str, rel_type: str) -> nx.DiGraph:
    ensure_loaded()
    g = nx.DiGraph()
    for rid in case_relationship_ids(case_id):
        r = _state["rel_rows"].get(rid)
        if r and r["relationship_type"] == rel_type:
            g.add_edge(_canon(r["source_entity_id"]), _canon(r["target_entity_id"]))
    return g


# ---------------------------------------------------------------------------
# identity resolution merges (reversible)
# ---------------------------------------------------------------------------
def merge_nodes(canonical_id: str, other_id: str) -> None:
    ensure_loaded()
    if canonical_id == other_id:
        return
    _state["merged_into"][other_id] = canonical_id
    _state["merges"].setdefault(canonical_id, []).append(other_id)
    case_graph.cache_clear()
    _entity_case_ids.cache_clear()


def unmerge_nodes(other_id: str) -> None:
    ensure_loaded()
    canon = _state["merged_into"].pop(other_id, None)
    if canon and other_id in _state["merges"].get(canon, []):
        _state["merges"][canon].remove(other_id)
    case_graph.cache_clear()
    _entity_case_ids.cache_clear()


def merge_state() -> dict:
    ensure_loaded()
    return dict(_state["merges"])


# ---------------------------------------------------------------------------
# helpers for the evaluation harness (scenario-scoped, not case-scoped)
# ---------------------------------------------------------------------------
def global_edge_support(a: str, b: str, rel_type: str) -> int:
    """How many raw relationship rows connect a<->b with this type (any case)."""
    ensure_loaded()
    a, b = _canon(a), _canon(b)
    symmetric = rel_type in SYMMETRIC_TYPES
    count = 0
    for r in _state["rel_rows"].values():
        if r["relationship_type"] != rel_type:
            continue
        s, t = _canon(r["source_entity_id"]), _canon(r["target_entity_id"])
        if (s == a and t == b) or (symmetric and s == b and t == a):
            count += 1
    return count


@lru_cache(maxsize=1)
def _ownership_projection() -> dict[str, str]:
    """phone_id / account_id -> owning person_id (for person-level influence)."""
    with get_conn() as conn:
        m: dict[str, str] = {}
        for row in conn.execute("SELECT phone_id, person_id FROM phone_ownership"):
            if row["person_id"]:
                m[row["phone_id"]] = row["person_id"]
        for row in conn.execute("SELECT account_id, person_id FROM bank_accounts"):
            if row["person_id"]:
                m[row["account_id"]] = row["person_id"]
    return m


def subgraph_from_entities(
    entity_ids: list[str],
    include_neighbours: bool = False,
    project_to_persons: bool = False,
) -> nx.Graph:
    ensure_loaded()
    wanted = {_canon(e) for e in entity_ids}
    proj = _ownership_projection() if project_to_persons else {}

    def node_of(e: str) -> str:
        return proj.get(e, e)

    g = nx.Graph()
    for r in _state["rel_rows"].values():
        s, t = _canon(r["source_entity_id"]), _canon(r["target_entity_id"])
        touch = s in wanted or t in wanted
        both = s in wanted and t in wanted
        if both or (include_neighbours and touch):
            a, b = node_of(s), node_of(t)
            if a == b:
                continue
            if g.has_edge(a, b):
                g[a][b]["weight"] += 1
            else:
                g.add_edge(a, b, weight=1)
    for n in g.nodes:
        g.nodes[n]["entity_type"] = (_state["nodes"].get(n) or {}).get("entity_type", "UNKNOWN")
    return g
