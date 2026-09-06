"""Time off: types, allocations, and requests (spec A4, B4).

The brief's third named hard part: "Approved leave requests automatically
deduct from assigned allocations, ensuring balances are accurately consumed
and transparently linked."

Two things are stored rather than recomputed, on purpose:

`duration_days` is frozen on the request. It is schedule- and holiday-aware
(a Fri-Mon request on a five-day week is 2 days, not 4), and payroll must
read exactly the number that was approved - not one recomputed later against
a schedule that may since have changed.

`is_paid` lives on the *type*, which is how unpaid leave reaches payroll.
PRD v3 blocks approval past a balance rather than reclassifying the excess,
so no per-request paid/unpaid split is needed (PRD section 3.6).
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy import (
    Enum as SAEnum,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import HalfDay, LeaveUnit, RequestState
from app.db.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.employee import Employee
    from app.models.user import User


class TimeOffType(Base, TimestampMixin):
    """A leave policy (spec A4)."""

    __tablename__ = "time_off_type"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    code: Mapped[str] = mapped_column(String(20), unique=True, index=True)

    unit: Mapped[LeaveUnit] = mapped_column(
        SAEnum(LeaveUnit, name="leave_unit_enum", native_enum=False, length=16),
        default=LeaveUnit.DAYS,
        nullable=False,
    )
    # False means every approved day of this type becomes an LWP deduction.
    is_paid: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # False means the type has no balance to consume (e.g. unpaid leave).
    requires_allocation: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )
    color: Mapped[str | None] = mapped_column(String(16), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    allocations: Mapped[list[LeaveAllocation]] = relationship(
        back_populates="time_off_type"
    )
    requests: Mapped[list[TimeOffRequest]] = relationship(
        back_populates="time_off_type"
    )

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        return f"<TimeOffType {self.code} paid={self.is_paid}>"


class LeaveAllocation(Base, TimestampMixin):
    """A balance granted to an employee. Approval gates availability."""

    __tablename__ = "leave_allocation"
    __table_args__ = (
        CheckConstraint("days > 0", name="ck_allocation_days_positive"),
        CheckConstraint(
            "validity_to IS NULL OR validity_to >= validity_from",
            name="ck_allocation_validity_order",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    employee_id: Mapped[int] = mapped_column(
        ForeignKey("employee.id", ondelete="CASCADE"), nullable=False, index=True
    )
    time_off_type_id: Mapped[int] = mapped_column(
        ForeignKey("time_off_type.id", ondelete="CASCADE"), nullable=False, index=True
    )

    days: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False)
    validity_from: Mapped[date] = mapped_column(Date, nullable=False)
    validity_to: Mapped[date | None] = mapped_column(Date, nullable=True)

    state: Mapped[RequestState] = mapped_column(
        SAEnum(
            RequestState, name="request_state_enum", native_enum=False, length=32
        ),
        default=RequestState.DRAFT,
        nullable=False,
        index=True,
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Who decided, and why. Mirrors `TimeOffRequest` below: an allocation is
    # refused by a person for a reason, and both outlive the decision.
    approver_id: Mapped[int | None] = mapped_column(
        ForeignKey("app_user.id", ondelete="SET NULL"), nullable=True
    )
    decision_note: Mapped[str | None] = mapped_column(Text, nullable=True)

    employee: Mapped[Employee] = relationship(back_populates="allocations")
    time_off_type: Mapped[TimeOffType] = relationship(back_populates="allocations")
    approver: Mapped[User | None] = relationship()

    def covers(self, day: date) -> bool:
        """Whether this allocation is valid on `day`."""
        if day < self.validity_from:
            return False
        return self.validity_to is None or day <= self.validity_to

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        return f"<LeaveAllocation emp={self.employee_id} {self.days}d {self.state}>"


class TimeOffRequest(Base, TimestampMixin):
    """A leave request. Approval is what consumes the balance."""

    __tablename__ = "time_off_request"
    __table_args__ = (
        CheckConstraint("date_to >= date_from", name="ck_request_date_order"),
        CheckConstraint("duration_days >= 0", name="ck_request_duration_positive"),
        # A half day is half of *one* day. Spanning a range and calling it a
        # half is not a shorter leave, it is an ambiguous one.
        CheckConstraint(
            "half_day IS NULL OR date_from = date_to",
            name="ck_request_half_day_is_single_day",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    employee_id: Mapped[int] = mapped_column(
        ForeignKey("employee.id", ondelete="CASCADE"), nullable=False, index=True
    )
    time_off_type_id: Mapped[int] = mapped_column(
        ForeignKey("time_off_type.id", ondelete="CASCADE"), nullable=False, index=True
    )

    date_from: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    date_to: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    # Frozen at write time: schedule- and holiday-aware working days, or the
    # hour-unit conversion. Payroll reads this, never a recomputation.
    duration_days: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), nullable=False, default=Decimal("0.00")
    )
    # Only meaningful when the type's unit is HOURS.
    # Null means a whole day. See HalfDay for why this is not a boolean.
    half_day: Mapped[HalfDay | None] = mapped_column(
        SAEnum(HalfDay, name="half_day_enum", native_enum=False, length=16),
        nullable=True,
    )
    duration_hours: Mapped[Decimal | None] = mapped_column(
        Numeric(6, 2), nullable=True
    )

    state: Mapped[RequestState] = mapped_column(
        SAEnum(
            RequestState, name="request_state_enum", native_enum=False, length=32
        ),
        default=RequestState.DRAFT,
        nullable=False,
        index=True,
    )
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    approver_id: Mapped[int | None] = mapped_column(
        ForeignKey("app_user.id", ondelete="SET NULL"), nullable=True
    )
    decision_note: Mapped[str | None] = mapped_column(Text, nullable=True)

    employee: Mapped[Employee] = relationship(back_populates="time_off_requests")
    time_off_type: Mapped[TimeOffType] = relationship(back_populates="requests")
    approver: Mapped[User | None] = relationship()

    @property
    def is_consuming(self) -> bool:
        """Whether this request has actually drawn down a balance."""
        return self.state is RequestState.APPROVED

    @property
    def is_pending(self) -> bool:
        """Filed but not yet decided - shown so an employee can see what they
        have already committed before filing more."""
        return self.state in (RequestState.DRAFT, RequestState.TO_APPROVE)

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        return (
            f"<TimeOffRequest emp={self.employee_id} "
            f"{self.date_from}..{self.date_to} {self.duration_days}d {self.state}>"
        )
