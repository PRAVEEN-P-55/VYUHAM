"""Shared helpers for routers: pagination + list-endpoint envelope."""
from __future__ import annotations

from fastapi import Query

from app.config import settings


class Page:
    def __init__(
        self,
        page: int = Query(1, ge=1),
        page_size: int = Query(settings.default_page_size, ge=1, le=1000),
    ):
        self.page = page
        self.page_size = page_size

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size

    def slice(self, items: list) -> list:
        return items[self.offset : self.offset + self.page_size]

    def envelope(self, items: list, total: int | None = None) -> dict:
        return {
            "items": self.slice(items) if total is None else items,
            "total": total if total is not None else len(items),
            "page": self.page,
            "page_size": self.page_size,
        }
