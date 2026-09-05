"""Leave duration, balances, and consumption (spec A4, B4).

The brief: "Approved leave requests automatically deduct from assigned
allocations, ensuring balances are accurately consumed and transparently
linked." Three rules make that true rather than nominal.

**Duration is schedule- and holiday-aware.** A Fri-Mon request on a
five-day week is 2 days, not 4, and 1 if the Monday is a public holiday.
Counting calendar days would silently overcharge every balance and every
payslip. It reuses services/calendar, so leave and payroll can never
disagree about which days are working days.

**Over-balance blocks at approval.** PRD v1 raised a warning that changed
nothing, so a balance could go negative while pay stayed the same - which
broke the second demo scenario's own premise. v3 refuses the approval
instead (PRD section 3.6). Unpaid leave still reaches payroll through a
type with is_paid = False, which needs no balance arithmetic at all.

**Paid and unpaid leave are separated by type**, and that split is what the
payroll engine consumes as paid_leave_days / unpaid_leave_days.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.enums import HalfDay, LeaveUnit, RequestState
from app.core.errors import BusinessRuleError, ConflictError
from app.models.timeoff import LeaveAllocation, TimeOffRequest, TimeOffType
from app.services import calendar, contract_resolver, schedule_calc

_CENTS = Decimal("0.01")
CONSUMING_STATES = (RequestState.APPROVED,)
PENDING_STATES = (RequestState.DRAFT, RequestState.TO_APPROVE)
# States that still hold a claim on the calendar, so two of them may not
# cover the same day.
LIVE_STATES = (RequestState.DRAFT, RequestState.TO_APPROVE, RequestState.APPROVED)


def leave_working_dates(
    db: Session,
    employee,
    date_from: date,
    date_to: date,
    *,
    contract=None,
    holidays: frozenset[date] | None = None,
) -> list[date]:
    """Working days in a request's span, holidays and weekends removed.

    Uses the same calendar payroll uses, so a day can never be leave here
    and a non-working day there.

    `contract` and `holidays` may be supplied by a caller that already has
    them. Payroll always does, and without them this resolves the contract
    and reloads the holiday table once per leave request - a nested N+1
    inside the per-employee loop of a payrun.
    """
    if contract is None:
        contract = contract_resolver.active_on(db, employee.id, date_to) or (
            contract_resolver.active_on(db, employee.id, date_from)
        )
    schedule = calendar.schedule_for(employee, contract)
    if schedule is None:
        return []
    if holidays is None:
        holidays = calendar.holiday_dates(db, date_from, date_to)
    return calendar.working_dates(schedule.lines, date_from, date_to, holidays)


def daily_hours_for(db: Session, employee, on: date) -> Decimal:
    """The employee's contracted hours per working day - the divisor that
    turns an hour-unit request into days."""
    contract = contract_resolver.active_on(db, employee.id, on)
    schedule = calendar.schedule_for(employee, contract)
    if schedule is None or not schedule.lines:
        return Decimal("0.00")
    return schedule_calc.daily_hours(schedule.lines)


def compute_duration(
    db: Session,
    employee,
    time_off_type: TimeOffType,
    date_from: date,
    date_to: date,
    hours: Decimal | None = None,
    half_day: HalfDay | None = None,
) -> tuple[Decimal, Decimal | None]:
    """Return (duration_days, duration_hours) for a request.

    Hour-unit types convert here: days = hours / contract_daily_hours. That
    conversion is the path PRD v1 was missing entirely - LeaveUnit.HOURS
    existed in the enum with nowhere to go.
    """
    if date_to < date_from:
        raise BusinessRuleError(
            "date_to cannot be before date_from", code="invalid_date_range"
        )

    working = leave_working_dates(db, employee, date_from, date_to)

    if half_day is not None:
        if date_from != date_to:
            raise BusinessRuleError(
                "A half day covers one date, so date_from and date_to must "
                "match.",
                code="half_day_spans_range",
                field_errors=[
                    {"field": "half_day", "message": "Only valid on a single day"}
                ],
            )
        if not working:
            raise BusinessRuleError(
                f"{date_from} is not a working day for this employee, so "
                "there is no half of it to take.",
                code="no_working_days",
            )
        # Half a working day, whichever half. Hour-unit types are excluded
        # because they already express fractions, in their own unit.
        if time_off_type.unit is LeaveUnit.HOURS:
            raise BusinessRuleError(
                f"{time_off_type.name} is measured in hours - ask for half a "
                "day's worth of hours instead.",
                code="half_day_on_hour_type",
            )
        per_day = daily_hours_for(db, employee, date_from)
        return Decimal("0.50"), (
            (per_day / 2).quantize(_CENTS, rounding=ROUND_HALF_UP)
            if per_day > 0
            else None
        )

    if time_off_type.unit is LeaveUnit.HOURS:
        if hours is None or hours <= 0:
            raise BusinessRuleError(
                f"{time_off_type.name} is measured in hours, so duration_hours "
                "is required and must be positive.",
                code="hours_required",
                field_errors=[
                    {"field": "duration_hours", "message": "Required for this type"}
                ],
            )
        per_day = daily_hours_for(db, employee, date_from)
        if per_day <= 0:
            raise BusinessRuleError(
                "This employee has no working schedule, so hours cannot be "
                "converted into days.",
                code="no_schedule",
            )
        days = (Decimal(hours) / per_day).quantize(_CENTS, rounding=ROUND_HALF_UP)
        return days, Decimal(hours).quantize(_CENTS)

    if not working:
        raise BusinessRuleError(
            f"{date_from} to {date_to} contains no working days for this "
            "employee - it is entirely weekend or public holiday.",
            code="no_working_days",
        )
    return Decimal(len(working)), None


# --- balances ---------------------------------------------------------


@dataclass(frozen=True)
class Balance:
    """One type's balance for one employee (spec A4: taken, remaining,
    validity). `pending` is added because approval now blocks past zero:
    the employee has to be able to see what they have already committed
    before they file more."""

    time_off_type_id: int
    type_name: str
    type_code: str
    unit: LeaveUnit
    is_paid: bool
    requires_allocation: bool
    allocated: Decimal
    taken: Decimal
    pending: Decimal
    validity_from: date | None
    validity_to: date | None

    @property
    def remaining(self) -> Decimal:
        return self.allocated - self.taken

    @property
    def projected_remaining(self) -> Decimal:
        """What is left if everything currently filed gets approved."""
        return self.remaining - self.pending


def balances(
    db: Session, employee_id: int, on: date | None = None
) -> list[Balance]:
    """Every active type's balance for one employee."""
    reference = on or date.today()
    types = list(
        db.scalars(
            select(TimeOffType)
            .where(TimeOffType.is_active.is_(True))
            .order_by(TimeOffType.name)
        )
    )

    allocations = list(
        db.scalars(
            select(LeaveAllocation).where(
                LeaveAllocation.employee_id == employee_id,
                LeaveAllocation.state == RequestState.APPROVED,
            )
        )
    )
    requests = list(
        db.scalars(
            select(TimeOffRequest).where(
                TimeOffRequest.employee_id == employee_id,
                TimeOffRequest.state.in_(LIVE_STATES),
            )
        )
    )

    result = []
    for type_ in types:
        valid = [
            a
            for a in allocations
            if a.time_off_type_id == type_.id and a.covers(reference)
        ]
        mine = [r for r in requests if r.time_off_type_id == type_.id]
        result.append(
            Balance(
                time_off_type_id=type_.id,
                type_name=type_.name,
                type_code=type_.code,
                unit=type_.unit,
                is_paid=type_.is_paid,
                requires_allocation=type_.requires_allocation,
                allocated=sum((a.days for a in valid), Decimal("0.00")),
                taken=sum(
                    (r.duration_days for r in mine if r.is_consuming),
                    Decimal("0.00"),
                ),
                pending=sum(
                    (r.duration_days for r in mine if r.is_pending), Decimal("0.00")
                ),
                validity_from=min((a.validity_from for a in valid), default=None),
                validity_to=(
                    max((a.validity_to for a in valid if a.validity_to), default=None)
                    if valid
                    else None
                ),
            )
        )
    return result


