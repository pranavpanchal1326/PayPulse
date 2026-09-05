"""Public holidays.

The brief never mentions holidays, so this table has to justify itself on
correctness alone (PRD section 3.5). It does: without it `period_days`
counts Diwali as a working day, which inflates the pay denominator,
mis-prorates every joiner and leaver, and makes leave spanning a holiday
consume balance. Three columns and a set lookup fix all three.

Seed-only by design - there is no CRUD screen and no API surface. Holidays
change once a year, not during a demo.
"""
from __future__ import annotations

from datetime import date

from sqlalchemy import Boolean, Date, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class PublicHoliday(Base, TimestampMixin):
    __tablename__ = "public_holiday"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    date: Mapped[date] = mapped_column(Date, unique=True, index=True)

    # "Restricted holiday" semantics: shown on a calendar, but the employee
    # is still expected to work, so it does NOT reduce period_days.
    is_optional: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        return f"<PublicHoliday {self.date} {self.name}>"
