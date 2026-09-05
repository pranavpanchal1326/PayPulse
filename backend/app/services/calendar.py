"""Day counting - the single source of truth (PRD section 4.2).

No other module counts days. Every number here ends up printed on a payslip,
and everything downstream (proration, leave duration, the pay basis) is
derived from it, which is why this lands with its own tests before anything
consumes it.

    period_days   = schedule working days in the period, minus public holidays
                    -- the DENOMINATOR, identical for everyone on a schedule
    contract_days = period_days narrowed to the contract term and the
                    employee's own joining/exit dates
                    -- the PRORATION numerator

`contract_days < period_days` is exactly the joiner/leaver case, and PRD v1
had no concept of it: a joiner on the 20th was paid a full month.

The pure functions take an explicit set of holiday dates so the arithmetic
is testable without a database. `basis_for` is the wrapper that loads them.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.holiday import PublicHoliday


def date_range(start: date, end: date):
    """Every date in [start, end], inclusive at both ends."""
    current = start
    while current <= end:
        yield current
        current += timedelta(days=1)


def scheduled_weekdays(schedule_lines) -> frozenset[int]:
    """The weekdays a schedule covers. Monday is 0.

    An empty schedule yields an empty set, which correctly produces zero
    working days rather than silently assuming Monday-to-Friday.
    """
    return frozenset(line.day_of_week for line in schedule_lines)


def working_dates(
    schedule_lines, start: date, end: date, holidays: frozenset[date] = frozenset()
) -> list[date]:
    """Dates in the range the employee is scheduled to work and it is not a
    public holiday. The list, not just the count, so callers that need to
    intersect with attendance or leave (B3, B4) do not re-derive it."""
    if end < start:
        return []
    weekdays = scheduled_weekdays(schedule_lines)
    return [
        day
        for day in date_range(start, end)
        if day.weekday() in weekdays and day not in holidays
    ]


def holiday_dates(
    db: Session, start: date, end: date, *, include_optional: bool = False
) -> frozenset[date]:
    """Non-optional public holidays in the range.

    Optional ("restricted") holidays are excluded by default: the employee is
    still expected to work, so they must not reduce the denominator.
    """
    stmt = select(PublicHoliday.date).where(
        PublicHoliday.date >= start, PublicHoliday.date <= end
    )
    if not include_optional:
        stmt = stmt.where(PublicHoliday.is_optional.is_(False))
    return frozenset(db.scalars(stmt))


def _overlap(
    a_start: date, a_end: date | None, b_start: date, b_end: date
) -> tuple[date, date] | None:
    """Intersection of [a_start, a_end] and [b_start, b_end]; None if disjoint.

    `a_end` of None means open-ended.
    """
    start = max(a_start, b_start)
    end = b_end if a_end is None else min(a_end, b_end)
    return (start, end) if start <= end else None


def employment_window(employee, period_start: date, period_end: date):
    """The period narrowed to the employee's own joining/exit dates."""
    return _overlap(
        employee.date_of_joining, employee.date_of_exit, period_start, period_end
    )


@dataclass(frozen=True)
class PeriodBasis:
    """Day counts for one employee, one contract, one period.

    B3 and B4 extend this with attendance and leave to reach `payable_days`;
    B2.5 delivers the two figures that depend on nothing else.
    """

    period_start: date
    period_end: date
    period_days: int
    contract_days: int
    holidays_in_period: int
    contract_window_start: date | None
    contract_window_end: date | None
    period_dates: tuple[date, ...] = ()
    contract_dates: tuple[date, ...] = ()

    @property
    def is_prorated(self) -> bool:
        """True when the employee was not on this contract for the whole period."""
        return self.contract_days < self.period_days

    @property
    def proration_ratio(self) -> float:
        """contract_days / period_days, for display. Payroll uses Decimal."""
        return self.contract_days / self.period_days if self.period_days else 0.0

    def __post_init__(self) -> None:
        # The invariant PRD section 4.2 requires be asserted in code. A basis
        # that violates it would silently overpay.
        if self.contract_days > self.period_days:
            raise ValueError(
                f"contract_days ({self.contract_days}) exceeds period_days "
                f"({self.period_days}); the contract window was not clipped "
                "to the period."
            )


def compute_basis(
    schedule_lines,
    employee,
    contract,
    period_start: date,
    period_end: date,
    holidays: frozenset[date] = frozenset(),
) -> PeriodBasis:
    """Day counts from already-loaded objects. Pure: no database access.

    `contract` may be None, which yields contract_days = 0 - the employee is
    on the payrun but has nothing to be paid against.
    """
    if period_end < period_start:
        raise ValueError("period_end cannot be before period_start")

    period = working_dates(schedule_lines, period_start, period_end, holidays)

    window = employment_window(employee, period_start, period_end)
    if window is not None and contract is not None:
        window = _overlap(contract.date_start, contract.date_end, *window)

    if window is None or contract is None:
        contract_dates: list[date] = []
        window_start = window_end = None
    else:
        window_start, window_end = window
        # Intersect with the period's working dates rather than recounting,
        # so a holiday can never be counted as a contract day.
        contract_dates = [d for d in period if window_start <= d <= window_end]

    return PeriodBasis(
        period_start=period_start,
        period_end=period_end,
        period_days=len(period),
        contract_days=len(contract_dates),
        holidays_in_period=len(
            [d for d in holidays if period_start <= d <= period_end]
        ),
        contract_window_start=window_start,
        contract_window_end=window_end,
        period_dates=tuple(period),
        contract_dates=tuple(contract_dates),
    )


def schedule_for(employee, contract):
    """Which working schedule applies.

    The contract's schedule wins when set: spec A3 allows assigning schedules
    "to employees or contracts", and the contract is the more specific of the
    two. Falls back to the employee's, then to nothing.
    """
    if contract is not None and contract.working_schedule is not None:
        return contract.working_schedule
    return employee.working_schedule


def basis_for(
    db: Session, employee, contract, period_start: date, period_end: date
) -> PeriodBasis:
    """Day counts for an employee and period, loading holidays and schedule.

    The entry point payroll calls. Callers computing a whole payrun should
    load holidays once with `holiday_dates` and use `compute_basis` directly
    rather than paying for one query per employee (PRD section 10).
    """
    schedule = schedule_for(employee, contract)
    lines = schedule.lines if schedule is not None else []
    holidays = holiday_dates(db, period_start, period_end)
    return compute_basis(
        lines, employee, contract, period_start, period_end, holidays
    )
