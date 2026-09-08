"""Bulk seed loader -- build the SQLite store from the synthetic dataset.

Run this once before starting the API:

    python scripts/seed_from_datasets.py [--reset]

It reads every JSONL/XLSX file listed in TABLES, creates a table whose
columns are the union of keys seen in that file, and bulk-inserts the rows.
List/dict values are stored as JSON text. Then it adds the auth/audit
tables the seed data does not carry and inserts a handful of demo
investigators.
"""
from __future__ import annotations

import argparse
import json
import sqlite3
import sys
import time
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from app.config import settings  # noqa: E402

try:
    from passlib.context import CryptContext

    _pwd = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

    def hash_pw(pw: str) -> str:
        return _pwd.hash(pw)
except Exception:  # pragma: no cover - fallback if bcrypt backend misbehaves
    import hashlib

    def hash_pw(pw: str) -> str:
        return "sha256$" + hashlib.sha256(pw.encode()).hexdigest()


# table name -> (filename, primary key column or None)
TABLES: dict[str, tuple[str, str | None]] = {
    "people": ("people.xlsx", "person_id"),
    "organizations": ("organizations.jsonl", "org_id"),
    "vehicles": ("vehicles.jsonl", "vehicle_id"),
    "locations": ("locations.jsonl", "location_id"),
    "devices": ("devices.jsonl", "device_id"),
    "phone_ownership": ("phone_ownership.jsonl", "phone_id"),
    "bank_accounts": ("bank_accounts.jsonl", "account_id"),
    "call_records": ("call_records.jsonl", "call_id"),
    "transactions": ("transactions.jsonl", "transaction_id"),
    "location_events": ("location_events.jsonl", "location_event_id"),
    "org_membership": ("org_membership.jsonl", "membership_id"),
    "relationships": ("relationships.jsonl", "relationship_id"),
    "cases": ("cases.jsonl", "case_id"),
    "incidents": ("incidents.jsonl", "incident_id"),
    "criminal_history": ("criminal_history.jsonl", "history_id"),
    "firs": ("firs.jsonl", "fir_id"),
    "documents": ("documents.jsonl", "document_id"),
    "evidence": ("evidence.jsonl", "evidence_id"),
    "evidence_mapping_log": ("evidence_mapping_log.jsonl", None),
    "fir_document_mapping": ("fir_document_mapping.jsonl", None),
    "social_media_mentions": ("social_media_mentions.jsonl", "post_id"),
    "translations": ("translations.jsonl", "translation_id"),
    "entity_summaries": ("entity_summaries.jsonl", "summary_id"),
    "evidence_gaps": ("evidence_gaps.jsonl", "gap_id"),
    "scenario_cluster_summary": ("scenario_cluster_summary.jsonl", "cluster_id"),
}

# Indexes that matter for API latency.
INDEXES = [
    "CREATE INDEX IF NOT EXISTS ix_eml_rel ON evidence_mapping_log(relationship_id)",
    "CREATE INDEX IF NOT EXISTS ix_eml_case ON evidence_mapping_log(case_id)",
    "CREATE INDEX IF NOT EXISTS ix_evidence_case ON evidence(case_id)",
    "CREATE INDEX IF NOT EXISTS ix_evidence_src ON evidence(source_record_id)",
    "CREATE INDEX IF NOT EXISTS ix_rel_src ON relationships(source_entity_id)",
    "CREATE INDEX IF NOT EXISTS ix_rel_tgt ON relationships(target_entity_id)",
    "CREATE INDEX IF NOT EXISTS ix_incidents_case ON incidents(case_id)",
    "CREATE INDEX IF NOT EXISTS ix_firs_case ON firs(case_id)",
    "CREATE INDEX IF NOT EXISTS ix_calls_caller ON call_records(caller_phone_id)",
    "CREATE INDEX IF NOT EXISTS ix_calls_recv ON call_records(receiver_phone_id)",
    "CREATE INDEX IF NOT EXISTS ix_txn_from ON transactions(from_account_id)",
    "CREATE INDEX IF NOT EXISTS ix_txn_to ON transactions(to_account_id)",
    "CREATE INDEX IF NOT EXISTS ix_locev_person ON location_events(person_id)",
    "CREATE INDEX IF NOT EXISTS ix_phone_person ON phone_ownership(person_id)",
    "CREATE INDEX IF NOT EXISTS ix_acct_person ON bank_accounts(person_id)",
    "CREATE INDEX IF NOT EXISTS ix_crimhist_person ON criminal_history(person_id)",
    "CREATE INDEX IF NOT EXISTS ix_summ_entity ON entity_summaries(entity_id)",
    "CREATE INDEX IF NOT EXISTS ix_gaps_case ON evidence_gaps(case_id)",
    "CREATE INDEX IF NOT EXISTS ix_smm_person ON social_media_mentions(person_id)",
    "CREATE INDEX IF NOT EXISTS ix_translations_src ON translations(source_record_id)",
]

