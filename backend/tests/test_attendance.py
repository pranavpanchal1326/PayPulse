"""Attendance computation and derived absence (spec B3, PRD section 3.4).

Three families carry the weight:
  - TestMidnightCrossing: PRD v1 never defined worked_hours, so a
    22:00-06:00 night shift would have computed as -16 hours.
  - TestWorkDateBucketing: timestamps are stored UTC but bucketed in
    Asia/Kolkata. Bucketing in UTC moves a late-evening check-in into the
    wrong day, and potentially the wrong payroll period.
  - TestDerivedAbsence: absence is the absence of a row, which is why
    ABSENT is not a status. This is the shape that replaces it.

All pure, no database.
"""
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta, timezone
from decimal import Decimal

import pytest

from app.core.enums import AbsencePolicy, AttendanceStatus
from app.core.errors import BusinessRuleError
from app.services import attendance_service as svc

IST = timezone(timedelta(hours=5, minutes=30))


def utc(y, m, d, hh, mm=0):
    return datetime(y, m, d, hh, mm, tzinfo=UTC)


def ist(y, m, d, hh, mm=0):
    """A wall-clock Kolkata time, stored as UTC the way the API would."""
    return datetime(y, m, d, hh, mm, tzinfo=IST).astimezone(UTC)


@dataclass
class Line:
    day_of_week: int
    start_time: time = time(9, 0)


@dataclass
class Schedule:
    lines: list


MON_TO_FRI = Schedule(lines=[Line(d) for d in range(5)])
EIGHT = Decimal("8.00")


class TestWorkedHours:
    def test_plain_day(self):
        assert svc.compute_worked_hours(ist(2026, 3, 2, 9), ist(2026, 3, 2, 17)) == (
            Decimal("8.00")
        )

    def test_break_is_unpaid(self):
        assert svc.compute_worked_hours(
            ist(2026, 3, 2, 9), ist(2026, 3, 2, 18), 60
        ) == Decimal("8.00")

    def test_open_row_is_zero_not_an_error(self):
        # The row must still be storable so MISSING_CHECKOUT can fire on it.
        assert svc.compute_worked_hours(ist(2026, 3, 2, 9), None) == Decimal("0.00")

    def test_half_hour_granularity(self):
        assert svc.compute_worked_hours(
            ist(2026, 3, 2, 9, 30), ist(2026, 3, 2, 17), 30
        ) == Decimal("7.00")

    def test_shift_over_sixteen_hours_is_rejected(self):
        with pytest.raises(BusinessRuleError) as exc:
            svc.compute_worked_hours(ist(2026, 3, 2, 5), ist(2026, 3, 2, 23))
        assert exc.value.code == "shift_too_long"

    def test_break_swallowing_the_shift_is_rejected(self):
        with pytest.raises(BusinessRuleError) as exc:
            svc.compute_worked_hours(ist(2026, 3, 2, 9), ist(2026, 3, 2, 10), 60)
        assert exc.value.code == "invalid_break"

    def test_naive_timestamps_are_refused(self):
        with pytest.raises(ValueError, match="timezone-aware"):
            svc.local(datetime(2026, 3, 2, 9, 0))


class TestMidnightCrossing:
    """The v1 defect: end before start naively gives negative hours."""

    def test_night_shift_is_eight_hours_not_minus_sixteen(self):
        worked = svc.compute_worked_hours(
            ist(2026, 3, 2, 22), ist(2026, 3, 3, 6)
        )
        assert worked == Decimal("8.00")

    def test_night_shift_with_break(self):
        assert svc.compute_worked_hours(
            ist(2026, 3, 2, 22), ist(2026, 3, 3, 6), 60
        ) == Decimal("7.00")

    def test_a_night_shift_belongs_to_the_day_it_started(self):
        check_in = ist(2026, 3, 2, 22)
        assert svc.work_date_for(check_in) == date(2026, 3, 2)