def balance_for(db: Session, employee_id: int, type_id: int, on: date | None = None):
    for balance in balances(db, employee_id, on):
        if balance.time_off_type_id == type_id:
            return balance
    return None


# --- consumption ------------------------------------------------------


def assert_no_overlap(
    db: Session, request: TimeOffRequest, exclude_id: int | None = None
) -> None:
    """One claim per day. Two live requests over the same day would consume
    the balance twice and make the pay basis ambiguous."""
    stmt = select(TimeOffRequest).where(
        TimeOffRequest.employee_id == request.employee_id,
        TimeOffRequest.state.in_(LIVE_STATES),
        TimeOffRequest.date_from <= request.date_to,
        TimeOffRequest.date_to >= request.date_from,
    )
    if exclude_id is not None:
        stmt = stmt.where(TimeOffRequest.id != exclude_id)
    clash = db.scalar(stmt)
    if clash is not None:
        raise ConflictError(
            f"This overlaps an existing request from {clash.date_from} to "
            f"{clash.date_to} ({clash.state}).",
            code="overlapping_leave_request",
        )


def assert_within_balance(
    db: Session, request: TimeOffRequest, type_: TimeOffType
) -> None:
    """Refuse an approval that would overdraw the balance.

    This is the consequence PRD v1 lacked: it warned and let the balance go
    negative while pay stayed unchanged, which meant leave never actually
    reached payroll.
    """
    if not type_.requires_allocation:
        return

    # Serialize concurrent approvals for this employee and type. The check
    # below is check-then-act on a balance derived from these rows, so two
    # approvals racing here would both see the same remaining days and both
    # commit, overdrawing the allocation this function exists to protect.
    # An employee with no allocation rows locks nothing, but their remaining
    # balance is zero, so no approval can succeed anyway.
    db.execute(
        select(LeaveAllocation.id)
        .where(
            LeaveAllocation.employee_id == request.employee_id,
            LeaveAllocation.time_off_type_id == type_.id,
            LeaveAllocation.state == RequestState.APPROVED,
        )
        .with_for_update()
    )

    balance = balance_for(db, request.employee_id, type_.id, request.date_from)
    if balance is None:
        return
    if request.duration_days > balance.remaining:
        raise BusinessRuleError(
            f"{request.duration_days} days requested but only "
            f"{balance.remaining} remaining on {type_.name}. Allocate more "
            "days, or file this as an unpaid leave type.",
            code="LEAVE_EXCEEDS_ALLOCATION",
            field_errors=[
                {
                    "field": "duration_days",
                    "message": f"Exceeds remaining balance by "
                    f"{request.duration_days - balance.remaining}",
                }
            ],
        )


