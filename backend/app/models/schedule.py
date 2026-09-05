"""Working schedules.

Spec A3 is explicit that weekly hours must be *calculated* from the day
pattern rather than typed in, so `hours_per_week` is a stored-but-derived
column: `services.schedule_calc` recomputes it on every write and the API
exposes it read-only. See PRD section 3.1.
"""
from __future__ import annotations

from datetime import time
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Time,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.employee import Employee


class WorkingSchedule(Base, TimestampMixin):
    __tablename__ = "working_schedule"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, index=True)

    # Derived from the lines. Never accept this from a client.
    hours_per_week: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), nullable=False, default=Decimal("0.00")
    )

    lines: Mapped[list[WorkingScheduleLine]] = relationship(
        back_populates="schedule",
        cascade="all, delete-orphan",
        order_by="WorkingScheduleLine.day_of_week",
        lazy="selectin",
    )
    employees: Mapped[list[Employee]] = relationship(
        back_populates="working_schedule", passive_deletes=True
    )

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        return f"<WorkingSchedule {self.name} {self.hours_per_week}h/wk>"


class WorkingScheduleLine(Base):
    """One working day in the weekly pattern.

    `day_of_week` follows Python's `date.weekday()`: Monday is 0, Sunday is 6.
    A line whose `end_time` is not after `start_time` is read as crossing
    midnight (the 22:00-06:00 night shift), which `schedule_calc` handles.
    """

    __tablename__ = "working_schedule_line"
    __table_args__ = (
        # One line per day keeps the weekly grid editor unambiguous and stops
        # a schedule from silently double-counting a day's hours.
        UniqueConstraint(
            "schedule_id", "day_of_week", name="uq_schedule_line_day"
        ),
        CheckConstraint(
            "day_of_week >= 0 AND day_of_week <= 6", name="ck_schedule_line_day_range"
        ),
        CheckConstraint("break_minutes >= 0", name="ck_schedule_line_break_positive"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    schedule_id: Mapped[int] = mapped_column(
        ForeignKey("working_schedule.id", ondelete="CASCADE"), index=True
    )
    day_of_week: Mapped[int] = mapped_column(Integer)
    start_time: Mapped[time] = mapped_column(Time)
    end_time: Mapped[time] = mapped_column(Time)
    break_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    schedule: Mapped[WorkingSchedule] = relationship(back_populates="lines")

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        return f"<ScheduleLine d{self.day_of_week} {self.start_time}-{self.end_time}>"