class TestWorkDateBucketing:
    """Stored UTC, bucketed in Asia/Kolkata."""

    def test_evening_utc_is_the_next_day_in_kolkata(self):
        # 20:30 UTC on the 5th is 02:00 on the 6th in Kolkata.
        assert svc.work_date_for(utc(2026, 9, 5, 20, 30)) == date(2026, 9, 6)

    def test_morning_ist_stays_on_its_own_day(self):
        assert svc.work_date_for(ist(2026, 9, 5, 9)) == date(2026, 9, 5)

    def test_just_before_midnight_ist(self):
        assert svc.work_date_for(ist(2026, 9, 5, 23, 59)) == date(2026, 9, 5)

    def test_just_after_midnight_ist(self):
        assert svc.work_date_for(ist(2026, 9, 6, 0, 1)) == date(2026, 9, 6)


class TestOvertime:
    def test_no_overtime_on_a_normal_day(self):
        assert svc.compute_overtime(Decimal("8.00"), EIGHT) == Decimal("0.00")

    def test_hours_beyond_the_schedule_count(self):
        assert svc.compute_overtime(Decimal("10.50"), EIGHT) == Decimal("2.50")

    def test_short_day_is_not_negative_overtime(self):
        assert svc.compute_overtime(Decimal("6.00"), EIGHT) == Decimal("0.00")

    def test_an_unscheduled_day_is_entirely_overtime(self):
        # A holiday or weekend call-in: no expected length, so all of it.
        assert svc.compute_overtime(Decimal("5.00"), Decimal("0.00")) == (
            Decimal("5.00")
        )

    def test_part_time_schedule_gets_overtime_sooner(self):
        assert svc.compute_overtime(Decimal("6.00"), Decimal("4.00")) == Decimal(
            "2.00"
        )


class TestStatus:
    def test_on_time_is_present(self):
        status = svc.derive_status(
            ist(2026, 3, 2, 9), ist(2026, 3, 2, 17), Decimal("8.00"), time(9, 0), EIGHT
        )
        assert status is AttendanceStatus.PRESENT

    def test_within_grace_is_still_present(self):
        status = svc.derive_status(
            ist(2026, 3, 2, 9, 10),
            ist(2026, 3, 2, 17),
            Decimal("7.83"),
            time(9, 0),
            EIGHT,
        )
        assert status is AttendanceStatus.PRESENT

    def test_beyond_grace_is_late(self):
        status = svc.derive_status(
            ist(2026, 3, 2, 9, 45),
            ist(2026, 3, 2, 17),
            Decimal("7.25"),
            time(9, 0),
            EIGHT,
        )
        assert status is AttendanceStatus.LATE

    def test_extra_hours_are_overtime(self):
        status = svc.derive_status(
            ist(2026, 3, 2, 9), ist(2026, 3, 2, 20), Decimal("11.00"), time(9, 0), EIGHT
        )
        assert status is AttendanceStatus.OVERTIME

    def test_no_checkout_wins_over_everything(self):
        # Hours are not knowable yet, so lateness and overtime cannot apply.
        status = svc.derive_status(
            ist(2026, 3, 2, 11), None, Decimal("0.00"), time(9, 0), EIGHT
        )
        assert status is AttendanceStatus.MISSING_CHECKOUT

    def test_unscheduled_day_cannot_be_late(self):
        status = svc.derive_status(
            ist(2026, 3, 7, 14), ist(2026, 3, 7, 18), Decimal("4.00"), None, EIGHT
        )
        assert status is AttendanceStatus.PRESENT

    def test_absent_is_not_a_status(self):
        assert not hasattr(AttendanceStatus, "ABSENT")
        assert set(AttendanceStatus) == {
            AttendanceStatus.PRESENT,
            AttendanceStatus.LATE,
            AttendanceStatus.OVERTIME,
            AttendanceStatus.MISSING_CHECKOUT,
        }


class TestScheduledStart:
    def test_finds_the_line_for_the_weekday(self):
        # 2 March 2026 is a Monday.
        assert svc.scheduled_start_for(MON_TO_FRI, date(2026, 3, 2)) == time(9, 0)

    def test_returns_none_on_a_non_working_day(self):
        # 7 March 2026 is a Saturday.
        assert svc.scheduled_start_for(MON_TO_FRI, date(2026, 3, 7)) is None

    def test_no_schedule_is_none(self):
        assert svc.scheduled_start_for(None, date(2026, 3, 2)) is None


