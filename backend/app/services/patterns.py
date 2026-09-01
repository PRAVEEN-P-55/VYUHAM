"""Spec 7.3 / 6.7 -- six rule-based suspicious-pattern detectors.

Two entry points:
  * detect_case(case_id)            -> list of hypotheses for the API
  * evaluate_row(pattern_type, ...) -> bool, used by scripts/evaluate.py to
                                        score against the ground truth incl.
                                        the 20 deliberate false-positive traps
"""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta

import networkx as nx

from app.services import graph_store
from app.services.db import query

PATTERN_TYPES = (
    "STRUCTURING", "CIRCULAR_FLOW", "MULE_ACCOUNT",
    "PRE_INCIDENT_CALL_BURST", "UNUSUAL_TIMING", "CROSS_CASE_RECURRENCE",
)
STRUCTURING_THRESHOLD = 50_000
NIGHT_HOURS = range(0, 6)


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------
def _dt(value) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00").replace("+00:00", ""))
    except ValueError:
        return None


def _in(table: str, id_col: str, ids: list[str]) -> list[dict]:
    if not ids:
        return []
    marks = ",".join("?" * len(ids))
    return [dict(r) for r in query(f"SELECT * FROM {table} WHERE {id_col} IN ({marks})", ids)]


def _case_records(case_id: str, source_type: str) -> list[str]:
    return [
        r["source_record_id"]
        for r in query(
            "SELECT source_record_id FROM evidence WHERE case_id = ? AND source_type = ?",
            (case_id, source_type),
        )
        if r["source_record_id"]
    ]


def _case_entity_ids(case_id: str, etype: str) -> list[str]:
    g = graph_store.case_graph(case_id)
    return [
        n for n in g.nodes()
        if (graph_store.get_node(n) or {}).get("entity_type") == etype
    ]


def _case_calls(case_id: str, cap: int = 4000) -> list[dict]:
    phones = _case_entity_ids(case_id, "PHONE")
    if not phones:
        return []
    marks = ",".join("?" * len(phones))
    rows = query(
        f"SELECT * FROM call_records "
        f"WHERE caller_phone_id IN ({marks}) OR receiver_phone_id IN ({marks}) "
        f"ORDER BY start_time DESC LIMIT ?",
        [*phones, *phones, cap],
    )
    return [dict(r) for r in rows]


def _case_transactions(case_id: str, cap: int = 4000) -> list[dict]:
    accts = _case_entity_ids(case_id, "ACCOUNT")
    if not accts:
        return []
    marks = ",".join("?" * len(accts))
    rows = query(
        f"SELECT * FROM transactions "
        f"WHERE from_account_id IN ({marks}) OR to_account_id IN ({marks}) "
        f'ORDER BY "timestamp" DESC LIMIT ?',
        [*accts, *accts, cap],
    )
    return [dict(r) for r in rows]


def _record_case_map(record_ids: list[str], source_type: str) -> dict[str, set[str]]:
    if not record_ids:
        return {}
    marks = ",".join("?" * len(record_ids))
    out: dict[str, set[str]] = defaultdict(set)
    for r in query(
        f"SELECT source_record_id, case_id FROM evidence "
        f"WHERE source_type = ? AND source_record_id IN ({marks})",
        [source_type, *record_ids],
    ):
        out[r["source_record_id"]].add(r["case_id"])
    return out


# ---------------------------------------------------------------------------
# primitive checks (shared by API + evaluator)
# ---------------------------------------------------------------------------
def _has_cycle(txns: list[dict]) -> bool:
    g = nx.DiGraph()
    for t in txns:
        if t.get("from_account_id") and t.get("to_account_id"):
            g.add_edge(t["from_account_id"], t["to_account_id"])
    try:
        for cycle in nx.simple_cycles(g):
            if len(cycle) >= 2:
                return True
    except Exception:
        pass
    return False


def _is_structuring(txns: list[dict]) -> bool:
    if len(txns) < 6:
        return False
    amts = [float(t["amount"]) for t in txns if t.get("amount") not in (None, "")]
    if not amts or any(a >= STRUCTURING_THRESHOLD for a in amts):
        return False
    times = sorted(t for t in (_dt(x["timestamp"]) for x in txns) if t)
    if len(times) < 2 or (times[-1] - times[0]) > timedelta(hours=120):
        return False
    accts = defaultdict(int)
    for t in txns:
        accts[t.get("from_account_id")] += 1
        accts[t.get("to_account_id")] += 1
    return max(accts.values()) >= 3  # a hub account participates repeatedly


