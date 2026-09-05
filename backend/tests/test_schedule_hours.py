"""Weekly hours are computed, never entered (spec A3).

The night-shift cases are the ones that matter: PRD v1 left worked_hours
undefined, so a 22:00-06:00 pattern would have computed as negative.
"""
from dataclasses import dataclass
from datetime import time
from decimal import Decimal

import pytest

from app.core.errors import BusinessRuleError
from app.services import schedule_calc


@dataclass
class Line:
    day_of_week: int
    start_time: time
    end_time: time
    break_minutes: int = 0


def standard_week() -> list[Line]:
    """Mon-Fri 09:00-18:00 with an hour's break: 8h x 5 = 40h."""
    return [Line(d, time(9, 0), time(18, 0), 60) for d in range(5)]


def night_week() -> list[Line]:
    """Mon-Fri 22:00-06:00 with an hour's break: 7h x 5 = 35h."""
    return [Line(d, time(22, 0), time(6, 0), 60) for d in range(5)]


class TestLineHours:
    def test_plain_day(self):
        assert schedule_calc.line_hours(Line(0, time(9, 0), time(17, 0))) == Decimal(
            "8.00"
        )

    def test_break_is_unpaid(self):
        assert schedule_calc.line_hours(
            Line(0, time(9, 0), time(18, 0), 60)
        ) == Decimal("8.00")

    def test_night_shift_crosses_midnight(self):
        # The v1 bug: end < start naively gives -16h.
        assert schedule_calc.line_hours(
            Line(0, time(22, 0), time(6, 0))
        ) == Decimal("8.00")

    def test_night_shift_with_break(self):
        assert schedule_calc.line_hours(
            Line(0, time(22, 0), time(6, 0), 60)
        ) == Decimal("7.00")

    def test_half_hour_granularity(self):
        assert schedule_calc.line_hours(
            Line(0, time(9, 30), time(17, 0), 30)
        ) == Decimal("7.00")

    def test_shift_longer_than_sixteen_hours_is_rejected(self):
        with pytest.raises(BusinessRuleError):
            schedule_calc.line_hours(Line(0, time(6, 0), time(23, 0)))

    def test_break_swallowing_the_shift_is_rejected(self):
        with pytest.raises(BusinessRuleError):
            schedule_calc.line_hours(Line(0, time(9, 0), time(10, 0), 60))

    def test_negative_break_is_rejected(self):
        with pytest.raises(BusinessRuleError):
            schedule_calc.line_hours(Line(0, time(9, 0), time(17, 0), -30))


class TestWeeklyTotals:
    def test_standard_week_is_forty_hours(self):
        assert schedule_calc.hours_per_week(standard_week()) == Decimal("40.00")

    def test_night_week_is_thirty_five_hours(self):
        assert schedule_calc.hours_per_week(night_week()) == Decimal("35.00")

    def test_part_time_week(self):
        lines = [Line(d, time(9, 0), time(13, 0)) for d in range(5)]
        assert schedule_calc.hours_per_week(lines) == Decimal("20.00")

    def test_empty_schedule_is_zero_not_an_error(self):
        assert schedule_calc.hours_per_week([]) == Decimal("0.00")

    def test_working_days_counts_distinct_days(self):
        assert schedule_calc.working_days(standard_week()) == 5

    @pytest.mark.parametrize(
        "lines,expected",
        [
            (standard_week(), Decimal("8.00")),
            (night_week(), Decimal("7.00")),
            ([Line(d, time(9, 0), time(13, 0)) for d in range(5)], Decimal("4.00")),
        ],
    )
    def test_daily_hours_drives_the_overtime_rate(self, lines, expected):
        # PRD v1 hardcoded 8 here, which was wrong for both other schedules.
        assert schedule_calc.daily_hours(lines) == expected

    def test_daily_hours_of_empty_schedule_does_not_divide_by_zero(self):
        assert schedule_calc.daily_hours([]) == Decimal("0.00")


class TestDuplicateDays:
    def test_two_lines_on_one_day_are_rejected(self):
        lines = [Line(0, time(9, 0), time(13, 0)), Line(0, time(14, 0), time(18, 0))]
        with pytest.raises(BusinessRuleError) as exc:
            schedule_calc.assert_unique_days(lines)
        assert exc.value.code == "duplicate_schedule_day"

    def test_distinct_days_pass(self):
        schedule_calc.assert_unique_days(standard_week())


class TestRecompute:
    def test_recompute_overwrites_whatever_was_stored(self):
        class FakeSchedule:
            lines = standard_week()
            hours_per_week = Decimal("999.00")  # a client tried to set this

        schedule = FakeSchedule()
        assert schedule_calc.recompute(schedule) == Decimal("40.00")
        assert schedule.hours_per_week == Decimal("40.00")
