"""Daily attendance (spec B3).

`worked_hours` and `overtime_hours` are computed server-side and never
accepted from a client - PRD v1 left worked_hours undefined entirely, which
is how a 22:00-06:00 night shift would have computed as -16 hours.

`work_date` is the calendar day in APP_TIMEZONE that the check-in falls on,
stored explicitly rather than derived at query time. It is what
UNIQUE (employee_id, work_date) keys on and what payroll intersects with
`contract_days`, so it has to be stable and indexable.

Note there is no ABSENT status: absence is the absence of a row (see
core/enums.AttendanceStatus).
"""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy import (
    Enum as SAEnum,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import AttendanceStatus
from app.db.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.employee import Employee
    from app.models.user import User


class Attendance(Base, TimestampMixin):
    __tablename__ = "attendance"
    __table_args__ = (
        # One row per employee per day. Stops a double check-in from
        # silently doubling someone's worked hours.
        UniqueConstraint("employee_id", "work_date", name="uq_attendance_day"),
        CheckConstraint("break_minutes >= 0", name="ck_attendance_break_positive"),
        CheckConstraint(
            "worked_hours >= 0 AND worked_hours <= 16",
            name="ck_attendance_worked_hours_range",
        ),
        CheckConstraint(
            "edit_reason IS NOT NULL OR is_manual_edit = false",
            name="ck_attendance_edit_needs_reason",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    employee_id: Mapped[int] = mapped_column(
        ForeignKey("employee.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # The calendar day in APP_TIMEZONE that check_in falls on.
    work_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    check_in: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    check_out: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    break_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # --- computed, never client-supplied ---
    worked_hours: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), nullable=False, default=Decimal("0.00")
    )
    overtime_hours: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), nullable=False, default=Decimal("0.00")
    )
    status: Mapped[AttendanceStatus] = mapped_column(
        SAEnum(
            AttendanceStatus,
            name="attendance_status_enum",
            native_enum=False,
            length=32,
        ),
        nullable=False,
        index=True,
    )

    # --- manual correction trail (spec B3: "restricted to authorized users") ---
    is_manual_edit: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False, index=True
    )
    edited_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("app_user.id", ondelete="SET NULL"), nullable=True
    )
    edit_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Denormalised so the dashboard can group without joining the schedule.
    is_holiday: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    notes: Mapped[str | None] = mapped_column(String(255), nullable=True)

    employee: Mapped[Employee] = relationship(back_populates="attendances")
    edited_by: Mapped[User | None] = relationship()

    @property
    def is_open(self) -> bool:
        """Checked in but never checked out."""
        return self.check_out is None

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        return (
            f"<Attendance {self.employee_id} {self.work_date} "
            f"{self.worked_hours}h {self.status}>"
        )
