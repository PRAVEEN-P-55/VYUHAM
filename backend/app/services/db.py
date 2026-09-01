"""Thin SQLite access layer.

SQLite stands in for the Postgres source-of-truth described in the build
spec -- the API contract is identical either way, and this keeps the demo
to a single `pip install`. List/array columns are stored as JSON strings;
`jcol()` decodes them back.
"""
from __future__ import annotations

import json
import sqlite3
from collections.abc import Iterable
from contextlib import contextmanager
from typing import Any

from app.config import settings

_JSON_HINT_PREFIXES = ("[", "{")


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(settings.db_path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=OFF")
    return conn


@contextmanager
def get_conn():
    conn = _connect()
    try:
        yield conn
    finally:
        conn.close()


def query(sql: str, params: Iterable[Any] = ()) -> list[sqlite3.Row]:
    with get_conn() as conn:
        return conn.execute(sql, tuple(params)).fetchall()


def query_one(sql: str, params: Iterable[Any] = ()) -> sqlite3.Row | None:
    with get_conn() as conn:
        return conn.execute(sql, tuple(params)).fetchone()


def execute(sql: str, params: Iterable[Any] = ()) -> int:
    with get_conn() as conn:
        cur = conn.execute(sql, tuple(params))
        conn.commit()
        return cur.lastrowid


def jcol(value: Any) -> Any:
    """Decode a column that may hold a JSON-encoded list/dict."""
    if isinstance(value, str) and value[:1] in _JSON_HINT_PREFIXES:
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return value
    return value


def row_to_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if row is None:
        return None
    return {k: jcol(row[k]) for k in row.keys()}


def rows_to_dicts(rows: Iterable[sqlite3.Row]) -> list[dict[str, Any]]:
    return [row_to_dict(r) for r in rows]  # type: ignore[misc]
