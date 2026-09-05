"""Weekly hours, derived from the day pattern.

Spec A3: "Calculate total weekly hours automatically from the defined
schedule rather than entering them manually." This module is the only place
that turns schedule lines into hours; the API never accepts hours_per_week
from a client.

It also settles midnight-crossing here rather than in the payroll engine, so
the seeded 22:00-06:00 night shift is 8 hours everywhere in the system
instead of -16 (PRD section 3.1, 3.4).
"""
from __future__ import annotations

from collections.abc import Iterable
from datetime import time
from decimal import ROUND_HALF_UP, Decimal
from typing import Protocol

from app.core.enums import Weekday
from app.core.errors import BusinessRuleError

MINUTES_PER_DAY = 24 * 60
# A single shift longer than this is a data-entry error, not a work pattern.
MAX_SHIFT_MINUTES = 16 * 60

_CENTS = Decimal("0.01")


class ScheduleLineLike(Protocol):
    """Anything with the four fields that define a working day.

    Typed structurally so this works on ORM rows and on Pydantic payloads
    that have not been persisted yet - the create endpoint needs the hours
    before there is a row to read them from.
    """

    day_of_week: Weekday
    start_time: time
    end_time: time
    break_minutes: int


def _minutes(value: time) -> int:
    return value.hour * 60 + value.minute


def line_minutes(
    start: time, end: time, break_minutes: int = 0, *, day_of_week: Weekday | None = None
) -> int:
    """Paid minutes for one working day, net of the unpaid break.

    `end` at or before `start` is read as crossing midnight, which is how a
    night shift is expressed: 22:00-06:00 is 8 hours, not -16.
    """
    span = _minutes(end) - _minutes(start)
    if span <= 0:
        span += MINUTES_PER_DAY

    where = (
        f" on {Weekday(day_of_week).label}" if day_of_week is not None else ""
    )

    if span > MAX_SHIFT_MINUTES:
        raise BusinessRuleError(
            f"Shift{where} spans {span / 60:.1f}h, over the {MAX_SHIFT_MINUTES // 60}h "
            "maximum. Check the start and end times.",
            code="shift_too_long",
        )
    if break_minutes < 0:
        raise BusinessRuleError(
            f"Break{where} cannot be negative.", code="invalid_break"
        )
    if break_minutes >= span:
        raise BusinessRuleError(
            f"Break{where} ({break_minutes} min) is not shorter than the "
            f"{span} min shift, which would leave no working time.",
            code="invalid_break",
        )
    return span - break_minutes


def line_hours(line: ScheduleLineLike) -> Decimal:
    minutes = line_minutes(
        line.start_time,
        line.end_time,
        line.break_minutes or 0,
        day_of_week=line.day_of_week,
    )
    return (Decimal(minutes) / Decimal(60)).quantize(_CENTS, rounding=ROUND_HALF_UP)


def hours_per_week(lines: Iterable[ScheduleLineLike]) -> Decimal:
    """Total weekly hours. The value spec A3 forbids typing in by hand."""
    total = sum((line_hours(line) for line in lines), Decimal("0"))
    return Decimal(total).quantize(_CENTS, rounding=ROUND_HALF_UP)


def working_days(lines: Iterable[ScheduleLineLike]) -> int:
    """Distinct days worked per week - the denominator for daily hours."""
    return len({line.day_of_week for line in lines})


def daily_hours(lines: Iterable[ScheduleLineLike]) -> Decimal:
    """Average paid hours per working day.

    This is what the overtime rule divides by. v1 of the PRD hardcoded 8,
    which was wrong for every part-time and night schedule in the seed
    (PRD section 4.5).
    """
    lines = list(lines)
    days = working_days(lines)
    if days == 0:
        return Decimal("0.00")
    return (hours_per_week(lines) / Decimal(days)).quantize(
        _CENTS, rounding=ROUND_HALF_UP
    )


def assert_unique_days(lines: Iterable[ScheduleLineLike]) -> None:
    """Reject two lines for the same weekday before the DB constraint does.

    The unique constraint would catch it, but a 409 from Postgres is a worse
    message than naming the duplicated day.
    """
    seen: set[int] = set()
    for line in lines:
        if line.day_of_week in seen:
            raise BusinessRuleError(
                f"{Weekday(line.day_of_week).label} appears more than once "
                "in this schedule.",
                code="duplicate_schedule_day",
                field_errors=[
                    {
                        "field": "lines",
                        "message": f"Duplicate {Weekday(line.day_of_week).label}",
                    }
                ],
            )
        seen.add(line.day_of_week)


def recompute(schedule) -> Decimal:
    """Refresh `schedule.hours_per_week` from its lines. Call on every write."""
    schedule.hours_per_week = hours_per_week(schedule.lines)
    return schedule.hours_per_week
