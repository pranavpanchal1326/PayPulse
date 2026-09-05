"""Which contract payroll uses for a period (spec A2, PRD section 4.3).

`select_applicable` is a pure function, so these run without a database.
The exclusion constraint that makes true overlap impossible is exercised
against real Postgres by scripts/smoke_b2.py instead.

The headline case is TestMidPeriodRaise: PRD v1 raised a blocking ERROR when
an employee had two contracts in one period, which made a mid-month raise
unpayable. It must warn and carry on.
"""
from datetime import date

import pytest

from app.core.enums import WarningCode
from app.services.contract_resolver import select_applicable

JAN_START, JAN_END = date(2026, 1, 1), date(2026, 1, 31)


class FakeContract:
    """Just enough of models.Contract for the pure resolver."""

    def __init__(self, id, date_start, date_end=None):
        self.id = id
        self.date_start = date_start
        self.date_end = date_end

    def overlaps_period(self, period_start, period_end):
        if self.date_start > period_end:
            return False
        return self.date_end is None or self.date_end >= period_start

    def __repr__(self):
        return f"<FakeContract {self.id}>"


def resolve(contracts, start=JAN_START, end=JAN_END):
    return select_applicable(contracts, start, end)


class TestNoContract:
    def test_empty_list_blocks(self):
        result = resolve([])
        assert result.contract is None
        assert result.codes == [WarningCode.NO_ACTIVE_CONTRACT]
        assert result.is_blocking

    def test_contract_entirely_before_the_period_does_not_count(self):
        result = resolve([FakeContract(1, date(2025, 1, 1), date(2025, 12, 31))])
        assert result.codes == [WarningCode.NO_ACTIVE_CONTRACT]

    def test_contract_entirely_after_the_period_does_not_count(self):
        result = resolve([FakeContract(1, date(2026, 2, 1))])
        assert result.codes == [WarningCode.NO_ACTIVE_CONTRACT]


class TestSingleContract:
    def test_open_ended_contract_covering_the_period(self):
        result = resolve([FakeContract(1, date(2024, 6, 1))])
        assert result.contract.id == 1
        assert result.warnings == []
        assert not result.is_blocking

    def test_closed_contract_spanning_the_period(self):
        result = resolve([FakeContract(1, date(2025, 1, 1), date(2026, 12, 31))])
        assert result.contract.id == 1
        assert result.warnings == []

    def test_contract_ending_exactly_on_period_start_still_counts(self):
        # Inclusive bounds: one paid day is still a payable period.
        result = resolve([FakeContract(1, date(2025, 6, 1), JAN_START)])
        assert result.contract.id == 1

    def test_contract_starting_exactly_on_period_end_still_counts(self):
        result = resolve([FakeContract(1, JAN_END)])
        assert result.contract.id == 1


class TestMidPeriodRaise:
    """The defect PRD v1 shipped: two contracts must not block payroll."""

    @staticmethod
    def raise_on_the_sixteenth():
        return [
            FakeContract(1, date(2025, 6, 1), date(2026, 1, 15)),  # old wage
            FakeContract(2, date(2026, 1, 16)),  # new wage
        ]

    def test_produces_a_contract_rather_than_blocking(self):
        result = resolve(self.raise_on_the_sixteenth())
        assert result.contract is not None
        assert not result.is_blocking, "a mid-month raise must remain payable"

    def test_uses_the_contract_in_force_at_period_end(self):
        result = resolve(self.raise_on_the_sixteenth())
        assert result.contract.id == 2

    def test_warns_that_it_had_to_choose(self):
        result = resolve(self.raise_on_the_sixteenth())
        assert WarningCode.MULTI_CONTRACT_PERIOD in result.codes

    def test_the_warning_names_the_contract_it_skipped(self):
        result = resolve(self.raise_on_the_sixteenth())
        message = next(
            w.message
            for w in result.warnings
            if w.code is WarningCode.MULTI_CONTRACT_PERIOD
        )
        assert "not used: 1" in message

    def test_both_candidates_are_reported(self):
        result = resolve(self.raise_on_the_sixteenth())
        assert {c.id for c in result.candidates} == {1, 2}

    def test_input_order_does_not_matter(self):
        forwards = resolve(self.raise_on_the_sixteenth())
        backwards = resolve(list(reversed(self.raise_on_the_sixteenth())))
        assert forwards.contract.id == backwards.contract.id == 2


class TestTrueOverlap:
    """Defence in depth: the database should already prevent this."""

    def test_overlapping_terms_block(self):
        result = resolve(
            [
                FakeContract(1, date(2025, 6, 1), date(2026, 1, 20)),
                FakeContract(2, date(2026, 1, 10)),  # starts before 1 ends
            ]
        )
        assert result.contract is None
        assert result.codes == [WarningCode.OVERLAPPING_CONTRACTS]
        assert result.is_blocking

    def test_adjacent_terms_are_not_an_overlap(self):
        result = resolve(
            [
                FakeContract(1, date(2025, 6, 1), date(2026, 1, 15)),
                FakeContract(2, date(2026, 1, 16)),
            ]
        )
        assert WarningCode.OVERLAPPING_CONTRACTS not in result.codes

    def test_open_ended_contract_followed_by_another_is_an_overlap(self):
        result = resolve(
            [FakeContract(1, date(2025, 6, 1)), FakeContract(2, date(2026, 1, 10))]
        )
        assert result.codes == [WarningCode.OVERLAPPING_CONTRACTS]


class TestProration:
    def test_joiner_midway_is_flagged(self):
        result = resolve([FakeContract(1, date(2026, 1, 20))])
        assert result.contract.id == 1
        assert WarningCode.PRORATED_PERIOD in result.codes

    def test_leaver_midway_is_flagged(self):
        result = resolve([FakeContract(1, date(2025, 1, 1), date(2026, 1, 10))])
        assert WarningCode.PRORATED_PERIOD in result.codes

    def test_full_period_is_not_flagged(self):
        result = resolve([FakeContract(1, date(2025, 1, 1))])
        assert WarningCode.PRORATED_PERIOD not in result.codes


class TestExpiryNotice:
    def test_contract_ending_soon_after_the_period_is_flagged(self):
        result = resolve([FakeContract(1, date(2025, 1, 1), date(2026, 2, 20))])
        assert WarningCode.CONTRACT_EXPIRING in result.codes

    def test_contract_ending_far_out_is_not_flagged(self):
        result = resolve([FakeContract(1, date(2025, 1, 1), date(2027, 1, 1))])
        assert WarningCode.CONTRACT_EXPIRING not in result.codes

    def test_open_ended_contract_never_expires(self):
        result = resolve([FakeContract(1, date(2025, 1, 1))])
        assert WarningCode.CONTRACT_EXPIRING not in result.codes


class TestSingleDayPeriod:
    @pytest.mark.parametrize("day", [date(2026, 1, 1), date(2026, 1, 31)])
    def test_active_on_a_single_day(self, day):
        result = select_applicable(
            [FakeContract(1, date(2025, 1, 1), date(2026, 6, 30))], day, day
        )
        assert result.contract.id == 1
