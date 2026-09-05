"""Shared response envelopes."""
from __future__ import annotations

from typing import Generic, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class Page(BaseModel, Generic[T]):
    """Uniform list envelope used by every collection endpoint."""

    items: list[T]
    total: int
    page: int
    pages: int
    page_size: int

    @classmethod
    def build(cls, items: list[T], total: int, page: int, page_size: int) -> Page[T]:
        """Wrap one page of rows, working out the page count."""
        pages = (total + page_size - 1) // page_size if page_size else 0
        return cls(
            items=items, total=total, page=page, pages=pages, page_size=page_size
        )


class Message(BaseModel):
    """A bare human-readable result, where there is nothing else to return."""
    message: str
