"""Password hashing + JWT issuing/verification."""
from __future__ import annotations

import time

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.config import settings

_pwd = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return _pwd.verify(plain, hashed)
    except ValueError:
        return False


def hash_password(plain: str) -> str:
    return _pwd.hash(plain)


def create_token(investigator_id: str, role: str, case_ids: list[str]) -> str:
    now = int(time.time())
    payload = {
        "sub": investigator_id,
        "role": role,
        "case_ids": case_ids,
        "iat": now,
        "exp": now + settings.jwt_expire_minutes * 60,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError:
        return None
