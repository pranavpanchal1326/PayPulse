"""Shared response envelopes."""
from __future__ import annotations

from typing import Generic, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")


class Page(BaseModel, Generic[T]):
    """Uniform list envelope used by every collection endpoint."""

    items: list[T]
    total: int
    page: int
    pages: int
    page_size: int

    @classmethod
    def build(cls, items: list[T], total: int, page: int, page_size: int) -> "Page[T]":
        pages = (total + page_size - 1) // page_size if page_size else 0
        return cls(
            items=items, total=total, page=page, pages=pages, page_size=page_size
        )


class Message(BaseModel):
    message: str


class ErrorResponse(BaseModel):
    """Documents the error envelope in OpenAPI so Pranav can type against it."""

    code: str = Field(examples=["not_found"])
    message: str
    field_errors: list[dict] = []
