"""Time off: types, allocations, requests, balances (spec A4, B4).

Mounted under /time-off. Approval is the only thing that consumes a
balance, and it is refused if it would overdraw one.
"""
from __future__ import annotations

from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.core.deps import AccessContext, DbSession, require
from app.core.enums import RequestState
from app.core.errors import (
    BusinessRuleError,
    ConflictError,
    NotFoundError,
    PermissionDeniedError,
)
from app.core.rbac import Action, Resource
from app.models.employee import Employee
from app.models.timeoff import LeaveAllocation, TimeOffRequest, TimeOffType
from app.schemas.common import Page
from app.schemas.timeoff import (
    BalanceOut,
    DecisionRequest,
    LeaveAllocationCreate,
    LeaveAllocationOut,
    LeaveSummary,
    TimeOffRequestCreate,
    TimeOffRequestOut,
    TimeOffTypeCreate,
    TimeOffTypeOut,
    TimeOffTypeUpdate,
)
from app.services import leave_engine, payrun_service

router = APIRouter(prefix="/time-off", tags=["time off"])

type_read = Annotated[
    AccessContext, Depends(require(Resource.TIME_OFF_TYPE, Action.READ))
]
type_write = Annotated[
    AccessContext, Depends(require(Resource.TIME_OFF_TYPE, Action.CREATE))
]
type_update = Annotated[
    AccessContext, Depends(require(Resource.TIME_OFF_TYPE, Action.UPDATE))
]
alloc_read = Annotated[
    AccessContext, Depends(require(Resource.LEAVE_ALLOCATION, Action.READ))
]
alloc_create = Annotated[
    AccessContext, Depends(require(Resource.LEAVE_ALLOCATION, Action.CREATE))
]
alloc_approve = Annotated[
    AccessContext, Depends(require(Resource.LEAVE_ALLOCATION, Action.APPROVE))
]
req_read = Annotated[
    AccessContext, Depends(require(Resource.TIME_OFF_REQUEST, Action.READ))
]
req_create = Annotated[
    AccessContext, Depends(require(Resource.TIME_OFF_REQUEST, Action.CREATE))
]
req_approve = Annotated[
    AccessContext, Depends(require(Resource.TIME_OFF_REQUEST, Action.APPROVE))
]


def _resolve_employee(ctx: AccessContext, employee_id: int | None) -> int:
    if ctx.employee_filter is not None:
        if employee_id is not None and employee_id != ctx.employee_filter:
            raise PermissionDeniedError("You may only act on your own records")
        return ctx.employee_filter
    if employee_id is None:
        raise BusinessRuleError(
            "employee_id is required", code="employee_id_required"
        )
    return employee_id


def _employee_or_404(db: Session, employee_id: int) -> Employee:
    employee = db.get(Employee, employee_id)
    if employee is None:
        raise NotFoundError(f"Employee {employee_id} not found")
    return employee


# --- types -------------------------------------------------------------


@router.get("/types", response_model=list[TimeOffTypeOut])
def list_types(
    db: DbSession,
    _: type_read,
    include_inactive: Annotated[bool, Query()] = False,
) -> list[TimeOffTypeOut]:
    stmt = select(TimeOffType).order_by(TimeOffType.name)
    if not include_inactive:
        stmt = stmt.where(TimeOffType.is_active.is_(True))
    return [TimeOffTypeOut.model_validate(t) for t in db.scalars(stmt)]


@router.post(
    "/types", response_model=TimeOffTypeOut, status_code=status.HTTP_201_CREATED
)
def create_type(
    payload: TimeOffTypeCreate, db: DbSession, _: type_write
) -> TimeOffTypeOut:
    if db.scalar(select(TimeOffType).where(TimeOffType.code == payload.code)):
        raise ConflictError(f"A leave type with code {payload.code!r} already exists")
    type_ = TimeOffType(**payload.model_dump())
    db.add(type_)
    db.commit()
    db.refresh(type_)
    return TimeOffTypeOut.model_validate(type_)


