"""Spec 6.1 -- investigator sign-in."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.services import audit
from app.services.db import query_one, row_to_dict
from app.services.security import create_token, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginBody(BaseModel):
    investigator_id: str
    password: str


@router.post("/login")
def login(body: LoginBody):
    row = row_to_dict(
        query_one("SELECT * FROM investigators WHERE investigator_id = ?", (body.investigator_id,))
    )
    if not row or not verify_password(body.password, row["password_hash"]):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")

    case_ids = row["accessible_case_ids"] or []
    token = create_token(row["investigator_id"], row["role"], case_ids)
    audit.record(
        investigator_id=row["investigator_id"], role=row["role"],
        action="LOGIN", resource="auth", description="Investigator signed in",
    )
    return {
        "token": token,
        "investigator": {
            "id": row["investigator_id"],
            "name": row["name"],
            "role": row["role"],
            "case_ids": case_ids,
        },
    }
