"""Attendance (spec B3).

Every write goes through `attendance_service.recompute`, so worked_hours,
overtime_hours and status are always derived and never trusted from input.

Route order: the literal paths are declared before /{attendance_id}.
"""
from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.core.config import settings
from app.core.deps import AccessContext, DbSession, require
from app.core.enums import AttendanceStatus
from app.core.errors import (
    BusinessRuleError,
    ConflictError,
    NotFoundError,
    PermissionDeniedError,
)
from app.core.rbac import Action, Resource
from app.models.attendance import Attendance
from app.models.employee import Employee
from app.schemas.attendance import (
    AttendanceCreate,
    AttendanceOut,
    AttendanceOverview,
    AttendanceUpdate,
    CheckInRequest,
    CheckOutRequest,
)
from app.schemas.common import Page
from app.services import (
    attendance_service,
    calendar,
    contract_resolver,
    leave_engine,
    schedule_calc,
)

router = APIRouter(prefix="/attendances", tags=["attendance"])

att_read = Annotated[AccessContext, Depends(require(Resource.ATTENDANCE, Action.READ))]
att_create = Annotated[
    AccessContext, Depends(require(Resource.ATTENDANCE, Action.CREATE))
]
# UPDATE is denied to EMPLOYEE in the matrix, so this dependency is what
# makes corrections "restricted to authorized users" (spec B3).
att_update = Annotated[
    AccessContext, Depends(require(Resource.ATTENDANCE, Action.UPDATE))
]

_LOADERS = (selectinload(Attendance.employee), selectinload(Attendance.edited_by))


def _to_out(row: Attendance) -> AttendanceOut:
    return AttendanceOut(
        id=row.id,
        employee_id=row.employee_id,
        employee_name=row.employee.full_name if row.employee else None,
        work_date=row.work_date,
        check_in=row.check_in,
        check_out=row.check_out,
        break_minutes=row.break_minutes,
        worked_hours=row.worked_hours,
        overtime_hours=row.overtime_hours,
        status=row.status,
        is_manual_edit=row.is_manual_edit,
        edited_by_id=row.edited_by_id,
        edited_by_name=row.edited_by.full_name if row.edited_by else None,
        edit_reason=row.edit_reason,
        is_holiday=row.is_holiday,
        notes=row.notes,
    )


def _resolve_employee(ctx: AccessContext, employee_id: int | None) -> int:
    """Own-scoped callers may only ever act on themselves."""
    if ctx.employee_filter is not None:
        if employee_id is not None and employee_id != ctx.employee_filter:
            raise PermissionDeniedError(
                "You may only record attendance for yourself"
            )
        return ctx.employee_filter
    if employee_id is None:
        raise BusinessRuleError(
            "employee_id is required", code="employee_id_required"
        )
    return employee_id


def _schedule_context(db: Session, employee: Employee, day: date):
    """The schedule and daily hours that apply to an employee on a day.

    Uses the contract in force that day, so a contract-level schedule wins
    over the employee default exactly as the calendar does.
    """
    contract = contract_resolver.active_on(db, employee.id, day)
    schedule = calendar.schedule_for(employee, contract)
    lines = schedule.lines if schedule is not None else []
    return schedule, schedule_calc.daily_hours(lines) if lines else Decimal("0.00")


def _persist(db: Session, row: Attendance) -> None:
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        if "uq_attendance_day" in str(getattr(exc, "orig", exc)):
            raise ConflictError(
                f"{row.work_date} already has an attendance record for this "
                "employee. Edit the existing record instead of adding a second.",
                code="duplicate_attendance_day",
            ) from exc
        raise


def _apply(db: Session, row: Attendance, employee: Employee) -> None:
    """Recompute derived fields and flag holidays, then validate."""
    if row.check_in.tzinfo is None:
        row.check_in = row.check_in.replace(tzinfo=UTC)
    if row.check_out is not None and row.check_out.tzinfo is None:
        row.check_out = row.check_out.replace(tzinfo=UTC)

    if row.check_in > datetime.now(UTC):
        raise BusinessRuleError(
            "Attendance cannot be recorded in the future.",
            code="future_attendance",
        )

    work_date = attendance_service.work_date_for(row.check_in)
    schedule, daily = _schedule_context(db, employee, work_date)
    attendance_service.recompute(row, schedule, daily)
    row.is_holiday = bool(
        calendar.holiday_dates(db, row.work_date, row.work_date)
    )


