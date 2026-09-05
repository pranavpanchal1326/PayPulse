"""Attendance computation and derived absence (spec B3, PRD section 3.4).

Two things live here that must not live in a router.

`worked_hours` is computed, never accepted from a client. PRD v1 never
defined it, which left a 22:00-06:00 night shift computing as -16 hours.
The rule matches services/schedule_calc: a check-out at or before the
check-in means the shift crossed midnight.

`absent_days` is *derived*, not stored. Absence is the absence of a row, so
it can only be computed as
    scheduled days - days with a row - days on approved leave
which is a different shape from the per-row status field PRD v1 described.
B3 supplies the attendance half; B4 passes in the leave dates.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from decimal import ROUND_HALF_UP, Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.enums import AbsencePolicy, AttendanceStatus
from app.core.errors import BusinessRuleError
from app.models.attendance import Attendance

_CENTS = Decimal("0.01")
MAX_WORKED_HOURS = Decimal("16.00")


def app_timezone() -> ZoneInfo:
    return ZoneInfo(settings.APP_TIMEZONE)


def local(moment: datetime) -> datetime:
    """A stored (UTC) timestamp as wall-clock time in the app's timezone."""
    if moment.tzinfo is None:
        raise ValueError("attendance timestamps must be timezone-aware")
    return moment.astimezone(app_timezone())


def work_date_for(check_in: datetime) -> date:
    """The calendar day a check-in belongs to.

    Bucketed in APP_TIMEZONE, not UTC: a 20:30 UTC check-in is the *next*
    day in Kolkata, and putting it in the wrong day can move it into the
    wrong payroll period entirely.
    """
    return local(check_in).date()


def compute_worked_hours(
    check_in: datetime, check_out: datetime | None, break_minutes: int = 0
) -> Decimal:
    """Paid hours for one attendance row, net of the unpaid break.

    An open row (no check-out) is worth zero rather than an error: the
    employee is mid-shift or forgot, and either way the row must still be
    storable so MISSING_CHECKOUT can be raised against it.
    """
    if check_out is None:
        return Decimal("0.00")

    span = check_out - check_in
    if span <= timedelta(0):
        # Crossed midnight - the same reading schedule_calc uses.
        span += timedelta(days=1)

    minutes = span.total_seconds() / 60 - (break_minutes or 0)

    if span > timedelta(hours=16):
        raise BusinessRuleError(
            f"A shift of {span.total_seconds() / 3600:.1f}h exceeds the 16h "
            "maximum. Check the check-in and check-out times.",
            code="shift_too_long",
        )
    if minutes <= 0:
        raise BusinessRuleError(
            f"A {break_minutes} minute break leaves no working time in a "
            f"{span.total_seconds() / 60:.0f} minute shift.",
            code="invalid_break",
        )
    return (Decimal(minutes) / Decimal(60)).quantize(_CENTS, rounding=ROUND_HALF_UP)


def compute_overtime(worked: Decimal, scheduled_daily_hours: Decimal) -> Decimal:
    """Hours beyond the day's scheduled length.

    Every hour counts as overtime when the day was not scheduled at all -
    a public holiday, or a weekend call-in.
    """
    if scheduled_daily_hours <= 0:
        return worked.quantize(_CENTS, rounding=ROUND_HALF_UP)
    return max(Decimal("0.00"), worked - scheduled_daily_hours).quantize(
        _CENTS, rounding=ROUND_HALF_UP
    )


def derive_status(
    check_in: datetime,
    check_out: datetime | None,
    worked: Decimal,
    scheduled_start: time | None,
    scheduled_daily_hours: Decimal,
) -> AttendanceStatus:
    """The row's status. Order matters: an open row is MISSING_CHECKOUT
    before anything else, because its hours are not yet knowable."""
    if check_out is None:
        return AttendanceStatus.MISSING_CHECKOUT
    if scheduled_daily_hours > 0 and worked > scheduled_daily_hours:
        return AttendanceStatus.OVERTIME
    if scheduled_start is not None:
        grace = timedelta(minutes=settings.LATE_GRACE_MINUTES)
        expected = datetime.combine(local(check_in).date(), scheduled_start)
        if local(check_in).replace(tzinfo=None) > expected + grace:
            return AttendanceStatus.LATE
    return AttendanceStatus.PRESENT


