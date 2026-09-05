"""Employee rules that must not live in a router.

Three things here are deliberately not left to callers:
  - status is derived from date_of_exit, never set directly;
  - the manager chain is checked for cycles before it is saved;
  - own-scoped roles are filtered in one place, so no endpoint can forget.
"""
from __future__ import annotations

import re
from datetime import date

from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

from app.core.deps import AccessContext
from app.core.enums import EmployeeStatus
from app.core.errors import BusinessRuleError, NotFoundError
from app.models.employee import Employee

# Indian Financial System Code: 4 letters, a literal 0, then 6 alphanumerics.
IFSC_RE = re.compile(r"^[A-Z]{4}0[A-Z0-9]{6}$")


def derive_status(
    date_of_exit: date | None, *, today: date | None = None
) -> EmployeeStatus:
    """An employee is INACTIVE once their exit date has passed.

    A future-dated exit keeps them ACTIVE, which is what payroll needs: a
    leaver dated the 25th must still be paid for the current period.
    """
    if date_of_exit is None:
        return EmployeeStatus.ACTIVE
    reference = today or date.today()
    return (
        EmployeeStatus.INACTIVE
        if date_of_exit <= reference
        else EmployeeStatus.ACTIVE
    )


def validate_ifsc(value: str | None) -> str | None:
    if value is None or value == "":
        return None
    normalised = value.strip().upper()
    if not IFSC_RE.match(normalised):
        raise BusinessRuleError(
            f"{normalised!r} is not a valid IFSC code (expected 4 letters, "
            "a zero, then 6 alphanumerics, e.g. HDFC0001234).",
            code="invalid_ifsc",
            field_errors=[{"field": "bank_ifsc", "message": "Invalid IFSC format"}],
        )
    return normalised


def assert_no_manager_cycle(
    db: Session, *, employee_id: int | None, manager_id: int | None
) -> None:
    """Reject self-management and longer loops in the reporting chain.

    A cycle would make ?scope=my_team recurse forever and would break any
    later org-chart view, so it is refused at write time.
    """
    if manager_id is None:
        return
    if employee_id is not None and manager_id == employee_id:
        raise BusinessRuleError(
            "An employee cannot be their own manager.",
            code="manager_cycle",
            field_errors=[{"field": "manager_id", "message": "Cannot be self"}],
        )
    if employee_id is None:
        return

    seen: set[int] = {employee_id}
    cursor: int | None = manager_id
    while cursor is not None:
        if cursor in seen:
            raise BusinessRuleError(
                "That manager reports (directly or indirectly) to this "
                "employee, which would create a loop.",
                code="manager_cycle",
                field_errors=[
                    {"field": "manager_id", "message": "Creates a reporting loop"}
                ],
            )
        seen.add(cursor)
        cursor = db.scalar(select(Employee.manager_id).where(Employee.id == cursor))


def apply_scope(stmt: Select, ctx: AccessContext) -> Select:
    """Constrain a query to what the caller may see.

    EMPLOYEE roles carry Scope.OWN, so every employee-facing list narrows to
    their own row here rather than in each router.
    """
    if ctx.employee_filter is not None:
        return stmt.where(Employee.id == ctx.employee_filter)
    return stmt


def get_or_404(db: Session, employee_id: int, ctx: AccessContext) -> Employee:
    stmt = apply_scope(select(Employee).where(Employee.id == employee_id), ctx)
    employee = db.scalar(stmt)
    if employee is None:
        # Same response whether the row is missing or merely invisible, so an
        # own-scoped caller cannot probe for other employees' ids.
        raise NotFoundError(f"Employee {employee_id} not found")
    return employee


def summary_counts(db: Session, employee_id: int) -> dict[str, int]:
    """Counts behind the employee form's smart buttons (spec B2).

    One call, not five - a per-button round trip would be visible on stage.

    Only the modules that exist report real numbers; the rest return 0 and
    are wired in as their block lands, so the response shape Pranav codes
    against never changes:
        contracts          -> B2
        attendances        -> B3
        time_off_requests  -> B4
        allocations        -> B4
        payslips           -> B7
    """
    counts = {
        "contracts": 0,
        "attendances": 0,
        "time_off_requests": 0,
        "allocations": 0,
        "payslips": 0,
    }
    for key, loader in _SUMMARY_SOURCES.items():
        model, column = loader()
        if model is None:
            continue
        counts[key] = (
            db.scalar(
                select(func.count())
                .select_from(model)
                .where(column == employee_id)
            )
            or 0
        )
    return counts


def _contract_source():
    try:
        from app.models.contract import Contract
    except ImportError:
        return None, None
    return Contract, Contract.employee_id


def _attendance_source():
    try:
        from app.models.attendance import Attendance
    except ImportError:
        return None, None
    return Attendance, Attendance.employee_id


def _request_source():
    try:
        from app.models.timeoff import TimeOffRequest
    except ImportError:
        return None, None
    return TimeOffRequest, TimeOffRequest.employee_id


def _payslip_source():
    try:
        from app.models.payroll import Payslip
    except ImportError:
        return None, None
    return Payslip, Payslip.employee_id


def _allocation_source():
    try:
        from app.models.timeoff import LeaveAllocation
    except ImportError:
        return None, None
    return LeaveAllocation, LeaveAllocation.employee_id


# Populated as each block lands. Keeping the wiring declarative means adding a
# module is one line here rather than an edit to summary_counts itself.
_SUMMARY_SOURCES = {
    "contracts": _contract_source,
    "attendances": _attendance_source,
    "time_off_requests": _request_source,
    "allocations": _allocation_source,
    "payslips": _payslip_source,
}