@router.get("/overview", response_model=AttendanceOverview)
def overview(
    db: DbSession,
    ctx: att_read,
    period_start: Annotated[date, Query()],
    period_end: Annotated[date, Query()],
    employee_id: Annotated[int | None, Query()] = None,
) -> AttendanceOverview:
    """Period aggregates including *derived* absence (spec B9)."""
    target = _resolve_employee(ctx, employee_id)
    employee = db.get(Employee, target)
    if employee is None:
        raise NotFoundError(f"Employee {target} not found")
    if period_end < period_start:
        raise ConflictError(
            "period_end cannot be before period_start", code="invalid_date_range"
        )

    contract = contract_resolver.active_on(db, target, period_end)
    basis = calendar.basis_for(db, employee, contract, period_start, period_end)
    summary = attendance_service.summarise(db, target, period_start, period_end)

    # Approved leave is not absence. B4 supplies these dates; before it
    # landed this was an empty set and every leave day read as absent.
    leave = leave_engine.approved_leave_days(
        db, employee, period_start, period_end
    )
    absent = attendance_service.absent_dates(
        basis.contract_dates,
        summary.dates_with_rows,
        leave.all_dates,
        settings.PAYROLL_ABSENCE_POLICY,
    )

    contract_dates = set(basis.contract_dates)
    covered = len(contract_dates & summary.dates_with_rows)
    # Spec B9 "coverage": how much of the schedule is accounted for, whether
    # the employee was present or excused.
    accounted = len(contract_dates & (summary.dates_with_rows | leave.all_dates))
    # A record on a day already covered by approved leave. Leave wins for the
    # pay basis; the row still counts for overtime (PRD section 3.4).
    on_leave_day = len(summary.dates_with_rows & leave.all_dates)
    return AttendanceOverview(
        employee_id=target,
        period_start=period_start,
        period_end=period_end,
        period_days=basis.period_days,
        contract_days=basis.contract_days,
        days_with_records=summary.rows,
        absent_days=len(absent),
        paid_leave_days=leave.paid_days,
        unpaid_leave_days=leave.unpaid_days,
        attendance_on_leave_days=on_leave_day,
        present=summary.present,
        late=summary.late,
        overtime_days=summary.overtime_days,
        missing_checkouts=summary.missing_checkouts,
        manual_edits=summary.manual_edits,
        worked_hours=summary.worked_hours,
        overtime_hours=summary.overtime_hours,
        coverage_pct=(
            round(100 * accounted / basis.contract_days, 2)
            if basis.contract_days
            else 0.0
        ),
        present_pct=(
            round(100 * covered / basis.contract_days, 2)
            if basis.contract_days
            else 0.0
        ),
        absence_policy=settings.PAYROLL_ABSENCE_POLICY,
    )


@router.post("/check-in", response_model=AttendanceOut, status_code=201)
def check_in(
    payload: CheckInRequest, db: DbSession, ctx: att_create
) -> AttendanceOut:
    target = _resolve_employee(ctx, payload.employee_id)
    employee = db.get(Employee, target)
    if employee is None:
        raise NotFoundError(f"Employee {target} not found")

    moment = payload.at or datetime.now(UTC)
    row = Attendance(employee_id=target, check_in=moment)
    _apply(db, row, employee)
    db.add(row)
    _persist(db, row)
    db.refresh(row)
    return _to_out(row)


