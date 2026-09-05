"""Day counting (PRD section 4.2).

Every number payroll prints is downstream of this module, so it is tested
before anything consumes it (the T+14h gate).

Two families matter most:
  - TestHolidays: PRD v1 had no holiday concept, so Diwali counted as a
    working day and inflated the pay denominator.
  - TestProration: PRD v1 never intersected the period with the contract, so
    a joiner on the 20th was paid a full month.

All pure, no database.
"""
from dataclasses import dataclass
from datetime import date

import pytest

from app.services.calendar import (
    PeriodBasis,
    compute_basis,
    date_range,
    employment_window,
    schedule_for,
    scheduled_weekdays,
    working_dates,
)


@dataclass
class Line:
    day_of_week: int


@dataclass
class Employee:
    date_of_joining: date = date(2020, 1, 1)
    date_of_exit: date | None = None
    working_schedule: object | None = None


@dataclass
class Contract:
    date_start: date = date(2020, 1, 1)
    date_end: date | None = None
    working_schedule: object | None = None


@dataclass
class Schedule:
    lines: list


MON_TO_FRI = [Line(d) for d in range(5)]
MON_WED_FRI = [Line(0), Line(2), Line(4)]
ALL_WEEK = [Line(d) for d in range(7)]

# March 2026: 31 days, starts on a Sunday. 22 Mon-Fri days.
MAR_START, MAR_END = date(2026, 3, 1), date(2026, 3, 31)


def basis(
    lines=MON_TO_FRI,
    employee=None,
    contract=None,
    start=MAR_START,
    end=MAR_END,
    holidays=frozenset(),
):
    return compute_basis(
        lines,
        employee or Employee(),
        contract if contract is not None else Contract(),
        start,
        end,
        holidays,
    )


class TestDateRange:
    def test_inclusive_at_both_ends(self):
        days = list(date_range(date(2026, 3, 1), date(2026, 3, 3)))
        assert days == [date(2026, 3, 1), date(2026, 3, 2), date(2026, 3, 3)]

    def test_single_day(self):
        assert list(date_range(MAR_START, MAR_START)) == [MAR_START]


class TestScheduledWeekdays:
    def test_standard_week(self):
        assert scheduled_weekdays(MON_TO_FRI) == frozenset({0, 1, 2, 3, 4})

    def test_empty_schedule_yields_nothing(self):
        # Must not silently assume Mon-Fri: no schedule means no working days.
        assert scheduled_weekdays([]) == frozenset()


class TestWorkingDates:
    def test_march_2026_has_22_weekdays(self):
        assert len(working_dates(MON_TO_FRI, MAR_START, MAR_END)) == 22

    def test_three_day_week(self):
        assert len(working_dates(MON_WED_FRI, MAR_START, MAR_END)) == 13

    def test_seven_day_schedule_counts_every_day(self):
        assert len(working_dates(ALL_WEEK, MAR_START, MAR_END)) == 31

    def test_no_schedule_means_no_working_days(self):
        assert working_dates([], MAR_START, MAR_END) == []

    def test_inverted_range_is_empty_not_an_error(self):
        assert working_dates(MON_TO_FRI, MAR_END, MAR_START) == []

    def test_weekends_are_excluded(self):
        days = working_dates(MON_TO_FRI, MAR_START, MAR_END)
        assert all(d.weekday() < 5 for d in days)
        assert MAR_START not in days  # 1 March 2026 is a Sunday


class TestHolidays:
    """PRD v1 counted Diwali as a working day."""

    def test_a_holiday_on_a_working_day_reduces_the_denominator(self):
        holi = date(2026, 3, 4)  # a Wednesday
        assert basis().period_days == 22
        assert basis(holidays=frozenset({holi})).period_days == 21

    def test_a_holiday_on_a_weekend_changes_nothing(self):
        # 21 March 2026 is a Saturday: already not a working day.
        weekend_holiday = date(2026, 3, 21)
        assert basis(holidays=frozenset({weekend_holiday})).period_days == 22

    def test_a_holiday_outside_the_period_changes_nothing(self):
        assert basis(holidays=frozenset({date(2026, 5, 1)})).period_days == 22

    def test_multiple_holidays_stack(self):
        holidays = frozenset({date(2026, 3, 4), date(2026, 3, 5)})
        assert basis(holidays=holidays).period_days == 20

    def test_a_holiday_never_counts_as_a_contract_day(self):
        # The bug this guards: intersecting the contract window with the raw
        # date range instead of with the period's working dates would let a
        # holiday back in.
        holiday = date(2026, 3, 4)
        result = basis(holidays=frozenset({holiday}))
        assert holiday not in result.contract_dates
        assert result.contract_days == result.period_days == 21


