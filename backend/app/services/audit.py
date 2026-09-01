"""Audit-log helper. Every write endpoint calls record()."""
from __future__ import annotations

from app.services.db import execute, query


def record(
    *,
    investigator_id: str,
    role: str,
    action: str,
    resource: str,
    outcome: str = "SUCCESS",
    description: str = "",
) -> None:
    execute(
        "INSERT INTO audit_log (investigator_id, role, action, description, resource, outcome) "
        "VALUES (?,?,?,?,?,?)",
        (investigator_id, role, action, description, resource, outcome),
    )


def list_entries(
    *, investigator: str | None, action: str | None, page: int, page_size: int
) -> tuple[list[dict], int]:
    where = []
    params: list = []
    if investigator:
        where.append("investigator_id = ?")
        params.append(investigator)
    if action:
        where.append("action = ?")
        params.append(action)
    clause = ("WHERE " + " AND ".join(where)) if where else ""
    total = query(f"SELECT COUNT(*) c FROM audit_log {clause}", params)[0]["c"]
    rows = query(
        f"SELECT timestamp, investigator_id, role, action, description, resource, outcome "
        f"FROM audit_log {clause} ORDER BY id DESC LIMIT ? OFFSET ?",
        [*params, page_size, (page - 1) * page_size],
    )
    return [dict(r) for r in rows], total
