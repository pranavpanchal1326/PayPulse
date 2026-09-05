"""Dashboard aggregation (spec A7, B9).

The brief is explicit that this must be live: "The Payroll Dashboard must
reflect real-time, live data generated from HR and payroll operations
instead of relying on static charts." Every figure below is a SQL aggregate
over the same tables the operational screens read - nothing is cached and
nothing is pre-computed.

One trap worth naming. Headcount and salary cost must aggregate over the
*resolved* contract per employee, not over a join to every RUNNING contract:
an employee mid-raise has two adjacent RUNNING contracts, and a naive join
counts them twice and sums both wages. That is a real defect this codebase
had in an ad-hoc query before it was caught.
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal

from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

from app.core.enums import (
    AttendanceStatus,
    ContractState,
    EmployeeStatus,
    PayrunState,
    PayslipState,
    RequestState,
)
from app.models.attendance import Attendance
from app.models.contract import Contract
from app.models.employee import Employee
from app.models.organization import Department
from app.models.payroll import PayrollWarning, Payrun, Payslip
from app.models.timeoff import LeaveAllocation, TimeOffRequest, TimeOffType
from app.services import leave_engine

# Only these states represent money that will actually be paid.
COUNTED_PAYSLIP_STATES = (PayslipState.VALIDATED, PayslipState.PAID)

# What counts against a balance here must be exactly what counts against it
# on the leave screen, or the same employee shows two different remainders in
# two places and neither number gets trusted. leave_engine.CONSUMING_STATES is
# the definition; this mirrors it deliberately rather than re-deciding.
CONSUMING_LEAVE_STATES = leave_engine.CONSUMING_STATES

# "Running low" for the dashboard panel. Days, not a percentage: half a
# day left of a 2-day allocation is not the same problem as half a day
# left of 30.
LOW_BALANCE_DAYS = 3


def _scoped_employees(
    department_id: int | None, employee_type
) -> Select:
    stmt = select(Employee.id).where(Employee.status == EmployeeStatus.ACTIVE)
    if department_id is not None:
        stmt = stmt.where(Employee.department_id == department_id)
    if employee_type is not None:
        stmt = stmt.where(Employee.employee_type == employee_type)
    return stmt


def resolved_contract_ids(db: Session, on: date) -> dict[int, int]:
    """One contract per employee: the one in force at `on`.

    Mirrors contract_resolver's rule (latest date_start wins) in a single
    query, so the dashboard cannot double-count a mid-raise employee.
    """
    rows = db.execute(
        select(Contract.employee_id, Contract.id, Contract.date_start)
        .where(
            Contract.state == ContractState.RUNNING,
            Contract.date_start <= on,
            (Contract.date_end.is_(None)) | (Contract.date_end >= on),
        )
        .order_by(Contract.employee_id, Contract.date_start.desc())
    ).all()
    chosen: dict[int, int] = {}
    for employee_id, contract_id, _ in rows:
        chosen.setdefault(employee_id, contract_id)
    return chosen


def build(
    db: Session,
    period_start: date,
    period_end: date,
    department_id: int | None = None,
    employee_type=None,
    include_money: bool = True,
) -> dict:
    """Every panel the dashboard shows, in one round trip.

    `include_money` is False for HR_MANAGER, whose role has "no access to
    payroll features" - the same endpoint, money fields stripped by role
    (PRD section 6.1a).
    """
    employee_scope = _scoped_employees(department_id, employee_type)
    employee_ids = set(db.scalars(employee_scope))

    # --- payroll ---
    payslip_filter = [
        Payslip.period_start >= period_start,
        Payslip.period_end <= period_end,
        Payslip.employee_id.in_(employee_scope),
    ]
    counted = [*payslip_filter, Payslip.state.in_(COUNTED_PAYSLIP_STATES)]

    total_net = db.scalar(
        select(func.coalesce(func.sum(Payslip.net), 0)).where(*counted)
    ) or Decimal("0.00")
    total_gross = db.scalar(
        select(func.coalesce(func.sum(Payslip.gross), 0)).where(*counted)
    ) or Decimal("0.00")
    payslips_generated = (
        db.scalar(
            select(func.count(Payslip.id)).where(
                *payslip_filter, Payslip.state != PayslipState.CANCELLED
            )
        )
        or 0
    )
    counted_slips = db.scalar(select(func.count(Payslip.id)).where(*counted)) or 0
    average_net = (
        (total_net / counted_slips).quantize(Decimal("0.01"))
        if counted_slips
        else Decimal("0.00")
    )

    # --- attendance (spec B9 names each of these) ---
    attendance_filter = [
        Attendance.work_date >= period_start,
        Attendance.work_date <= period_end,
        Attendance.employee_id.in_(employee_scope),
    ]
    by_status = dict(
        db.execute(
            select(Attendance.status, func.count(Attendance.id))
            .where(*attendance_filter)
            .group_by(Attendance.status)
        ).all()
    )
    overtime_hours = db.scalar(
        select(func.coalesce(func.sum(Attendance.overtime_hours), 0)).where(
            *attendance_filter
        )
    ) or Decimal("0.00")
    manual_edits = (
        db.scalar(
            select(func.count(Attendance.id)).where(
                *attendance_filter, Attendance.is_manual_edit.is_(True)
            )
        )
        or 0
    )
    days_with_records = (
        db.scalar(
            select(func.count(func.distinct(Attendance.work_date))).where(
                *attendance_filter
            )
        )
        or 0
    )

    # Scheduled days across the filtered population, for coverage. Computed
    # from the payslips where they exist (already correct and holiday-aware)
    # and left at zero otherwise rather than guessed.
    scheduled_days = (
        db.scalar(
            select(func.coalesce(func.sum(Payslip.contract_days), 0)).where(
                *payslip_filter
            )
        )
        or 0
    )
    absent_days = (
        db.scalar(
            select(func.coalesce(func.sum(Payslip.absent_days), 0)).where(
                *payslip_filter
            )
        )
        or 0
    )
    present = by_status.get(AttendanceStatus.PRESENT, 0)
    total_rows = sum(by_status.values())

    # --- time off ---
    leave_filter = [
        TimeOffRequest.employee_id.in_(employee_scope),
        TimeOffRequest.date_from <= period_end,
        TimeOffRequest.date_to >= period_start,
    ]
    approved_days = db.scalar(
        select(func.coalesce(func.sum(TimeOffRequest.duration_days), 0)).where(
            *leave_filter, TimeOffRequest.state == RequestState.APPROVED
        )
    ) or Decimal("0.00")
    pending_requests = (
        db.scalar(
            select(func.count(TimeOffRequest.id)).where(
                *leave_filter,
                TimeOffRequest.state.in_(
                    (RequestState.DRAFT, RequestState.TO_APPROVE)
                ),
            )
        )
        or 0
    )
    leave_by_type = [
        {"time_off_type_id": type_id, "name": name, "days": str(days)}
        for type_id, name, days in db.execute(
            select(
                TimeOffType.id,
                TimeOffType.name,
                func.coalesce(func.sum(TimeOffRequest.duration_days), 0),
            )
            .join(TimeOffRequest, TimeOffRequest.time_off_type_id == TimeOffType.id)
            .where(*leave_filter, TimeOffRequest.state == RequestState.APPROVED)
            .group_by(TimeOffType.id, TimeOffType.name)
            .order_by(func.sum(TimeOffRequest.duration_days).desc())
        ).all()
    ]

    # --- who is running out of leave (PRD section 5: low_balances) ---
    #
    # allocated - consumed, per employee and type, in one query rather than
    # calling leave_engine.balances() per employee: that is three queries each
    # and this runs for the whole company on every dashboard load.
    allocated = (
        select(
            LeaveAllocation.employee_id.label("employee_id"),
            LeaveAllocation.time_off_type_id.label("type_id"),
            func.sum(LeaveAllocation.days).label("days"),
        )
        .where(
            LeaveAllocation.state == RequestState.APPROVED,
            LeaveAllocation.employee_id.in_(employee_scope),
            LeaveAllocation.validity_from <= period_end,
            (LeaveAllocation.validity_to.is_(None))
            | (LeaveAllocation.validity_to >= period_end),
        )
        .group_by(LeaveAllocation.employee_id, LeaveAllocation.time_off_type_id)
        .subquery()
    )
    consumed = (
        select(
            TimeOffRequest.employee_id.label("employee_id"),
            TimeOffRequest.time_off_type_id.label("type_id"),
            func.sum(TimeOffRequest.duration_days).label("days"),
        )
        .where(TimeOffRequest.state.in_(CONSUMING_LEAVE_STATES))
        .group_by(TimeOffRequest.employee_id, TimeOffRequest.time_off_type_id)
        .subquery()
    )
    remaining = allocated.c.days - func.coalesce(consumed.c.days, 0)
    low_balances = [
        {
            "employee_id": employee_id,
            "employee_name": f"{first} {last}",
            "type_name": type_name,
            "remaining": str(left),
        }
        for employee_id, first, last, type_name, left in db.execute(
            select(
                allocated.c.employee_id,
                Employee.first_name,
                Employee.last_name,
                TimeOffType.name,
                remaining,
            )
            .join(Employee, Employee.id == allocated.c.employee_id)
            .join(TimeOffType, TimeOffType.id == allocated.c.type_id)
            .outerjoin(
                consumed,
                (consumed.c.employee_id == allocated.c.employee_id)
                & (consumed.c.type_id == allocated.c.type_id),
            )
            .where(
                TimeOffType.requires_allocation.is_(True),
                remaining <= LOW_BALANCE_DAYS,
            )
            .order_by(remaining)
            .limit(10)
        ).all()
    ]

    # --- department breakdown (headcount + cost) ---
    chosen = resolved_contract_ids(db, period_end)
    wages = dict(
        db.execute(
            select(Contract.id, Contract.wage).where(
                Contract.id.in_(chosen.values() or [-1])
            )
        ).all()
    )
    departments = {
        row.id: row.name for row in db.scalars(select(Department))
    }
    dept_of = dict(
        db.execute(
            select(Employee.id, Employee.department_id).where(
                Employee.id.in_(employee_scope)
            )
        ).all()
    )

    by_department: dict[str, dict] = {}
    for name in list(departments.values()) + ["Unassigned"]:
        by_department[name] = {
            "department": name,
            "headcount": 0,
            "contracted_cost": Decimal("0.00"),
        }
    for employee_id, contract_id in chosen.items():
        if employee_id not in employee_ids:
            continue
        name = departments.get(dept_of.get(employee_id), "Unassigned")
        by_department[name]["headcount"] += 1
        by_department[name]["contracted_cost"] += wages.get(
            contract_id, Decimal("0.00")
        )

    paid_by_department = {
        row[0]: (row[1], row[2])
        for row in db.execute(
            select(
                Employee.department_id,
                func.coalesce(func.sum(Payslip.gross), 0),
                func.coalesce(func.sum(Payslip.net), 0),
            )
            .join(Payslip, Payslip.employee_id == Employee.id)
            .where(*counted)
            .group_by(Employee.department_id)
        ).all()
    }
    for department_id_key, (gross, net) in paid_by_department.items():
        name = departments.get(department_id_key, "Unassigned")
        if name in by_department:
            by_department[name]["total_gross"] = gross
            by_department[name]["total_net"] = net

    salary_cost = [
        {
            "department": row["department"],
            "headcount": row["headcount"],
            "contracted_cost": str(row["contracted_cost"]),
            "total_gross": str(row.get("total_gross", Decimal("0.00"))),
            "total_net": str(row.get("total_net", Decimal("0.00"))),
        }
        for row in by_department.values()
        if row["headcount"] or row.get("total_net")
    ]

    # --- monthly trend (spec B9: "using historical data") ---
    trend = [
        {"month": str(month)[:7], "net": str(net), "gross": str(gross)}
        for month, net, gross in db.execute(
            select(
                func.date_trunc("month", Payslip.period_start).label("month"),
                func.coalesce(func.sum(Payslip.net), 0),
                func.coalesce(func.sum(Payslip.gross), 0),
            )
            .where(
                Payslip.state.in_(COUNTED_PAYSLIP_STATES),
                Payslip.employee_id.in_(employee_scope),
            )
            .group_by("month")
            .order_by("month")
        ).all()
    ][-12:]

    # --- alerts ---
    alerts = [
        {
            "severity": severity.value,
            "code": code.value,
            "message": message,
            "entity_type": "payslip" if payslip_id else "payrun",
            "entity_id": payslip_id or payrun_id,
        }
        for severity, code, message, payslip_id, payrun_id in db.execute(
            select(
                PayrollWarning.severity,
                PayrollWarning.code,
                PayrollWarning.message,
                PayrollWarning.payslip_id,
                PayrollWarning.payrun_id,
            )
            .join(Payrun, Payrun.id == PayrollWarning.payrun_id)
            .where(Payrun.state != PayrunState.CANCELLED)
            .order_by(PayrollWarning.severity, PayrollWarning.id.desc())
            .limit(25)
        ).all()
    ]

    headcount = len(
        [e for e in chosen if e in employee_ids]
    )

    result = {
        "period_start": str(period_start),
        "period_end": str(period_end),
        "kpis": {
            "headcount": headcount,
            "payslips_generated": payslips_generated,
            "approved_time_off_days": str(approved_days),
            "attendance_health_pct": (
                round(100 * present / scheduled_days, 2) if scheduled_days else 0.0
            ),
        },
        "attendance_overview": {
            "present": present,
            "late": by_status.get(AttendanceStatus.LATE, 0),
            "overtime": by_status.get(AttendanceStatus.OVERTIME, 0),
            "missing_checkouts": by_status.get(
                AttendanceStatus.MISSING_CHECKOUT, 0
            ),
            # Derived, never a row status (PRD section 3.4).
            "absent_days": absent_days,
            "overtime_hours": str(overtime_hours),
            "manual_edits": manual_edits,
            "records": total_rows,
            "days_with_records": days_with_records,
            "coverage_pct": (
                round(100 * (scheduled_days - absent_days) / scheduled_days, 2)
                if scheduled_days
                else 0.0
            ),
        },
        "time_off_overview": {
            "approved_days": str(approved_days),
            "pending_requests": pending_requests,
            "by_type": leave_by_type,
            "low_balances": low_balances,
        },
        "alerts": alerts,
        "salary_cost_by_department": [
            {k: v for k, v in row.items() if include_money or k in
             ("department", "headcount")}
            for row in salary_cost
        ],
    }

    if include_money:
        result["kpis"].update(
            {
                "total_net_paid": str(total_net),
                "total_gross_paid": str(total_gross),
                "average_net_salary": str(average_net),
            }
        )
        result["monthly_net_trend"] = trend
    else:
        # HR_MANAGER: "no access to payroll features" (spec page 3).
        result["monthly_net_trend"] = []

    return result