class TestProration:
    """PRD v1 paid a joiner on the 20th a full month."""

    def test_full_period_is_not_prorated(self):
        result = basis()
        assert result.period_days == result.contract_days == 22
        assert not result.is_prorated

    def test_joiner_midway_through_the_period(self):
        # Joined 20 March 2026 (a Friday): 20, 23, 24, 25, 26, 27, 30, 31.
        employee = Employee(date_of_joining=date(2026, 3, 20))
        result = basis(
            employee=employee, contract=Contract(date_start=date(2026, 3, 20))
        )
        assert result.period_days == 22
        assert result.contract_days == 8
        assert result.is_prorated

    def test_leaver_midway_through_the_period(self):
        # Left 10 March 2026 (a Tuesday): 2-6 and 9-10 = 7 working days.
        employee = Employee(date_of_exit=date(2026, 3, 10))
        result = basis(employee=employee)
        assert result.contract_days == 7
        assert result.is_prorated

    def test_contract_dates_narrow_independently_of_employment_dates(self):
        result = basis(contract=Contract(date_start=date(2026, 3, 16)))
        assert result.contract_days == 12

    def test_the_narrower_of_contract_and_employment_wins(self):
        # Employment starts later than the contract does.
        employee = Employee(date_of_joining=date(2026, 3, 20))
        contract = Contract(date_start=date(2026, 3, 10))
        assert basis(employee=employee, contract=contract).contract_days == 8

    def test_employee_who_left_before_the_period_has_no_contract_days(self):
        employee = Employee(date_of_exit=date(2026, 1, 31))
        result = basis(employee=employee)
        assert result.contract_days == 0
        assert result.period_days == 22

    def test_contract_starting_after_the_period_has_no_contract_days(self):
        assert basis(contract=Contract(date_start=date(2026, 4, 1))).contract_days == 0

    def test_no_contract_at_all_yields_zero(self):
        result = compute_basis(MON_TO_FRI, Employee(), None, MAR_START, MAR_END)
        assert result.contract_days == 0
        assert result.contract_window_start is None

    def test_proration_ratio(self):
        employee = Employee(date_of_joining=date(2026, 3, 20))
        result = basis(
            employee=employee, contract=Contract(date_start=date(2026, 3, 20))
        )
        assert result.proration_ratio == pytest.approx(8 / 22)


class TestInvariant:
    """PRD section 4.2 requires contract_days <= period_days, asserted in code."""

    def test_the_invariant_holds_across_the_cases_above(self):
        cases = [
            basis(),
            basis(employee=Employee(date_of_joining=date(2026, 3, 20))),
            basis(employee=Employee(date_of_exit=date(2026, 3, 10))),
            basis(holidays=frozenset({date(2026, 3, 4)})),
            basis(lines=MON_WED_FRI),
        ]
        for result in cases:
            assert result.contract_days <= result.period_days

    def test_constructing_a_violating_basis_is_refused(self):
        with pytest.raises(ValueError, match="exceeds period_days"):
            PeriodBasis(
                period_start=MAR_START,
                period_end=MAR_END,
                period_days=20,
                contract_days=22,
                holidays_in_period=0,
                contract_window_start=None,
                contract_window_end=None,
            )

    def test_inverted_period_is_refused(self):
        with pytest.raises(ValueError, match="period_end cannot be before"):
            basis(start=MAR_END, end=MAR_START)


class TestEmploymentWindow:
    def test_open_ended_employment_returns_the_whole_period(self):
        assert employment_window(Employee(), MAR_START, MAR_END) == (MAR_START, MAR_END)

    def test_disjoint_employment_returns_none(self):
        employee = Employee(date_of_exit=date(2025, 1, 1))
        assert employment_window(employee, MAR_START, MAR_END) is None

    def test_single_overlapping_day(self):
        employee = Employee(date_of_joining=MAR_END)
        assert employment_window(employee, MAR_START, MAR_END) == (MAR_END, MAR_END)


class TestScheduleSelection:
    def test_contract_schedule_wins_when_set(self):
        contract_schedule = Schedule(lines=MON_WED_FRI)
        employee_schedule = Schedule(lines=MON_TO_FRI)
        chosen = schedule_for(
            Employee(working_schedule=employee_schedule),
            Contract(working_schedule=contract_schedule),
        )
        assert chosen is contract_schedule

    def test_falls_back_to_the_employee_schedule(self):
        employee_schedule = Schedule(lines=MON_TO_FRI)
        chosen = schedule_for(Employee(working_schedule=employee_schedule), Contract())
        assert chosen is employee_schedule

    def test_no_contract_uses_the_employee_schedule(self):
        employee_schedule = Schedule(lines=MON_TO_FRI)
        assert schedule_for(Employee(working_schedule=employee_schedule), None) is (
            employee_schedule
        )

    def test_nothing_configured_is_none(self):
        assert schedule_for(Employee(), Contract()) is None


class TestFebruaryAndMonthLengths:
    @pytest.mark.parametrize(
        "start,end,expected",
        [
            (date(2026, 2, 1), date(2026, 2, 28), 20),  # Feb 2026, non-leap
            (date(2024, 2, 1), date(2024, 2, 29), 21),  # Feb 2024, leap year
            (date(2026, 9, 1), date(2026, 9, 30), 22),
            (date(2026, 11, 1), date(2026, 11, 30), 21),
        ],
    )
    def test_weekday_counts_per_month(self, start, end, expected):
        assert len(working_dates(MON_TO_FRI, start, end)) == expected