def scheduled_start_for(schedule, day: date) -> time | None:
    """The start time on a given weekday, or None if not a working day."""
    if schedule is None:
        return None
    for line in schedule.lines:
        if line.day_of_week == day.weekday():
            return line.start_time
    return None


def recompute(attendance: Attendance, schedule, daily_hours: Decimal) -> Attendance:
    """Refresh every derived field. The single write path for a row."""
    attendance.work_date = work_date_for(attendance.check_in)
    attendance.worked_hours = compute_worked_hours(
        attendance.check_in, attendance.check_out, attendance.break_minutes
    )
    scheduled_start = scheduled_start_for(schedule, attendance.work_date)
    # A day the schedule does not cover has no expected length, so all of it
    # is overtime.
    day_hours = daily_hours if scheduled_start is not None else Decimal("0.00")
    attendance.overtime_hours = compute_overtime(attendance.worked_hours, day_hours)
    attendance.status = derive_status(
        attendance.check_in,
        attendance.check_out,
        attendance.worked_hours,
        scheduled_start,
        day_hours,
    )
    return attendance


# --- aggregates over a period -----------------------------------------


@dataclass(frozen=True)
class AttendanceSummary:
    """What payroll and the dashboard need from attendance for one period."""

    worked_hours: Decimal = Decimal("0.00")
    overtime_hours: Decimal = Decimal("0.00")
    present: int = 0
    late: int = 0
    overtime_days: int = 0
    missing_checkouts: int = 0
    manual_edits: int = 0
    dates_with_rows: frozenset[date] = field(default_factory=frozenset)

    @property
    def rows(self) -> int:
        return len(self.dates_with_rows)


def summarise(
    db: Session, employee_id: int, period_start: date, period_end: date
) -> AttendanceSummary:
    """Aggregate one employee's attendance over a period."""
    rows = list(
        db.scalars(
            select(Attendance).where(
                Attendance.employee_id == employee_id,
                Attendance.work_date >= period_start,
                Attendance.work_date <= period_end,
            )
        )
    )
    return summarise_rows(rows)


def summarise_rows(rows) -> AttendanceSummary:
    """Pure aggregation, so payroll can reuse it over a bulk-loaded batch."""
    return AttendanceSummary(
        worked_hours=sum((r.worked_hours for r in rows), Decimal("0.00")),
        overtime_hours=sum((r.overtime_hours for r in rows), Decimal("0.00")),
        present=sum(1 for r in rows if r.status is AttendanceStatus.PRESENT),
        late=sum(1 for r in rows if r.status is AttendanceStatus.LATE),
        overtime_days=sum(1 for r in rows if r.status is AttendanceStatus.OVERTIME),
        missing_checkouts=sum(
            1 for r in rows if r.status is AttendanceStatus.MISSING_CHECKOUT
        ),
        manual_edits=sum(1 for r in rows if r.is_manual_edit),
        dates_with_rows=frozenset(r.work_date for r in rows),
    )


def absent_dates(
    contract_dates,
    dates_with_rows: frozenset[date],
    leave_dates: frozenset[date] = frozenset(),
    policy: AbsencePolicy | str = AbsencePolicy.TREAT_AS_UNPAID,
) -> frozenset[date]:
    """Scheduled days with neither an attendance row nor approved leave.

    This is the derivation ABSENT-as-a-row-status could never express, and
    it is what the dashboard's "Absent" figure (spec B9) reports.

    `leave_dates` is empty until B4 supplies approved leave; until then every
    uncovered scheduled day reads as absent, which is the correct answer
    given the data that exists.
    """
    if AbsencePolicy(policy) is AbsencePolicy.IGNORE:
        return frozenset()
    return frozenset(contract_dates) - dates_with_rows - leave_dates


def open_row_for(db: Session, employee_id: int, day: date) -> Attendance | None:
    """The employee's row for a day, if any. Used by check-in/check-out."""
    return db.scalar(
        select(Attendance).where(
            Attendance.employee_id == employee_id, Attendance.work_date == day
        )
    )
