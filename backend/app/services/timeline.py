"""Spec 6.6 -- unified case timeline.

Union of call_records / transactions / location_events / firs /
social_media_mentions / incidents scoped to the case, sorted by time.
Scoping: an event belongs to the case if its underlying record id appears
in the case's evidence table, or (for FIRs/incidents) via case_id.
"""
from __future__ import annotations

from app.services.db import query


def _case_record_ids(case_id: str) -> set[str]:
    rows = query(
        "SELECT DISTINCT source_record_id FROM evidence WHERE case_id = ?", (case_id,)
    )
    return {r["source_record_id"] for r in rows if r["source_record_id"]}


def build(case_id: str) -> list[dict]:
    rec_ids = _case_record_ids(case_id)
    items: list[dict] = []

    def add(ts, etype, desc, source_id, evidence_id=None):
        if ts:
            items.append({
                "timestamp": ts,
                "event_type": etype,
                "description": desc,
                "source_id": source_id,
                "evidence_id": evidence_id,
            })

    ev_by_record = {
        r["source_record_id"]: r["evidence_id"]
        for r in query("SELECT source_record_id, evidence_id FROM evidence WHERE case_id = ?", (case_id,))
    }

    for r in query("SELECT * FROM incidents WHERE case_id = ?", (case_id,)):
        add(r["incident_time"], "INCIDENT",
            f"{r['crime_type']} at {r['location_id']} - {r['distinctive_action'] or r['target_type']}",
            r["incident_id"], ev_by_record.get(r["incident_id"]))

    for r in query("SELECT * FROM firs WHERE case_id = ?", (case_id,)):
        add(r["registration_date"], "FIR",
            f"FIR {r['fir_number']} registered at {r['police_station']} ({r['crime_type']})",
            r["fir_id"], ev_by_record.get(r["fir_id"]))

    if rec_ids:
        marks = ",".join("?" * len(rec_ids))
        ids = list(rec_ids)
        for r in query(f"SELECT * FROM call_records WHERE call_id IN ({marks})", ids):
            add(r["start_time"], "CALL",
                f"Call {r['caller_phone_id']} -> {r['receiver_phone_id']} ({r['duration_seconds']}s)",
                r["call_id"], ev_by_record.get(r["call_id"]))
        for r in query(f"SELECT * FROM transactions WHERE transaction_id IN ({marks})", ids):
            add(r["timestamp"], "TRANSACTION",
                f"{r['transaction_type']} {r['amount']} {r['from_account_id']} -> {r['to_account_id']}",
                r["transaction_id"], ev_by_record.get(r["transaction_id"]))
        for r in query(f"SELECT * FROM location_events WHERE location_event_id IN ({marks})", ids):
            add(r["timestamp"], "LOCATION",
                f"{r['person_id'] or r['phone_id']} observed at {r['location_id']} ({r['source_type']})",
                r["location_event_id"], ev_by_record.get(r["location_event_id"]))
        for r in query(f"SELECT * FROM social_media_mentions WHERE post_id IN ({marks})", ids):
            add(r["post_timestamp"], "SOCIAL",
                f"{r['platform']} post by {r['alias_used'] or r['person_id']}",
                r["post_id"], ev_by_record.get(r["post_id"]))

    items.sort(key=lambda x: str(x["timestamp"]))
    return items