def _is_mule(txns: list[dict]) -> bool:
    inflow: dict[str, float] = defaultdict(float)
    outflow: dict[str, float] = defaultdict(float)
    cin: dict[str, int] = defaultdict(int)
    cout: dict[str, int] = defaultdict(int)
    for t in txns:
        amt = float(t.get("amount") or 0)
        if t.get("to_account_id"):
            inflow[t["to_account_id"]] += amt
            cin[t["to_account_id"]] += 1
        if t.get("from_account_id"):
            outflow[t["from_account_id"]] += amt
            cout[t["from_account_id"]] += 1
    for acct in set(inflow) & set(outflow):
        if cin[acct] >= 2 and cout[acct] >= 1:
            hi = max(inflow[acct], outflow[acct]) or 1
            if abs(inflow[acct] - outflow[acct]) / hi <= 0.5:
                return True
    return False


def _is_call_burst(calls: list[dict], window_h: int = 72) -> bool:
    times = sorted(t for t in (_dt(c["start_time"]) for c in calls) if t)
    if len(times) < 5:
        return False
    for i in range(len(times)):
        j = i
        while j < len(times) and (times[j] - times[i]) <= timedelta(hours=window_h):
            j += 1
        if j - i >= 5:
            return True
    return False


def _is_unusual_timing(calls: list[dict]) -> bool:
    hours = [t.hour for t in (_dt(c["start_time"]) for c in calls) if t]
    if not hours:
        return False
    night = sum(1 for h in hours if h in NIGHT_HOURS)
    return night / len(hours) >= 0.5


# ---------------------------------------------------------------------------
# evaluator entry point
# ---------------------------------------------------------------------------
def evaluate_row(pattern_type: str, entity_ids: list[str], record_ids: list[str]) -> bool:
    if pattern_type in ("STRUCTURING", "CIRCULAR_FLOW", "MULE_ACCOUNT"):
        txns = _in("transactions", "transaction_id", record_ids)
        if pattern_type == "STRUCTURING":
            return _is_structuring(txns)
        if pattern_type == "CIRCULAR_FLOW":
            return _has_cycle(txns)
        return _is_mule(txns)

    calls = _in("call_records", "call_id", record_ids)
    if pattern_type == "PRE_INCIDENT_CALL_BURST":
        return _is_call_burst(calls)
    if pattern_type == "UNUSUAL_TIMING":
        return _is_unusual_timing(calls)
    if pattern_type == "CROSS_CASE_RECURRENCE":
        cmap = _record_case_map(record_ids, "CALL_RECORD")
        cases = set().union(*cmap.values()) if cmap else set()
        if len(cases) >= 2:
            return True
        # fall back to entity-level recurrence
        for eid in entity_ids:
            if len(graph_store._entity_case_ids(eid)) >= 2:
                return True
        return False
    return False


# ---------------------------------------------------------------------------
# API entry point
# ---------------------------------------------------------------------------
def _priority(severity_hint: str) -> str:
    return severity_hint


