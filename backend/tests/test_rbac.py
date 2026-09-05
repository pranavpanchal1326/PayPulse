"""The permission matrix, asserted against page 3 of the problem statement."""
import pytest

from app.core.rbac import MATRIX, Action, Resource, Scope, has_permission, scope_for
from app.core.enums import Role

PAYROLL_RESOURCES = [
    Resource.PAYRUN,
    Resource.PAYSLIP,
    Resource.SALARY_STRUCTURE,
    Resource.SALARY_RULE,
]


class TestEmployee:
    """No payroll or HR administration access."""

    @pytest.mark.parametrize("resource", PAYROLL_RESOURCES + [Resource.DASHBOARD])
    @pytest.mark.parametrize("action", list(Action))
    def test_no_payroll_access_at_all(self, resource, action):
        assert not has_permission(Role.EMPLOYEE, resource, action)

    def test_can_create_attendance_and_time_off(self):
        assert has_permission(Role.EMPLOYEE, Resource.ATTENDANCE, Action.CREATE)
        assert has_permission(Role.EMPLOYEE, Resource.TIME_OFF_REQUEST, Action.CREATE)

    def test_cannot_edit_or_delete_own_attendance(self):
        # Corrections are "restricted to authorized users" (spec B3).
        assert not has_permission(Role.EMPLOYEE, Resource.ATTENDANCE, Action.UPDATE)
        assert not has_permission(Role.EMPLOYEE, Resource.ATTENDANCE, Action.DELETE)

    def test_cannot_approve_own_leave(self):
        assert not has_permission(
            Role.EMPLOYEE, Resource.TIME_OFF_REQUEST, Action.APPROVE
        )

    @pytest.mark.parametrize(
        "resource",
        [
            Resource.EMPLOYEE,
            Resource.CONTRACT,
            Resource.ATTENDANCE,
            Resource.TIME_OFF_REQUEST,
            Resource.LEAVE_ALLOCATION,
        ],
    )
    def test_personal_records_are_own_scoped(self, resource):
        assert scope_for(Role.EMPLOYEE, resource) is Scope.OWN

    def test_cannot_manage_users(self):
        assert not has_permission(Role.EMPLOYEE, Resource.USER, Action.CREATE)


class TestHrManager:
    """Full CRUD on HR modules, approves leave, no access to payroll."""

    @pytest.mark.parametrize(
        "resource",
        [
            Resource.EMPLOYEE,
            Resource.ATTENDANCE,
            Resource.CONTRACT,
            Resource.WORKING_SCHEDULE,
            Resource.TIME_OFF_TYPE,
            Resource.TIME_OFF_REQUEST,
        ],
    )
    @pytest.mark.parametrize(
        "action", [Action.CREATE, Action.READ, Action.UPDATE, Action.DELETE]
    )
    def test_full_crud_on_hr_modules(self, resource, action):
        assert has_permission(Role.HR_MANAGER, resource, action)

    def test_can_approve_time_off(self):
        assert has_permission(
            Role.HR_MANAGER, Resource.TIME_OFF_REQUEST, Action.APPROVE
        )

    @pytest.mark.parametrize("resource", PAYROLL_RESOURCES + [Resource.DASHBOARD])
    @pytest.mark.parametrize("action", list(Action))
    def test_no_payroll_features(self, resource, action):
        assert not has_permission(Role.HR_MANAGER, resource, action)

    def test_sees_all_rows_not_just_own(self):
        assert scope_for(Role.HR_MANAGER, Resource.EMPLOYEE) is Scope.ALL


class TestHrPayrollUser:
    """HR Manager plus CRU on payruns/payslips and read-only salary config."""

    def test_inherits_every_hr_manager_grant(self):
        for resource, grant in MATRIX[Role.HR_MANAGER].items():
            inherited = MATRIX[Role.HR_PAYROLL_USER][resource]
            assert grant.actions <= inherited.actions, resource

    @pytest.mark.parametrize("resource", [Resource.PAYRUN, Resource.PAYSLIP])
    def test_can_create_read_update_but_not_delete(self, resource):
        for action in (Action.CREATE, Action.READ, Action.UPDATE):
            assert has_permission(Role.HR_PAYROLL_USER, resource, action)
        assert not has_permission(Role.HR_PAYROLL_USER, resource, Action.DELETE)

    @pytest.mark.parametrize(
        "resource", [Resource.SALARY_STRUCTURE, Resource.SALARY_RULE]
    )
    def test_salary_config_is_read_only(self, resource):
        assert has_permission(Role.HR_PAYROLL_USER, resource, Action.READ)
        for action in (Action.CREATE, Action.UPDATE, Action.DELETE):
            assert not has_permission(Role.HR_PAYROLL_USER, resource, action)

    def test_can_read_dashboard(self):
        assert has_permission(Role.HR_PAYROLL_USER, Resource.DASHBOARD, Action.READ)


class TestHrPayrollManager:
    """Payroll User plus full CRUD on payruns, payslips and salary config."""

    def test_inherits_every_payroll_user_grant(self):
        for resource, grant in MATRIX[Role.HR_PAYROLL_USER].items():
            inherited = MATRIX[Role.HR_PAYROLL_MANAGER][resource]
            assert grant.actions <= inherited.actions, resource

    @pytest.mark.parametrize("resource", PAYROLL_RESOURCES)
    @pytest.mark.parametrize(
        "action", [Action.CREATE, Action.READ, Action.UPDATE, Action.DELETE]
    )
    def test_full_crud_on_payroll(self, resource, action):
        assert has_permission(Role.HR_PAYROLL_MANAGER, resource, action)

    def test_still_cannot_manage_users(self):
        # User management is Admin-only per spec page 3.
        assert not has_permission(
            Role.HR_PAYROLL_MANAGER, Resource.USER, Action.CREATE
        )


class TestAdmin:
    """Full access to all modules and models across the platform."""

    @pytest.mark.parametrize("resource", list(Resource))
    @pytest.mark.parametrize("action", list(Action))
    def test_can_do_everything(self, resource, action):
        assert has_permission(Role.ADMIN, resource, action)

    def test_is_never_own_scoped(self):
        assert all(g.scope is Scope.ALL for g in MATRIX[Role.ADMIN].values())


def test_every_role_is_in_the_matrix():
    assert set(MATRIX) == set(Role)
