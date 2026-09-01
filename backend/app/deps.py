"""FastAPI dependencies: current investigator + per-case access control."""
from __future__ import annotations

from dataclasses import dataclass

from fastapi import Depends, HTTPException, Path, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.services.db import query_one, row_to_dict
from app.services.security import decode_token

_bearer = HTTPBearer(auto_error=True)


@dataclass
class Investigator:
    id: str
    name: str
    role: str
    case_ids: list[str]

    @property
    def is_superuser(self) -> bool:
        return "*" in self.case_ids

    def can_access(self, case_id: str) -> bool:
        return self.is_superuser or case_id in self.case_ids


def get_current_investigator(
    creds: HTTPAuthorizationCredentials = Depends(_bearer),
) -> Investigator:
    payload = decode_token(creds.credentials)
    if not payload:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")
    row = row_to_dict(
        query_one("SELECT * FROM investigators WHERE investigator_id = ?", (payload["sub"],))
    )
    if not row:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Unknown investigator")
    return Investigator(
        id=row["investigator_id"],
        name=row["name"],
        role=row["role"],
        case_ids=row["accessible_case_ids"] or [],
    )


def require_case_access(
    case_id: str = Path(...),
    investigator: Investigator = Depends(get_current_investigator),
) -> Investigator:
    if not investigator.can_access(case_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, f"No access to {case_id}")
    return investigator