# --- what payroll consumes --------------------------------------------


@dataclass(frozen=True)
class LeaveDays:
    """Approved leave inside a period, split the way the pay basis needs it
    (PRD section 4.2).

    Date -> fraction of that day, not a set of dates, because a half day is
    half a day's pay. The fraction is what payroll deducts; the dates are what
    absence derivation subtracts, and for that a half day still counts as the
    date being accounted for - somebody who took the morning off and worked
    the afternoon was not absent.
    """

    paid: dict[date, Decimal]
    unpaid: dict[date, Decimal]

    @property
    def paid_dates(self) -> frozenset[date]:
        return frozenset(self.paid)

    @property
    def unpaid_dates(self) -> frozenset[date]:
        return frozenset(self.unpaid)

    @property
    def all_dates(self) -> frozenset[date]:
        return self.paid_dates | self.unpaid_dates

    @property
    def paid_days(self) -> Decimal:
        return sum(self.paid.values(), Decimal("0.00"))

    @property
    def unpaid_days(self) -> Decimal:
        return sum(self.unpaid.values(), Decimal("0.00"))

    def within(self, dates) -> tuple[Decimal, Decimal]:
        """(paid, unpaid) day counts restricted to `dates`.

        Leave outside the contract window must not reduce pay for a period the
        employee was not employed in, which is why the caller passes the
        contract's dates rather than this trusting its own keys.
        """
        allowed = set(dates)
        return (
            sum((v for d, v in self.paid.items() if d in allowed), Decimal("0.00")),
            sum((v for d, v in self.unpaid.items() if d in allowed), Decimal("0.00")),
        )


def approved_leave_days(
    db: Session,
    employee,
    period_start: date,
    period_end: date,
    *,
    contract=None,
    holidays: frozenset[date] | None = None,
    requests=None,
) -> LeaveDays:
    """Approved leave dates in a period, split by whether the type is paid.

    Returns *dates* rather than counts so the caller can intersect them with
    contract_days - a leave day outside the contract window must not reduce
    pay for a period the employee was not employed in.

    `contract`, `holidays` and `requests` are the payroll fast path: a payrun
    loads all three once for the whole batch instead of per employee.
    """
    if requests is None:
        requests = list(
            db.scalars(
                select(TimeOffRequest)
                .where(
                    TimeOffRequest.employee_id == employee.id,
                    TimeOffRequest.state == RequestState.APPROVED,
                    TimeOffRequest.date_from <= period_end,
                    TimeOffRequest.date_to >= period_start,
                )
                .options(selectinload(TimeOffRequest.time_off_type))
            )
        )

    paid: dict[date, Decimal] = {}
    unpaid: dict[date, Decimal] = {}
    for request in requests:
        span_start = max(request.date_from, period_start)
        span_end = min(request.date_to, period_end)
        days = leave_working_dates(
            db, employee, span_start, span_end,
            contract=contract, holidays=holidays,
        )
        # A half day is only ever one date, so the fraction applies to all of
        # the (single) day this request contributes.
        share = Decimal("0.50") if request.half_day is not None else Decimal("1.00")
        bucket = paid if request.time_off_type.is_paid else unpaid
        for day in days:
            # Two requests touching one date would be an overlap, which
            # assert_no_overlap rejects - so the larger claim wins rather than
            # the sum, which could otherwise exceed a whole day.
            bucket[day] = max(bucket.get(day, Decimal("0.00")), share)

    return LeaveDays(paid=paid, unpaid=unpaid)


def approved_requests_many(
    db: Session, employee_ids: list[int], period_start: date, period_end: date
) -> dict[int, list]:
    """Approved requests overlapping a period for a batch, in one query."""
    if not employee_ids:
        return {}

    grouped: dict[int, list] = {eid: [] for eid in employee_ids}
    for request in db.scalars(
        select(TimeOffRequest)
        .where(
            TimeOffRequest.employee_id.in_(employee_ids),
            TimeOffRequest.state == RequestState.APPROVED,
            TimeOffRequest.date_from <= period_end,
            TimeOffRequest.date_to >= period_start,
        )
        .options(selectinload(TimeOffRequest.time_off_type))
    ):
        grouped[request.employee_id].append(request)
    return grouped


def leave_dates(
    db: Session, employee, period_start: date, period_end: date
) -> frozenset[date]:
    """All approved leave dates in a period - what absence derivation
    subtracts so leave is never counted as absence."""
    return approved_leave_days(db, employee, period_start, period_end).all_dates
