"""The landing page's data, computed from the real database (blueprint P13).

The landing page renders one employee's month - a payslip, the attendance
behind it, the leave that reduced it, the payrun it belongs to - and its whole
claim is "every number has a reason". It used to build those figures from a
fixture payroll engine that shipped in the browser bundle, which made the
claim true of a second implementation rather than of this one.

So this endpoint serves the same story from the same tables and the same
engine the product uses. If payroll changes, the front door changes with it.

**Public on purpose, and deliberately narrow.** The landing page renders for
signed-out visitors, so there is no token to authorise; that is exactly why
this is one hard-coded record rather than anything a caller can steer. There
are no parameters, nothing is writable, and the protagonist is chosen by the
server. It is the seeded demo company either way - but if this ever runs
against real payroll, set PUBLIC_DEMO_STORY=false and the route refuses.
"""
from __future__ import annotations

from datetime import date

from fastapi import APIRouter
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.v1.attendances import _to_out as _attendance_out
from app.api.v1.contracts import _to_out as _contract_out
from app.api.v1.payruns import _payslip_out, _warning_out
from app.api.v1.timeoff import _request_out
from app.core.config import settings
from app.core.deps import DbSession
from app.core.enums import PayslipState, RequestState
from app.core.errors import NotFoundError
from app.models.attendance import Attendance
from app.models.contract import Contract
from app.models.holiday import PublicHoliday
from app.models.payroll import PayrollWarning, Payrun, Payslip
from app.models.salary import SalaryRule
from app.models.timeoff import TimeOffRequest
from app.schemas.payroll import SalaryRuleOut
from app.services import leave_engine

router = APIRouter(prefix="/demo", tags=["demo"])


def _protagonist(db: DbSession) -> Payslip:
    """The payslip the story is about.

    Preferring one with unpaid leave keeps the narrative the page was written
    around: the same absence seen twice, once as a balance falling and once as
    a deduction appearing. Any computed payslip will do if none has it.
    """
    computed = (
        select(Payslip)
        .join(Payrun, Payrun.id == Payslip.payrun_id)
        .where(Payslip.state != PayslipState.DRAFT)
        .options(
            selectinload(Payslip.employee),
            selectinload(Payslip.lines),
            selectinload(Payslip.payrun),
        )
        .order_by(Payslip.period_start.desc())
    )
    with_unpaid = db.scalars(
        computed.where(Payslip.unpaid_leave_days > 0)
    ).first()
    return with_unpaid or db.scalars(computed).first()


@router.get("/story", response_model=dict, summary="Landing page figures")
def story(db: DbSession) -> dict:
    if not settings.PUBLIC_DEMO_STORY:
        raise NotFoundError("Not found")

    payslip = _protagonist(db)
    if payslip is None:
        raise NotFoundError("No computed payslip to build the story from")

    employee = payslip.employee
    start, end = payslip.period_start, payslip.period_end
    payrun = payslip.payrun

    contracts = list(
        db.scalars(
            select(Contract).where(
                Contract.employee_id == employee.id,
                Contract.date_start <= end,
                (Contract.date_end.is_(None)) | (Contract.date_end >= start),
            )
        )
    )
    attendances = list(
        db.scalars(
            select(Attendance)
            .where(
                Attendance.employee_id == employee.id,
                Attendance.work_date >= start,
                Attendance.work_date <= end,
            )
            .order_by(Attendance.work_date)
        )
    )
    requests = list(
        db.scalars(
            select(TimeOffRequest)
            .where(
                TimeOffRequest.employee_id == employee.id,
                TimeOffRequest.state == RequestState.APPROVED,
                TimeOffRequest.date_from <= end,
                TimeOffRequest.date_to >= start,
            )
            .options(selectinload(TimeOffRequest.time_off_type))
        )
    )
    holidays = list(
        db.scalars(
            select(PublicHoliday)
            .where(PublicHoliday.date >= start, PublicHoliday.date <= end)
            .order_by(PublicHoliday.date)
        )
    )
    rules = list(
        db.scalars(
            select(SalaryRule)
            .where(SalaryRule.structure_id == payrun.salary_structure_id)
            .order_by(SalaryRule.sequence)
        )
    )
    warnings = list(
        db.scalars(
            select(PayrollWarning)
            .where(PayrollWarning.payrun_id == payrun.id)
            .order_by(PayrollWarning.severity, PayrollWarning.id)
        )
    )
    names = {
        w.employee_id: employee.full_name
        for w in warnings
        if w.employee_id == employee.id
    }

    return {
        "payslip": _payslip_out(db, payslip).model_dump(mode="json"),
        "person": {
            "name": employee.full_name,
            "title": (
                employee.job_position.name if employee.job_position else None
            ),
            "department": (
                employee.department.name if employee.department else None
            ),
            "number": employee.employee_number,
        },
        "period": {"start": str(start), "end": str(end)},
        "contracts": [
            _contract_out(c, date.today()).model_dump(mode="json")
            for c in contracts
        ],
        "attendances": [
            _attendance_out(a).model_dump(mode="json") for a in attendances
        ],
        "holidays": [
            {
                "id": h.id,
                "name": h.name,
                "date": str(h.date),
                "is_optional": h.is_optional,
            }
            for h in holidays
        ],
        "salary_rules": [
            SalaryRuleOut.model_validate(r).model_dump(mode="json") for r in rules
        ],
        "leave_requests": [
            _request_out(r).model_dump(mode="json") for r in requests
        ],
        "balances": [
            b.__dict__ | {
                "allocated": str(b.allocated),
                "taken": str(b.taken),
                "pending": str(b.pending),
                "remaining": str(b.remaining),
            }
            for b in leave_engine.balances(db, employee.id, end)
        ],
        "payrun": {
            "id": payrun.id,
            "name": payrun.name,
            "state": payrun.state.value,
            "payslip_count": len(payrun.payslips),
            "total_net": str(
                sum((p.net for p in payrun.payslips), start=type(payslip.net)(0))
            ),
            "warnings": [
                _warning_out(w, names.get(w.employee_id)).model_dump(mode="json")
                for w in warnings
            ],
        },
    }
