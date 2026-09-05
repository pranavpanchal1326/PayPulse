"""The pay basis: every day and hour figure a payslip is built from.

This is where B2.5, B3 and B4 converge (PRD section 4.2):

    period_days   = schedule working days in the period, minus holidays
    contract_days = period_days narrowed to the contract and employment
    unpaid_days   = unpaid leave + absence without leave
    payable_days  = contract_days - unpaid_days

Nothing here counts days itself - it composes calendar, attendance_service
and leave_engine so the payslip can never disagree with the attendance
screen or the leave balance.

The policy it implements is PRD section 4.1: schedule-anchored with
attendance-derived absence. An employee is paid for the days their schedule
and contract say they work, minus unpaid leave, minus days absent without
leave. Attendance does not *earn* pay; its absence removes it.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.config import settings
from app.services import (
    attendance_service,
    calendar,
    leave_engine,
    schedule_calc,
)


@dataclass(frozen=True)
class PayBasis:
    """Everything the rule engine needs about time, for one employee/period."""

    period_start: date
    period_end: date

    # period_days and contract_days are whole days - a period and an
    # employment window start and end on date boundaries. Everything derived
    # from leave is Decimal, because half a day of unpaid leave is half a
    # day's pay.
    period_days: int
    contract_days: int
    payable_days: Decimal
    unpaid_days: Decimal

    paid_leave_days: Decimal
    unpaid_leave_days: Decimal
    absent_days: int

    worked_hours: Decimal
    overtime_hours: Decimal
    missing_checkouts: int
    daily_hours: Decimal

    absence_policy: str

    def __post_init__(self) -> None:
        # PRD section 4.2 requires both invariants be asserted in code. A
        # basis that violated either would silently mis-pay.
        if self.contract_days > self.period_days:
            raise ValueError(
                f"contract_days ({self.contract_days}) exceeds period_days "
                f"({self.period_days})"
            )
        if self.payable_days + self.unpaid_days != self.contract_days:
            raise ValueError(
                f"payable_days ({self.payable_days}) + unpaid_days "
                f"({self.unpaid_days}) != contract_days ({self.contract_days})"
            )

    @property
    def is_prorated(self) -> bool:
        """Whether the contract covered only part of the pay period."""
        return self.contract_days < self.period_days

    def as_context(self) -> dict:
        """The time half of the formula evaluation context."""
        return {
            "period_days": self.period_days,
            "contract_days": self.contract_days,
            "payable_days": self.payable_days,
            # The brief's B7 "Worked Days", and the alias formulas may use.
            "worked_days": self.payable_days,
            "unpaid_days": self.unpaid_days,
            "paid_leave_days": self.paid_leave_days,
            "unpaid_leave_days": self.unpaid_leave_days,
            "absent_days": self.absent_days,
            "worked_hours": self.worked_hours,
            "overtime_hours": self.overtime_hours,
        }


def build(
    db: Session,
    employee,
    contract,
    period_start: date,
    period_end: date,
    holidays: frozenset[date] | None = None,
    *,
    attendance=None,
    leave_requests=None,
) -> PayBasis:
    """Assemble the pay basis for one employee and period.

    `holidays`, `attendance` and `leave_requests` may all be passed in
    pre-loaded: a payrun loads them once for the whole batch rather than
    once per employee (PRD section 10).
    """
    if holidays is None:
        holidays = calendar.holiday_dates(db, period_start, period_end)

    schedule = calendar.schedule_for(employee, contract)
    lines = schedule.lines if schedule is not None else []
    day_basis = calendar.compute_basis(
        lines, employee, contract, period_start, period_end, holidays
    )

    if attendance is None:
        attendance = attendance_service.summarise(
            db, employee.id, period_start, period_end
        )
    leave = leave_engine.approved_leave_days(
        db,
        employee,
        period_start,
        period_end,
        contract=contract,
        holidays=holidays,
        requests=leave_requests,
    )

    contract_dates = set(day_basis.contract_dates)
    # Leave outside the contract window must not reduce pay for a period the
    # employee was not employed in - which is why leave_engine returns dates
    # alongside the fractions.
    paid_leave_days, unpaid_leave_days = leave.within(contract_dates)

    absent = attendance_service.absent_dates(
        day_basis.contract_dates,
        attendance.dates_with_rows,
        leave.all_dates,
        settings.PAYROLL_ABSENCE_POLICY,
    )

    unpaid_days = unpaid_leave_days + Decimal(len(absent))

    return PayBasis(
        period_start=period_start,
        period_end=period_end,
        period_days=day_basis.period_days,
        contract_days=day_basis.contract_days,
        payable_days=Decimal(day_basis.contract_days) - unpaid_days,
        unpaid_days=unpaid_days,
        paid_leave_days=paid_leave_days,
        unpaid_leave_days=unpaid_leave_days,
        absent_days=len(absent),
        worked_hours=attendance.worked_hours,
        overtime_hours=attendance.overtime_hours,
        missing_checkouts=attendance.missing_checkouts,
        daily_hours=(
            schedule_calc.daily_hours(lines) if lines else Decimal("0.00")
        ),
        absence_policy=settings.PAYROLL_ABSENCE_POLICY,
    )
