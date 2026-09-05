"""Leave balances and the paid/unpaid split (spec A4, PRD section 3.6).

The duration calculation needs a database (it reads the schedule and the
holiday table), so it is covered by scripts/smoke_b4.py. What is pure - and
what carries the money - is tested here:

  - TestBalance: `remaining` is what approval is checked against, and
    `pending` exists because approval now blocks past zero.
  - TestLeaveDays: the paid/unpaid split the pay basis consumes. An unpaid
    leave day becomes an LWP deduction; a paid one does not.
"""
from datetime import date
from decimal import Decimal

import pytest

from app.core.enums import LeaveUnit, RequestState
from app.services.leave_engine import (
    LIVE_STATES,
    PENDING_STATES,
    Balance,
    LeaveDays,
)


def make_balance(allocated="12", taken="0", pending="0", **kwargs):
    defaults = dict(
        time_off_type_id=1,
        type_name="Annual Leave",
        type_code="AL",
        unit=LeaveUnit.DAYS,
        is_paid=True,
        requires_allocation=True,
        validity_from=date(2026, 1, 1),
        validity_to=date(2026, 12, 31),
    )
    defaults.update(kwargs)
    return Balance(
        allocated=Decimal(allocated),
        taken=Decimal(taken),
        pending=Decimal(pending),
        **defaults,
    )


class TestBalance:
    def test_fresh_allocation(self):
        balance = make_balance("12", "0")
        assert balance.remaining == Decimal("12")
        assert balance.projected_remaining == Decimal("12")

    def test_approved_leave_consumes(self):
        # The brief's demo beat: allocate 12, approve 3, see 9.
        assert make_balance("12", "3").remaining == Decimal("9")

    def test_fully_consumed(self):
        assert make_balance("12", "12").remaining == Decimal("0")

    def test_pending_does_not_consume_yet(self):
        # Only approval consumes; a filed request is not yet a deduction.
        balance = make_balance("12", "3", "2")
        assert balance.remaining == Decimal("9")
        assert balance.projected_remaining == Decimal("7")

    def test_projected_remaining_can_go_negative_as_a_warning(self):
        # The UI needs to show this *before* the employee files more, since
        # approval will refuse it.
        balance = make_balance("12", "10", "5")
        assert balance.remaining == Decimal("2")
        assert balance.projected_remaining == Decimal("-3")

    def test_fractional_days_from_hour_conversion(self):
        balance = make_balance("12", "2.50")
        assert balance.remaining == Decimal("9.50")


class TestStateGroups:
    def test_only_approved_consumes(self):
        from app.services.leave_engine import CONSUMING_STATES

        assert CONSUMING_STATES == (RequestState.APPROVED,)

    def test_pending_covers_undecided_states(self):
        assert set(PENDING_STATES) == {RequestState.DRAFT, RequestState.TO_APPROVE}

    def test_live_states_exclude_refused_and_cancelled(self):
        # A refused or cancelled request must free the calendar back up.
        assert RequestState.REFUSED not in LIVE_STATES
        assert RequestState.CANCELLED not in LIVE_STATES
        assert set(LIVE_STATES) == {
            RequestState.DRAFT,
            RequestState.TO_APPROVE,
            RequestState.APPROVED,
        }


class TestLeaveDays:
    """The split the pay basis consumes (PRD section 4.2)."""

    paid = frozenset({date(2026, 3, 2), date(2026, 3, 3)})
    unpaid = frozenset({date(2026, 3, 4)})

    def test_counts(self):
        days = LeaveDays(paid_dates=self.paid, unpaid_dates=self.unpaid)
        assert days.paid_days == 2
        assert days.unpaid_days == 1

    def test_all_dates_is_the_union(self):
        days = LeaveDays(paid_dates=self.paid, unpaid_dates=self.unpaid)
        assert len(days.all_dates) == 3

    def test_empty(self):
        days = LeaveDays(paid_dates=frozenset(), unpaid_dates=frozenset())
        assert (days.paid_days, days.unpaid_days) == (0, 0)
        assert days.all_dates == frozenset()

    def test_only_unpaid_leave_reaches_lwp(self):
        # Paid leave must not reduce pay; unpaid leave must.
        days = LeaveDays(paid_dates=self.paid, unpaid_dates=frozenset())
        assert days.unpaid_days == 0

    def test_dates_not_counts_so_the_caller_can_intersect(self):
        # Returning dates lets payroll drop leave that falls outside the
        # contract window; counts alone could not.
        days = LeaveDays(paid_dates=self.paid, unpaid_dates=self.unpaid)
        contract_window = {date(2026, 3, 3), date(2026, 3, 4)}
        assert len(days.all_dates & contract_window) == 2


class TestAbsenceIntegration:
    """Leave must never be counted as absence (PRD section 4.2)."""

    def test_leave_dates_subtract_from_absence(self):
        from app.services.attendance_service import absent_dates

        contract = [
            date(2026, 3, 2),
            date(2026, 3, 3),
            date(2026, 3, 4),
            date(2026, 3, 5),
        ]
        leave = LeaveDays(
            paid_dates=frozenset({date(2026, 3, 3)}),
            unpaid_dates=frozenset({date(2026, 3, 4)}),
        )
        absent = absent_dates(contract, frozenset({date(2026, 3, 2)}), leave.all_dates)
        assert absent == frozenset({date(2026, 3, 5)})

    @pytest.mark.parametrize("kind", ["paid", "unpaid"])
    def test_both_kinds_of_leave_excuse_absence(self, kind):
        from app.services.attendance_service import absent_dates

        day = date(2026, 3, 3)
        leave = LeaveDays(
            paid_dates=frozenset({day}) if kind == "paid" else frozenset(),
            unpaid_dates=frozenset({day}) if kind == "unpaid" else frozenset(),
        )
        assert absent_dates([day], frozenset(), leave.all_dates) == frozenset()