@router.patch("/types/{type_id}", response_model=TimeOffTypeOut)
def update_type(
    type_id: int, payload: TimeOffTypeUpdate, db: DbSession, _: type_update
) -> TimeOffTypeOut:
    type_ = db.get(TimeOffType, type_id)
    if type_ is None:
        raise NotFoundError(f"Time off type {type_id} not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(type_, field, value)
    db.commit()
    db.refresh(type_)
    return TimeOffTypeOut.model_validate(type_)


# --- allocations -------------------------------------------------------


def _allocation_out(row: LeaveAllocation) -> LeaveAllocationOut:
    return LeaveAllocationOut(
        id=row.id,
        employee_id=row.employee_id,
        employee_name=row.employee.full_name if row.employee else None,
        time_off_type_id=row.time_off_type_id,
        type_name=row.time_off_type.name if row.time_off_type else None,
        days=row.days,
        validity_from=row.validity_from,
        validity_to=row.validity_to,
        state=row.state,
        notes=row.notes,
    )


@router.get("/allocations", response_model=Page[LeaveAllocationOut])
def list_allocations(
    db: DbSession,
    ctx: alloc_read,
    employee_id: Annotated[int | None, Query()] = None,
    state: Annotated[RequestState | None, Query()] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=200)] = 50,
) -> Page[LeaveAllocationOut]:
    stmt = select(LeaveAllocation)
    if employee_id is not None:
        stmt = stmt.where(LeaveAllocation.employee_id == employee_id)
    if state is not None:
        stmt = stmt.where(LeaveAllocation.state == state)
    if ctx.employee_filter is not None:
        stmt = stmt.where(LeaveAllocation.employee_id == ctx.employee_filter)

    total = (
        db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    )
    rows = list(
        db.scalars(
            stmt.options(
                selectinload(LeaveAllocation.employee),
                selectinload(LeaveAllocation.time_off_type),
            )
            .order_by(LeaveAllocation.validity_from.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    )
    return Page.build([_allocation_out(r) for r in rows], total, page, page_size)


@router.post(
    "/allocations",
    response_model=LeaveAllocationOut,
    status_code=status.HTTP_201_CREATED,
)
def create_allocation(
    payload: LeaveAllocationCreate, db: DbSession, _: alloc_create
) -> LeaveAllocationOut:
    _employee_or_404(db, payload.employee_id)
    if db.get(TimeOffType, payload.time_off_type_id) is None:
        raise NotFoundError(f"Time off type {payload.time_off_type_id} not found")
    row = LeaveAllocation(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return _allocation_out(row)


@router.post("/allocations/{allocation_id}/approve", response_model=LeaveAllocationOut)
def approve_allocation(
    allocation_id: int, db: DbSession, _: alloc_approve
) -> LeaveAllocationOut:
    """Spec A4: allocations require approval before the balance is available."""
    row = db.get(LeaveAllocation, allocation_id)
    if row is None:
        raise NotFoundError(f"Allocation {allocation_id} not found")
    if row.state is RequestState.APPROVED:
        raise ConflictError("Already approved", code="already_approved")
    row.state = RequestState.APPROVED
    db.commit()
    db.refresh(row)
    return _allocation_out(row)


@router.post("/allocations/{allocation_id}/refuse", response_model=LeaveAllocationOut)
def refuse_allocation(
    allocation_id: int, db: DbSession, _: alloc_approve
) -> LeaveAllocationOut:
    row = db.get(LeaveAllocation, allocation_id)
    if row is None:
        raise NotFoundError(f"Allocation {allocation_id} not found")
    row.state = RequestState.REFUSED
    db.commit()
    db.refresh(row)
    return _allocation_out(row)


# --- balances ----------------------------------------------------------


@router.get("/balances", response_model=list[BalanceOut])
def get_balances(
    db: DbSession,
    ctx: alloc_read,
    employee_id: Annotated[int | None, Query()] = None,
    on: Annotated[date | None, Query(description="Defaults to today")] = None,
) -> list[BalanceOut]:
    target = _resolve_employee(ctx, employee_id)
    _employee_or_404(db, target)
    return [
        BalanceOut(
            time_off_type_id=b.time_off_type_id,
            type_name=b.type_name,
            type_code=b.type_code,
            unit=b.unit,
            is_paid=b.is_paid,
            requires_allocation=b.requires_allocation,
            allocated=b.allocated,
            taken=b.taken,
            pending=b.pending,
            remaining=b.remaining,
            projected_remaining=b.projected_remaining,
            validity_from=b.validity_from,
            validity_to=b.validity_to,
        )
        for b in leave_engine.balances(db, target, on)
    ]


@router.get("/summary", response_model=LeaveSummary)
def leave_summary(
    db: DbSession,
    ctx: req_read,
    period_start: Annotated[date, Query()],
    period_end: Annotated[date, Query()],
    employee_id: Annotated[int | None, Query()] = None,
) -> LeaveSummary:
    """Approved leave split into paid and unpaid - what the pay basis reads."""
    target = _resolve_employee(ctx, employee_id)
    employee = _employee_or_404(db, target)
    days = leave_engine.approved_leave_days(db, employee, period_start, period_end)
    return LeaveSummary(
        employee_id=target,
        period_start=period_start,
        period_end=period_end,
        paid_leave_days=days.paid_days,
        unpaid_leave_days=days.unpaid_days,
        total_leave_days=len(days.all_dates),
    )


# --- requests ----------------------------------------------------------


def _request_out(row: TimeOffRequest) -> TimeOffRequestOut:
    return TimeOffRequestOut(
        id=row.id,
        employee_id=row.employee_id,
        employee_name=row.employee.full_name if row.employee else None,
        time_off_type_id=row.time_off_type_id,
        type_name=row.time_off_type.name if row.time_off_type else None,
        type_code=row.time_off_type.code if row.time_off_type else None,
        is_paid=row.time_off_type.is_paid if row.time_off_type else True,
        date_from=row.date_from,
        date_to=row.date_to,
        duration_days=row.duration_days,
        duration_hours=row.duration_hours,
        half_day=row.half_day,
        calendar_days=(row.date_to - row.date_from).days + 1,
        state=row.state,
        reason=row.reason,
        approver_id=row.approver_id,
        approver_name=row.approver.full_name if row.approver else None,
        decision_note=row.decision_note,
    )


@router.get("/requests", response_model=Page[TimeOffRequestOut])
def list_requests(
    db: DbSession,
    ctx: req_read,
    employee_id: Annotated[int | None, Query()] = None,
    state: Annotated[RequestState | None, Query()] = None,
    scope: Annotated[Literal["all", "my_team"], Query()] = "all",
    date_from: Annotated[date | None, Query()] = None,
    date_to: Annotated[date | None, Query()] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=200)] = 50,
) -> Page[TimeOffRequestOut]:
    stmt = select(TimeOffRequest)
    if employee_id is not None:
        stmt = stmt.where(TimeOffRequest.employee_id == employee_id)
    if state is not None:
        stmt = stmt.where(TimeOffRequest.state == state)
    if date_from is not None:
        stmt = stmt.where(TimeOffRequest.date_to >= date_from)
    if date_to is not None:
        stmt = stmt.where(TimeOffRequest.date_from <= date_to)
    if scope == "my_team":
        team = select(Employee.id).where(
            Employee.manager_id == ctx.user.employee_id
        )
        stmt = stmt.where(TimeOffRequest.employee_id.in_(team))
    if ctx.employee_filter is not None:
        stmt = stmt.where(TimeOffRequest.employee_id == ctx.employee_filter)

    total = (
        db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    )
    rows = list(
        db.scalars(
            stmt.options(
                selectinload(TimeOffRequest.employee),
                selectinload(TimeOffRequest.time_off_type),
                selectinload(TimeOffRequest.approver),
            )
            .order_by(TimeOffRequest.date_from.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    )
    return Page.build([_request_out(r) for r in rows], total, page, page_size)


@router.post(
    "/requests", response_model=TimeOffRequestOut, status_code=status.HTTP_201_CREATED
)
def create_request(
    payload: TimeOffRequestCreate, db: DbSession, ctx: req_create
) -> TimeOffRequestOut:
    target = _resolve_employee(ctx, payload.employee_id)
    employee = _employee_or_404(db, target)
    type_ = db.get(TimeOffType, payload.time_off_type_id)
    if type_ is None:
        raise NotFoundError(f"Time off type {payload.time_off_type_id} not found")
    if not type_.is_active:
        raise BusinessRuleError(
            f"{type_.name} is no longer available.", code="inactive_type"
        )

    days, hours = leave_engine.compute_duration(
        db,
        employee,
        type_,
        payload.date_from,
        payload.date_to,
        payload.duration_hours,
        payload.half_day,
    )

    row = TimeOffRequest(
        employee_id=target,
        time_off_type_id=type_.id,
        date_from=payload.date_from,
        date_to=payload.date_to,
        duration_days=days,
        duration_hours=hours,
        half_day=payload.half_day,
        reason=payload.reason,
        state=RequestState.TO_APPROVE if payload.submit else RequestState.DRAFT,
    )
    leave_engine.assert_no_overlap(db, row)

    db.add(row)
    db.commit()
    db.refresh(row)
    return _request_out(row)


@router.post("/requests/{request_id}/approve", response_model=TimeOffRequestOut)
def approve_request(
    request_id: int,
    payload: DecisionRequest,
    db: DbSession,
    ctx: req_approve,
) -> TimeOffRequestOut:
    """Approval is what consumes the balance - and is refused if it would
    overdraw it (PRD section 3.6)."""
    row = db.get(TimeOffRequest, request_id, with_for_update=True)
    if row is None:
        raise NotFoundError(f"Request {request_id} not found")
    if row.state is RequestState.APPROVED:
        raise ConflictError("Already approved", code="already_approved")
    if row.state in (RequestState.REFUSED, RequestState.CANCELLED):
        raise ConflictError(
            f"A {row.state} request cannot be approved.", code="invalid_transition"
        )

    type_ = db.get(TimeOffType, row.time_off_type_id)
    leave_engine.assert_within_balance(db, row, type_)

    row.state = RequestState.APPROVED
    row.approver_id = ctx.user.id
    row.decision_note = payload.note
    db.commit()
    db.refresh(row)
    return _request_out(row)


@router.post("/requests/{request_id}/refuse", response_model=TimeOffRequestOut)
def refuse_request(
    request_id: int, payload: DecisionRequest, db: DbSession, ctx: req_approve
) -> TimeOffRequestOut:
    row = db.get(TimeOffRequest, request_id, with_for_update=True)
    if row is None:
        raise NotFoundError(f"Request {request_id} not found")
    if row.state is RequestState.CANCELLED:
        raise ConflictError(
            "A cancelled request cannot be refused.", code="invalid_transition"
        )
    if row.state is RequestState.REFUSED:
        raise ConflictError("Already refused", code="already_refused")
    if row.state is RequestState.APPROVED:
        # Refusing an approved request retracts leave that payroll may have
        # already consumed, so it is only allowed while the period is open.
        payrun_service.assert_period_not_paid(
            db, row.employee_id, row.date_from, row.date_to, "This leave"
        )
    row.state = RequestState.REFUSED
    row.approver_id = ctx.user.id
    row.decision_note = payload.note
    db.commit()
    db.refresh(row)
    return _request_out(row)


@router.post("/requests/{request_id}/cancel", response_model=TimeOffRequestOut)
def cancel_request(
    request_id: int, db: DbSession, ctx: req_create
) -> TimeOffRequestOut:
    """Cancel a request, restoring the balance if it had been approved.

    PRD section 3.6 refuses cancellation once the period has been PAID, since
    paid payroll is immutable.
    """
    row = db.get(TimeOffRequest, request_id, with_for_update=True)
    if row is None:
        raise NotFoundError(f"Request {request_id} not found")
    if ctx.employee_filter is not None and row.employee_id != ctx.employee_filter:
        raise PermissionDeniedError("You may only cancel your own requests")
    if row.state is RequestState.CANCELLED:
        raise ConflictError("Already cancelled", code="already_cancelled")
    if row.state is RequestState.APPROVED:
        payrun_service.assert_period_not_paid(
            db, row.employee_id, row.date_from, row.date_to, "This leave"
        )

    row.state = RequestState.CANCELLED
    db.commit()
    db.refresh(row)
    return _request_out(row)