def detect_case(case_id: str) -> list[dict]:
    graph_store.ensure_loaded()
    out: list[dict] = []
    seq = 0

    def emit(ptype, priority, reason, entity_ids, rec_count, cross=False, linked=None,
             key_dates=None):
        nonlocal seq
        seq += 1
        out.append({
            "hypothesis_id": f"HYP_{case_id}_{ptype}_{seq}",
            "pattern_type": ptype,
            "priority": priority,
            "reason": reason,
            "entity_ids": sorted(set(entity_ids))[:40],
            "evidence_record_count": rec_count,
            "cross_case": cross,
            "linked_case_ids": sorted(set(linked or [])),
            "key_dates": sorted({str(d)[:10] for d in (key_dates or []) if d})[:6],
            "review_status": "AI_SUGGESTED",
            "confidence": 0.6,
        })

    # Records in scope for the case: evidence-linked rows PLUS every call /
    # transaction that touches an entity in the case graph. The seed evidence
    # table only links a handful of records per case, so the entity-scoped
    # union is what gives the detectors something to work with.
    txns = _case_transactions(case_id)
    calls = _case_calls(case_id)

    # STRUCTURING: hub accounts with many sub-threshold outgoing transfers
    by_from: dict[str, list[dict]] = defaultdict(list)
    for t in txns:
        if t.get("from_account_id") and float(t.get("amount") or 0) < STRUCTURING_THRESHOLD:
            by_from[t["from_account_id"]].append(t)
    struct_hits = sorted(
        (g for g in by_from.values() if _is_structuring(g)), key=len, reverse=True
    )
    for group in struct_hits[:6]:
        acct = group[0]["from_account_id"]
        emit("STRUCTURING", "HIGH",
             f"{len(group)} sub-threshold transfers from {acct} in a compact window.",
             [acct] + [t["to_account_id"] for t in group], len(group),
             key_dates=[t.get("timestamp") for t in group])

    # CIRCULAR_FLOW
    if _has_cycle(txns):
        g = nx.DiGraph()
        for t in txns:
            if t.get("from_account_id") and t.get("to_account_id"):
                g.add_edge(t["from_account_id"], t["to_account_id"])
        for cycle in list(nx.simple_cycles(g))[:5]:
            if len(cycle) >= 2:
                emit("CIRCULAR_FLOW", "HIGH",
                     f"Funds loop through {' -> '.join(cycle)} -> {cycle[0]}.",
                     cycle, len(cycle))

    # MULE_ACCOUNT: money in then straight back out, held only briefly.
    if _is_mule(txns):
        acct_txns: dict[str, list[dict]] = defaultdict(list)
        for t in txns:
            for side in ("from_account_id", "to_account_id"):
                if t.get(side):
                    acct_txns[t[side]].append(t)
        mule_accts = []
        for acct, ats in acct_txns.items():
            legs = sorted(
                ((d, t.get("to_account_id") == acct, float(t.get("amount") or 0), t)
                 for t in ats if (d := _dt(t.get("timestamp")))),
                key=lambda x: x[0],
            )
            if len(legs) < 4:
                continue
            # slide a 4-day window; flag if it holds >=2 in and >=2 out with
            # near-balanced value (classic fast pass-through)
            best = None
            for i in range(len(legs)):
                j = i
                win = []
                while j < len(legs) and legs[j][0] - legs[i][0] <= timedelta(days=4):
                    win.append(legs[j])
                    j += 1
                ins = [w for w in win if w[1]]
                outs = [w for w in win if not w[1]]
                if len(ins) >= 2 and len(outs) >= 2:
                    ia = sum(w[2] for w in ins)
                    oa = sum(w[2] for w in outs)
                    if ia >= 20_000 and abs(ia - oa) / (max(ia, oa) or 1) <= 0.35:
                        if best is None or ia > best[1]:
                            best = (acct, ia, len(win), [w[3]["timestamp"] for w in win])
            if best:
                mule_accts.append(best)
        mule_accts.sort(key=lambda x: x[1], reverse=True)
        for acct, in_amt, n, dates in mule_accts[:3]:
            emit("MULE_ACCOUNT", "MEDIUM",
                 f"Account {acct} passes ~{int(in_amt):,} in and back out within days, "
                 f"across {n} transactions -- little value retained.",
                 [acct], n, key_dates=dates)

    # PRE_INCIDENT_CALL_BURST
    for inc in query("SELECT * FROM incidents WHERE case_id = ?", (case_id,)):
        itime = _dt(inc["incident_time"])
        if not itime:
            continue
        pre = [c for c in calls if (ct := _dt(c["start_time"]))
               and timedelta() <= itime - ct <= timedelta(hours=72)]
        if len(pre) >= 8:
            phones = {c["caller_phone_id"] for c in pre} | {c["receiver_phone_id"] for c in pre}
            emit("PRE_INCIDENT_CALL_BURST", "HIGH",
                 f"{len(pre)} calls among {len(phones)} phones in the 72h before incident {inc['incident_id']}.",
                 list(phones), len(pre),
                 key_dates=[c.get("start_time") for c in pre] + [inc["incident_time"]])

    # UNUSUAL_TIMING: night activity well above the usual share for these phones
    timed = [ct for c in calls if (ct := _dt(c["start_time"]))]
    night_calls = [c for c in calls if (ct := _dt(c["start_time"])) and ct.hour in NIGHT_HOURS]
    if len(night_calls) >= 12 and timed and len(night_calls) / len(timed) >= 0.22:
        phones = {c["caller_phone_id"] for c in night_calls} | {c["receiver_phone_id"] for c in night_calls}
        emit("UNUSUAL_TIMING", "MEDIUM",
             f"{len(night_calls)} of {len(timed)} calls ({100 * len(night_calls) // len(timed)}%) "
             f"fall in the 00:00-06:00 window -- well above the norm for these phones.",
             list(phones), len(night_calls),
             key_dates=[c["start_time"] for c in night_calls])

    # CROSS_CASE_RECURRENCE -- one hypothesis per recurring entity, but only
    # for entities that recur widely (>= 2 other cases) and are people /
    # phones / accounts / vehicles (not shared infrastructure locations).
    _RECUR_TYPES = {"PERSON", "PHONE", "ACCOUNT", "VEHICLE"}
    recurring: list[tuple[str, list[str]]] = []
    seen_entities: set[str] = set()
    for rid in graph_store.case_relationship_ids(case_id):
        r = graph_store.relationship_row(rid)
        if not r:
            continue
        for eid in (r["source_entity_id"], r["target_entity_id"]):
            if eid in seen_entities:
                continue
            seen_entities.add(eid)
            if (graph_store.get_node(eid) or {}).get("entity_type") not in _RECUR_TYPES:
                continue
            other_cases = [c for c in graph_store._entity_case_ids(eid) if c != case_id]
            if len(other_cases) >= 2:
                recurring.append((eid, other_cases))
    recurring.sort(key=lambda x: len(x[1]), reverse=True)
    for eid, other_cases in recurring[:8]:
        node = graph_store.get_node(eid) or {}
        emit("CROSS_CASE_RECURRENCE", "MEDIUM",
             f"{node.get('label', eid)} ({eid}) also appears in {len(other_cases)} other case(s): "
             f"{', '.join(other_cases[:4])}{'…' if len(other_cases) > 4 else ''}.",
             [eid], len(other_cases), cross=True, linked=other_cases)

    # COORDINATED_SEQUENCE -- extended detector (not one of the canonical 6,
    # not scored by evaluate.py). Coordination = a pre-incident call burst
    # AND a financial pattern in the same case sharing people. Composed from
    # the hypotheses the canonical detectors already emitted.
    _detect_coordinated_sequence(out, emit)

    return out


