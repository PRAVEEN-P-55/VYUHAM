"""Spec 6.13 -- audit log."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.common import Page
from app.deps import Investigator, get_current_investigator
from app.services import audit as audit_svc

router = APIRouter(tags=["audit"])


@router.get("/audit-log")
def audit_log(
    page: Page = Depends(),
    investigator: str | None = Query(None),
    action: str | None = Query(None),
    _: Investigator = Depends(get_current_investigator),
):
    items, total = audit_svc.list_entries(
        investigator=investigator, action=action, page=page.page, page_size=page.page_size
    )
    return page.envelope(items, total)