@router.post("/check-out", response_model=AttendanceOut)
def check_out(
    payload: CheckOutRequest, db: DbSession, ctx: att_create
) -> AttendanceOut:
    target = _resolve_employee(ctx, payload.employee_id)
    employee = db.get(Employee, target)
    if employee is None:
        raise NotFoundError(f"Employee {target} not found")

    moment = payload.at or datetime.now(UTC)
    row = attendance_service.open_row_for(
        db, target, attendance_service.work_date_for(moment)
    )
    if row is None:
        raise NotFoundError(
            "No check-in found for today. Check in before checking out."
        )
    if row.check_out is not None:
        raise ConflictError(
            f"Already checked out at {row.check_out.isoformat()}.",
            code="already_checked_out",
        )

    row.check_out = moment
    if payload.break_minutes is not None:
        row.break_minutes = payload.break_minutes
    _apply(db, row, employee)
    _persist(db, row)
    db.refresh(row)
    return _to_out(row)


@router.get("", response_model=Page[AttendanceOut])
def list_attendances(
    db: DbSession,
    ctx: att_read,
    employee_id: Annotated[int | None, Query()] = None,
    date_from: Annotated[date | None, Query()] = None,
    date_to: Annotated[date | None, Query()] = None,
    status_filter: Annotated[AttendanceStatus | None, Query(alias="status")] = None,
    manual_only: Annotated[bool, Query()] = False,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=200)] = 50,
) -> Page[AttendanceOut]:
    stmt = select(Attendance)
    if employee_id is not None:
        stmt = stmt.where(Attendance.employee_id == employee_id)
    if date_from is not None:
        stmt = stmt.where(Attendance.work_date >= date_from)
    if date_to is not None:
        stmt = stmt.where(Attendance.work_date <= date_to)
    if status_filter is not None:
        stmt = stmt.where(Attendance.status == status_filter)
    if manual_only:
        stmt = stmt.where(Attendance.is_manual_edit.is_(True))
    if ctx.employee_filter is not None:
        stmt = stmt.where(Attendance.employee_id == ctx.employee_filter)

    total = (
        db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    )
    rows = list(
        db.scalars(
            stmt.options(*_LOADERS)
            .order_by(Attendance.work_date.desc(), Attendance.employee_id)
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    )
    return Page.build([_to_out(r) for r in rows], total, page, page_size)


@router.get("/{attendance_id}", response_model=AttendanceOut)
def get_attendance(
    attendance_id: int, db: DbSession, ctx: att_read
) -> AttendanceOut:
    stmt = select(Attendance).where(Attendance.id == attendance_id)
    if ctx.employee_filter is not None:
        stmt = stmt.where(Attendance.employee_id == ctx.employee_filter)
    row = db.scalar(stmt)
    if row is None:
        raise NotFoundError(f"Attendance {attendance_id} not found")
    return _to_out(row)


@router.post("", response_model=AttendanceOut, status_code=status.HTTP_201_CREATED)
def create_attendance(
    payload: AttendanceCreate, db: DbSession, ctx: att_create
) -> AttendanceOut:
    target = _resolve_employee(ctx, payload.employee_id)
    employee = db.get(Employee, target)
    if employee is None:
        raise NotFoundError(f"Employee {target} not found")

    row = Attendance(
        employee_id=target,
        check_in=payload.check_in,
        check_out=payload.check_out,
        break_minutes=payload.break_minutes,
        notes=payload.notes,
    )
    _apply(db, row, employee)
    db.add(row)
    _persist(db, row)
    db.refresh(row)
    return _to_out(row)


@router.patch("/{attendance_id}", response_model=AttendanceOut)
def correct_attendance(
    attendance_id: int, payload: AttendanceUpdate, db: DbSession, ctx: att_update
) -> AttendanceOut:
    """Manual correction. HR_MANAGER and above only, and always attributed.

    Spec B3: "supports manual corrections restricted to authorized users".
    The dashboard counts these, which is only meaningful if every one of
    them carries a reason and an author.
    """
    row = db.get(Attendance, attendance_id)
    if row is None:
        raise NotFoundError(f"Attendance {attendance_id} not found")
    employee = db.get(Employee, row.employee_id)

    data = payload.model_dump(exclude_unset=True)
    reason = data.pop("edit_reason")
    for field, value in data.items():
        setattr(row, field, value)

    row.is_manual_edit = True
    row.edited_by_id = ctx.user.id
    row.edit_reason = reason

    _apply(db, row, employee)
    _persist(db, row)
    db.refresh(row)
    return _to_out(row)