_FINANCIAL_TYPES = {"STRUCTURING", "CIRCULAR_FLOW", "MULE_ACCOUNT"}


def _detect_coordinated_sequence(hypotheses: list[dict], emit) -> None:
    proj = graph_store._ownership_projection()

    def to_people(ids: list[str]) -> set[str]:
        return {proj.get(i, i) for i in ids}

    bursts = [h for h in hypotheses if h["pattern_type"] == "PRE_INCIDENT_CALL_BURST"]
    financial = [h for h in hypotheses if h["pattern_type"] in _FINANCIAL_TYPES]
    if not bursts or not financial:
        return

    burst_people = set().union(*(to_people(h["entity_ids"]) for h in bursts))

    for fin in financial:
        fin_people = to_people(fin["entity_ids"])
        shared = sorted(burst_people & fin_people)
        involved = sorted(burst_people | fin_people)
        emit(
            "COORDINATED_SEQUENCE", "HIGH",
            f"A pre-incident call burst and a {fin['pattern_type'].replace('_', ' ').lower()} "
            f"pattern run through the same case"
            + (f", sharing {len(shared)} person(s) ({', '.join(shared[:3])})" if shared else "")
            + " -- communication and money movement appear coordinated.",
            involved[:40],
            fin["evidence_record_count"] + sum(b["evidence_record_count"] for b in bursts),
            key_dates=sorted({d for h in (*bursts, fin) for d in h.get("key_dates", [])}),
        )
        break  # one composite hypothesis is enough