AUTH_DDL = """
CREATE TABLE investigators (
  investigator_id TEXT PRIMARY KEY,
  name TEXT,
  role TEXT,
  password_hash TEXT,
  accessible_case_ids TEXT      -- JSON list; ["*"] means all cases
);
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  investigator_id TEXT,
  role TEXT,
  action TEXT,
  description TEXT,
  resource TEXT,
  outcome TEXT
);
CREATE TABLE identity_resolution_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  candidate_id TEXT,
  action TEXT,
  investigator_id TEXT,
  timestamp TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  reversed INTEGER DEFAULT 0
);
CREATE TABLE upload_jobs (
  job_id TEXT PRIMARY KEY,
  document_id TEXT,
  case_id TEXT,
  filename TEXT,
  stage TEXT,
  status TEXT,
  detected_language TEXT,
  extracted_entity_count INTEGER,
  extracted_entity_ids TEXT NOT NULL DEFAULT '[]',
  error TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at TEXT
);
"""

DEMO_INVESTIGATORS = [
    ("INV001", "SI Ananya Rao", "LEAD_INVESTIGATOR", "vyuham123", ["*"]),
    ("INV002", "Inspector Vikram Singh", "INVESTIGATOR",
     "vyuham123", [f"CASE{n:04d}" for n in range(1, 11)]),
    ("INV003", "ASI Meera Nair", "ANALYST",
     "vyuham123", ["CASE0001", "CASE0002", "CASE0005"]),
    ("INV004", "Supervisor Rakesh Menon", "SUPERVISOR", "vyuham123", ["*"]),
]


def _iter_jsonl(path: Path):
    with path.open(encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line:
                yield json.loads(line)


def _iter_xlsx(path: Path):
    from openpyxl import load_workbook

    wb = load_workbook(path, read_only=True, data_only=True)
    ws = wb.active
    rows = ws.iter_rows(values_only=True)
    header = [str(h).strip() for h in next(rows)]
    for row in rows:
        if row is None or all(c is None for c in row):
            continue
        rec = {}
        for key, val in zip(header, row):
            if hasattr(val, "isoformat"):
                val = val.isoformat()
            rec[key] = val
        yield rec


def load_rows(path: Path):
    if path.suffix == ".xlsx":
        yield from _iter_xlsx(path)
    else:
        yield from _iter_jsonl(path)


def _scalar(value):
    if isinstance(value, (list, dict)):
        return json.dumps(value, ensure_ascii=False)
    return value


def create_and_fill(conn: sqlite3.Connection, table: str, rows: list[dict], pk: str | None):
    columns: list[str] = []
    seen: set[str] = set()
    for r in rows:
        for k in r:
            if k not in seen:
                seen.add(k)
                columns.append(k)
    if not columns:
        print(f"  !! {table}: no rows, skipped")
        return 0

    col_defs = []
    for c in columns:
        if c == pk:
            col_defs.append(f'"{c}" TEXT PRIMARY KEY')
        else:
            col_defs.append(f'"{c}" TEXT')
    conn.execute(f'DROP TABLE IF EXISTS "{table}"')
    conn.execute(f'CREATE TABLE "{table}" ({", ".join(col_defs)})')

    placeholders = ", ".join("?" for _ in columns)
    col_list = ", ".join(f'"{c}"' for c in columns)
    sql = f'INSERT OR REPLACE INTO "{table}" ({col_list}) VALUES ({placeholders})'
    payload = [tuple(_scalar(r.get(c)) for c in columns) for r in rows]
    conn.executemany(sql, payload)
    return len(payload)


def seed(reset: bool = False):
    settings.db_path.parent.mkdir(parents=True, exist_ok=True)
    if reset and settings.db_path.exists():
        settings.db_path.unlink()

    conn = sqlite3.connect(settings.db_path)
    conn.execute("PRAGMA journal_mode=WAL")
    t0 = time.time()
    total = 0
    for table, (filename, pk) in TABLES.items():
        path = settings.dataset_dir / filename
        if not path.exists():
            print(f"  !! {filename} not found at {path}, skipping {table}")
            continue
        rows = list(load_rows(path))
        n = create_and_fill(conn, table, rows, pk)
        total += n
        print(f"  {table:<28} {n:>7} rows")
        conn.commit()

    print("  creating indexes ...")
    for stmt in INDEXES:
        conn.execute(stmt)

    print("  creating auth/audit tables ...")
    conn.executescript("DROP TABLE IF EXISTS investigators;"
                       "DROP TABLE IF EXISTS audit_log;"
                       "DROP TABLE IF EXISTS identity_resolution_actions;"
                       "DROP TABLE IF EXISTS upload_jobs;")
    conn.executescript(AUTH_DDL)
    for inv_id, name, role, pw, cases in DEMO_INVESTIGATORS:
        conn.execute(
            "INSERT INTO investigators VALUES (?,?,?,?,?)",
            (inv_id, name, role, hash_pw(pw), json.dumps(cases)),
        )
    conn.commit()
    conn.close()

    print(f"\nDone. {total} rows across {len(TABLES)} tables in {time.time() - t0:.1f}s")
    print(f"DB: {settings.db_path}")
    print("Demo logins (password 'vyuham123'): "
          + ", ".join(i[0] for i in DEMO_INVESTIGATORS))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--reset", action="store_true", help="delete the DB file first")
    args = ap.parse_args()
    seed(reset=args.reset)
