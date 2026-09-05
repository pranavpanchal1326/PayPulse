"""Employee rules that payroll later depends on.

`derive_status` looks trivial but the future-dated-exit case is load-bearing:
a leaver dated the 25th must stay ACTIVE so the current period still pays
them (prorated), which is exactly the case v1 of the PRD got wrong.
"""
from datetime import date

import pytest

from app.core.enums import EmployeeStatus
from app.core.errors import BusinessRuleError
from app.services import employee_service

TODAY = date(2026, 3, 15)


class TestDeriveStatus:
    def test_no_exit_date_is_active(self):
        assert (
            employee_service.derive_status(None, today=TODAY)
            is EmployeeStatus.ACTIVE
        )

    def test_past_exit_date_is_inactive(self):
        assert (
            employee_service.derive_status(date(2026, 1, 31), today=TODAY)
            is EmployeeStatus.INACTIVE
        )

    def test_exit_today_is_inactive(self):
        assert (
            employee_service.derive_status(TODAY, today=TODAY)
            is EmployeeStatus.INACTIVE
        )

    def test_future_exit_stays_active(self):
        # Still on the payroll for the current period, prorated to the 25th.
        assert (
            employee_service.derive_status(date(2026, 3, 25), today=TODAY)
            is EmployeeStatus.ACTIVE
        )


class TestIfsc:
    @pytest.mark.parametrize("value", ["HDFC0001234", "sbin012345a", " ICIC0004567 "])
    def test_valid_codes_are_normalised(self, value):
        assert employee_service.validate_ifsc(value) == value.strip().upper()

    @pytest.mark.parametrize("value", [None, ""])
    def test_blank_is_allowed(self, value):
        # Missing bank details are a payroll *warning*, not a validation
        # error - the employee record must still be creatable.
        assert employee_service.validate_ifsc(value) is None

    @pytest.mark.parametrize(
        "value",
        ["HDFC1001234", "HDF0001234", "HDFC000123", "HDFC00012345", "12340001234"],
    )
    def test_malformed_codes_are_rejected(self, value):
        with pytest.raises(BusinessRuleError) as exc:
            employee_service.validate_ifsc(value)
        assert exc.value.code == "invalid_ifsc"


class TestManagerCycles:
    def test_self_management_is_rejected_without_touching_the_db(self):
        with pytest.raises(BusinessRuleError) as exc:
            employee_service.assert_no_manager_cycle(
                None, employee_id=7, manager_id=7
            )
        assert exc.value.code == "manager_cycle"

    def test_no_manager_is_always_fine(self):
        employee_service.assert_no_manager_cycle(
            None, employee_id=7, manager_id=None
        )

    def test_new_employee_skips_the_walk(self):
        # No id yet, so there is no chain to loop through.
        employee_service.assert_no_manager_cycle(
            None, employee_id=None, manager_id=3
        )

    def test_longer_loop_is_detected(self):
        # 1 -> 2 -> 3 -> 1: assigning 3 as manager of 1 closes the loop.
        chain = {2: 3, 3: 1}

        class FakeDb:
            def scalar(self, stmt):
                # The service only ever asks for one manager_id at a time;
                # the parameter is the id being looked up.
                params = list(stmt.compile().params.values())
                return chain.get(params[0])

        with pytest.raises(BusinessRuleError) as exc:
            employee_service.assert_no_manager_cycle(
                FakeDb(), employee_id=1, manager_id=2
            )
        assert exc.value.code == "manager_cycle"

    def test_valid_chain_passes(self):
        chain = {2: 3, 3: None}

        class FakeDb:
            def scalar(self, stmt):
                params = list(stmt.compile().params.values())
                return chain.get(params[0])

        employee_service.assert_no_manager_cycle(
            FakeDb(), employee_id=1, manager_id=2
        )