class TestDerivedAbsence:
    """Absence is the absence of a row - the shape ABSENT-as-status could
    never express."""

    contract_dates = [
        date(2026, 3, 2),
        date(2026, 3, 3),
        date(2026, 3, 4),
        date(2026, 3, 5),
        date(2026, 3, 6),
    ]

    def test_full_attendance_means_no_absence(self):
        absent = svc.absent_dates(
            self.contract_dates, frozenset(self.contract_dates)
        )
        assert absent == frozenset()

    def test_missing_rows_are_absent(self):
        present = frozenset({date(2026, 3, 2), date(2026, 3, 3)})
        assert len(svc.absent_dates(self.contract_dates, present)) == 3

    def test_no_attendance_at_all_is_fully_absent(self):
        # The headline v1 defect: an employee with zero check-ins was paid
        # in full. Now every scheduled day reads as absent.
        assert len(svc.absent_dates(self.contract_dates, frozenset())) == 5

    def test_approved_leave_is_not_absence(self):
        leave = frozenset({date(2026, 3, 4), date(2026, 3, 5)})
        present = frozenset({date(2026, 3, 2), date(2026, 3, 3)})
        absent = svc.absent_dates(self.contract_dates, present, leave)
        assert absent == frozenset({date(2026, 3, 6)})

    def test_ignore_policy_disables_absence_entirely(self):
        absent = svc.absent_dates(
            self.contract_dates, frozenset(), policy=AbsencePolicy.IGNORE
        )
        assert absent == frozenset()

    def test_policy_accepts_the_plain_string_from_settings(self):
        assert svc.absent_dates(
            self.contract_dates, frozenset(), policy="IGNORE"
        ) == frozenset()

    def test_a_row_outside_the_contract_window_does_not_offset_absence(self):
        # Attendance on a day the contract does not cover cannot cancel an
        # absence on a day it does.
        present = frozenset({date(2026, 2, 27)})
        assert len(svc.absent_dates(self.contract_dates, present)) == 5


class TestSummarise:
    @dataclass
    class Row:
        work_date: date
        status: AttendanceStatus
        worked_hours: Decimal = Decimal("8.00")
        overtime_hours: Decimal = Decimal("0.00")
        is_manual_edit: bool = False

    def rows(self):
        return [
            self.Row(date(2026, 3, 2), AttendanceStatus.PRESENT),
            self.Row(date(2026, 3, 3), AttendanceStatus.LATE),
            self.Row(
                date(2026, 3, 4),
                AttendanceStatus.OVERTIME,
                Decimal("10.00"),
                Decimal("2.00"),
            ),
            self.Row(
                date(2026, 3, 5),
                AttendanceStatus.MISSING_CHECKOUT,
                Decimal("0.00"),
            ),
            self.Row(
                date(2026, 3, 6), AttendanceStatus.PRESENT, is_manual_edit=True
            ),
        ]

    def test_counts_by_status(self):
        summary = svc.summarise_rows(self.rows())
        assert (summary.present, summary.late) == (2, 1)
        assert (summary.overtime_days, summary.missing_checkouts) == (1, 1)

    def test_hours_total(self):
        summary = svc.summarise_rows(self.rows())
        assert summary.worked_hours == Decimal("34.00")
        assert summary.overtime_hours == Decimal("2.00")

    def test_manual_edits_are_counted_for_the_dashboard(self):
        assert svc.summarise_rows(self.rows()).manual_edits == 1

    def test_dates_with_rows_feeds_absence(self):
        summary = svc.summarise_rows(self.rows())
        assert len(summary.dates_with_rows) == 5
        assert summary.rows == 5

    def test_empty_period(self):
        summary = svc.summarise_rows([])
        assert summary.rows == 0
        assert summary.worked_hours == Decimal("0.00")
