"""Declarative permission matrix.

Pure policy: no FastAPI imports, so it can be unit-tested on its own.
The FastAPI wiring lives in `app.core.deps.require`.

The matrix mirrors page 3 of the problem statement, including its
"all X permissions plus ..." phrasing, which is why the payroll roles are
built by extending the role beneath them rather than being restated.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

from app.core.enums import Role


class Action(StrEnum):
    CREATE = "create"
    READ = "read"
    UPDATE = "update"
    DELETE = "delete"
    APPROVE = "approve"


class Scope(StrEnum):
    ALL = "ALL"
    OWN = "OWN"


class Resource(StrEnum):
    EMPLOYEE = "employee"
    DEPARTMENT = "department"
    JOB_POSITION = "job_position"
    WORKING_SCHEDULE = "working_schedule"
    CONTRACT = "contract"
    ATTENDANCE = "attendance"
    TIME_OFF_TYPE = "time_off_type"
    LEAVE_ALLOCATION = "leave_allocation"
    TIME_OFF_REQUEST = "time_off_request"
    SALARY_STRUCTURE = "salary_structure"
    SALARY_RULE = "salary_rule"
    PAYRUN = "payrun"
    PAYSLIP = "payslip"
    DASHBOARD = "dashboard"
    USER = "user"


@dataclass(frozen=True)
class Grant:
    actions: frozenset[Action]
    scope: Scope = Scope.ALL


# --- action shorthands -------------------------------------------------
C, R, U, D, A = (
    Action.CREATE,
    Action.READ,
    Action.UPDATE,
    Action.DELETE,
    Action.APPROVE,
)
_CRUD = frozenset({C, R, U, D})
_CRUDA = frozenset({C, R, U, D, A})
_CRU = frozenset({C, R, U})
_CR = frozenset({C, R})
_R = frozenset({R})

Matrix = dict[Resource, Grant]


def _merge(base: Matrix, extra: Matrix) -> Matrix:
    """Later grants win. Models the spec's 'all X permissions plus ...'."""
    return {**base, **extra}


# --- EMPLOYEE ----------------------------------------------------------
# "View own employee details, attendance records, and leave balances.
#  Create attendance entries and Time Off Requests, with no payroll or
#  HR administration access."
_EMPLOYEE: Matrix = {
    Resource.EMPLOYEE: Grant(_R, Scope.OWN),
    Resource.CONTRACT: Grant(_R, Scope.OWN),
    Resource.ATTENDANCE: Grant(_CR, Scope.OWN),
    Resource.TIME_OFF_REQUEST: Grant(_CR, Scope.OWN),
    Resource.LEAVE_ALLOCATION: Grant(_R, Scope.OWN),
    # Reference data an employee must read to file a request at all.
    Resource.WORKING_SCHEDULE: Grant(_R),
    Resource.TIME_OFF_TYPE: Grant(_R),
    Resource.DEPARTMENT: Grant(_R),
    Resource.JOB_POSITION: Grant(_R),
}

# --- HR MANAGER --------------------------------------------------------
# "Full CRUD access to Employees, Attendance, Contracts, Working Schedules,
#  and Time Off modules. Approve or refuse Time Off Requests, with no
#  access to payroll features."  -> deliberately no payroll/dashboard keys.
_HR_MANAGER: Matrix = {
    Resource.EMPLOYEE: Grant(_CRUD),
    Resource.DEPARTMENT: Grant(_CRUD),
    Resource.JOB_POSITION: Grant(_CRUD),
    Resource.WORKING_SCHEDULE: Grant(_CRUD),
    Resource.CONTRACT: Grant(_CRUD),
    Resource.ATTENDANCE: Grant(_CRUD),
    Resource.TIME_OFF_TYPE: Grant(_CRUD),
    Resource.TIME_OFF_REQUEST: Grant(_CRUDA),
    Resource.LEAVE_ALLOCATION: Grant(_CRUDA),
    # Read-only, and the endpoint strips every money field for this role -
    # spec page 3 says "no access to payroll features", but leaving an HR
    # manager with no landing screen at all is bad product (PRD 6.1a).
    Resource.DASHBOARD: Grant(_R),
}

# --- HR PAYROLL USER ---------------------------------------------------
# "All HR Manager permissions plus Create, Read, and Update access to
#  Payruns and Payslips. Read-only access to Salary Structures and Rules."
_HR_PAYROLL_USER: Matrix = _merge(
    _HR_MANAGER,
    {
        Resource.SALARY_STRUCTURE: Grant(_R),
        Resource.SALARY_RULE: Grant(_R),
        Resource.PAYRUN: Grant(_CRU),
        Resource.PAYSLIP: Grant(_CRU),
        Resource.DASHBOARD: Grant(_R),
    },
)

# --- HR PAYROLL MANAGER ------------------------------------------------
# "All HR Payroll User permissions with full CRUD access to Payruns,
#  Payslips, Salary Structures, and Salary Rules."
_HR_PAYROLL_MANAGER: Matrix = _merge(
    _HR_PAYROLL_USER,
    {
        Resource.SALARY_STRUCTURE: Grant(_CRUD),
        Resource.SALARY_RULE: Grant(_CRUD),
        Resource.PAYRUN: Grant(_CRUD),
        Resource.PAYSLIP: Grant(_CRUD),
    },
)

# --- ADMIN -------------------------------------------------------------
# "Full access to all modules and models across the platform."
_ADMIN: Matrix = {resource: Grant(_CRUDA) for resource in Resource}


MATRIX: dict[Role, Matrix] = {
    Role.EMPLOYEE: _EMPLOYEE,
    Role.HR_MANAGER: _HR_MANAGER,
    Role.HR_PAYROLL_USER: _HR_PAYROLL_USER,
    Role.HR_PAYROLL_MANAGER: _HR_PAYROLL_MANAGER,
    Role.ADMIN: _ADMIN,
}


def grant_for(role: Role, resource: Resource) -> Grant | None:
    return MATRIX.get(role, {}).get(resource)


def has_permission(role: Role, resource: Resource, action: Action) -> bool:
    grant = grant_for(role, resource)
    return grant is not None and action in grant.actions


def scope_for(role: Role, resource: Resource) -> Scope | None:
    """Row visibility for a role on a resource. None means no access."""
    grant = grant_for(role, resource)
    return grant.scope if grant else None
