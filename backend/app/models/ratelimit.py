"""Rate-limit counters, shared across API processes.

One row per key, holding a fixed-window counter rather than a row per
attempt: a login endpoint under attack would otherwise accumulate a row per
guess and need sweeping. The window resets in place when it has expired,
which the UPSERT in `app.core.ratelimit` does in a single statement.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class RateLimit(Base):
    __tablename__ = "rate_limit"

    key: Mapped[str] = mapped_column(String(255), primary_key=True)
    window_start: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    hits: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        return f"<RateLimit {self.key} {self.hits} since {self.window_start}>"
