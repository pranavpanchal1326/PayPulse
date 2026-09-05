"""Payruns and payslips (spec B5-B8)."""
from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.core.deps import AccessContext, DbSession, require
from app.core.enums import PayrunState, PayslipState, WarningSeverity
from app.core.errors import ConflictError, NotFoundError
from app.core.rbac import Action, Resource
from app.models.payroll import PayrollWarning, Payrun, Payslip
from app.models.salary import SalaryStructure
from app.schemas.common import Message, Page
from app.schemas.payroll import (
    EligibilityOut,
    EligibilityRequest,
    MarkPaidRequest,
    PayrunCreate,
    PayrunDetailOut,
    PayrunOut,
    PayslipLineOut,
    PayslipOut,
    PayslipSummaryOut,
    WarningOut,
)
from app.services import mailer, payrun_service, pdf, warnings

router = APIRouter(tags=["payroll"])

run_read = Annotated[AccessContext, Depends(require(Resource.PAYRUN, Action.READ))]
run_create = Annotated[
    AccessContext, Depends(require(Resource.PAYRUN, Action.CREATE))
]
run_update = Annotated[
    AccessContext, Depends(require(Resource.PAYRUN, Action.UPDATE))
]
slip_read = Annotated[AccessContext, Depends(require(Resource.PAYSLIP, Action.READ))]
slip_update = Annotated[
    AccessContext, Depends(require(Resource.PAYSLIP, Action.UPDATE))
]


def _warning_out(warning: PayrollWarning) -> WarningOut:
    return WarningOut(
        id=warning.id,
        code=warning.code,
        severity=warning.severity,
        message=warning.message,
        employee_id=warning.employee_id,
        payslip_id=warning.payslip_id,
        blocks=warnings.blocks(warning.code),
    )


def _payrun_totals(db: Session, payrun_id: int) -> dict:
    row = db.execute(
        select(
            func.count(Payslip.id),
            func.coalesce(func.sum(Payslip.gross), 0),
            func.coalesce(func.sum(Payslip.total_deductions), 0),
            func.coalesce(func.sum(Payslip.net), 0),
        ).where(Payslip.payrun_id == payrun_id)
    ).one()
    severities = dict(
        db.execute(
            select(PayrollWarning.severity, func.count(PayrollWarning.id))
            .where(PayrollWarning.payrun_id == payrun_id)
            .group_by(PayrollWarning.severity)
        ).all()
    )
    return {
        "payslip_count": row[0],
        "total_gross": row[1],
        "total_deductions": row[2],
        "total_net": row[3],
        "error_count": severities.get(WarningSeverity.ERROR, 0),
        "warning_count": severities.get(WarningSeverity.WARNING, 0),
    }


def _payrun_out(db: Session, payrun: Payrun) -> PayrunOut:
    return PayrunOut(
        id=payrun.id,
        name=payrun.name,
        salary_structure_id=payrun.salary_structure_id,
        structure_name=(
            payrun.salary_structure.name if payrun.salary_structure else None
        ),
        period_start=payrun.period_start,
        period_end=payrun.period_end,
        currency=payrun.currency,
        state=payrun.state,
        computed_at=payrun.computed_at,
        validated_at=payrun.validated_at,
        paid_at=payrun.paid_at,
        force_paid_reason=payrun.force_paid_reason,
        **_payrun_totals(db, payrun.id),
    )


def _payrun_detail(db: Session, payrun: Payrun) -> PayrunDetailOut:
    warning_counts = dict(
        db.execute(
            select(PayrollWarning.payslip_id, func.count(PayrollWarning.id))
            .where(PayrollWarning.payrun_id == payrun.id)
            .group_by(PayrollWarning.payslip_id)
        ).all()
    )
    payslips = list(
        db.scalars(
            select(Payslip)
            .where(Payslip.payrun_id == payrun.id)
            .options(selectinload(Payslip.employee))
            .order_by(Payslip.id)
        )
    )
    base = _payrun_out(db, payrun)
    return PayrunDetailOut(
        **base.model_dump(),
        payslips=[
            PayslipSummaryOut(
                id=p.id,
                employee_id=p.employee_id,
                employee_name=p.employee.full_name,
                gross=p.gross,
                total_deductions=p.total_deductions,
                net=p.net,
                payable_days=p.payable_days,
                state=p.state,
                warning_count=warning_counts.get(p.id, 0),
            )
            for p in payslips
        ],
        warnings=[
            _warning_out(w)
            for w in db.scalars(
                select(PayrollWarning)
                .where(PayrollWarning.payrun_id == payrun.id)
                .order_by(PayrollWarning.severity, PayrollWarning.id)
            )
        ],
    )


def _payslip_out(db: Session, payslip: Payslip) -> PayslipOut:
    return PayslipOut(
        id=payslip.id,
        payrun_id=payslip.payrun_id,
        payrun_name=payslip.payrun.name if payslip.payrun else None,
        employee_id=payslip.employee_id,
        employee_name=payslip.employee.full_name if payslip.employee else None,
        contract_id=payslip.contract_id,
        structure_name=(
            payslip.payrun.salary_structure.name
            if payslip.payrun and payslip.payrun.salary_structure
            else None
        ),
        period_start=payslip.period_start,
        period_end=payslip.period_end,
        currency=payslip.currency,
        basic=payslip.basic,
        gross=payslip.gross,
        total_deductions=payslip.total_deductions,
        net=payslip.net,
        period_days=payslip.period_days,
        contract_days=payslip.contract_days,
        payable_days=payslip.payable_days,
        unpaid_days=payslip.unpaid_days,
        paid_leave_days=payslip.paid_leave_days,
        unpaid_leave_days=payslip.unpaid_leave_days,
        absent_days=payslip.absent_days,
        worked_hours=payslip.worked_hours,
        overtime_hours=payslip.overtime_hours,
        state=payslip.state,
        lines=[PayslipLineOut.model_validate(line) for line in payslip.lines],
        warnings=[
            _warning_out(w)
            for w in db.scalars(
                select(PayrollWarning).where(
                    PayrollWarning.payslip_id == payslip.id
                )
            )
        ],
    )


def _get_payrun(
    db: Session, payrun_id: int, *, for_update: bool = False
) -> Payrun:
    """Load a payrun, optionally taking a row lock.

    Every state transition passes `for_update=True`. Without it the guards in
    `payrun_service` are check-then-act: two concurrent mark-paid requests
    both read VALIDATED, both pass, and the batch is paid - and emailed -
    twice. The lock is held to the end of the request's transaction, so the
    second caller reads the state the first one committed and gets a 409.
    """
    payrun = db.get(Payrun, payrun_id, with_for_update=for_update)
    if payrun is None:
        raise NotFoundError(f"Payrun {payrun_id} not found")
    return payrun


# --- the two-step wizard (spec B5) -------------------------------------


@router.post(
    "/payruns/eligible-employees",
    response_model=list[EligibilityOut],
    summary="Step 1 - preview eligible staff. Creates nothing.",
)
def eligible_employees(
    payload: EligibilityRequest, db: DbSession, _: run_create
) -> list[EligibilityOut]:
    """Spec B5: "Clicking Continue moves to employee selection *without
    creating the Payrun*." So this endpoint persists nothing at all."""
    if db.get(SalaryStructure, payload.salary_structure_id) is None:
        raise NotFoundError(
            f"Salary structure {payload.salary_structure_id} not found"
        )
    if payload.period_end < payload.period_start:
        raise ConflictError(
            "period_end cannot be before period_start", code="invalid_date_range"
        )
    rows = payrun_service.eligible_employees(
        db,
        payload.period_start,
        payload.period_end,
        payload.department_id,
        payload.employee_type,
    )
    return [EligibilityOut(**row.__dict__) for row in rows]


@router.post(
    "/payruns", response_model=PayrunDetailOut, status_code=status.HTTP_201_CREATED
)
def create_payrun(
    payload: PayrunCreate, db: DbSession, _: run_create
) -> PayrunDetailOut:
    """Step 2 - create the batch with only the selected employees."""
    structure = db.get(SalaryStructure, payload.salary_structure_id)
    if structure is None:
        raise NotFoundError(
            f"Salary structure {payload.salary_structure_id} not found"
        )
    payrun = payrun_service.create(
        db,
        payload.name,
        structure,
        payload.period_start,
        payload.period_end,
        payload.employee_ids,
    )
    try:
        db.commit()
    except IntegrityError as exc:
        # payrun_service.create pre-checks for a clashing payslip, but that
        # check and this insert are not atomic: two concurrent creates for the
        # same employee and period both pass it and the partial unique index
        # catches the loser. Without this it surfaces as a 500 instead of the
        # 409 the pre-check would have given.
        db.rollback()
        raise ConflictError(
            "An employee in this selection already has a payslip for "
            f"{payload.period_start} to {payload.period_end}. Reload and try "
            "again.",
            code="DUPLICATE_PAYSLIP",
        ) from exc
    db.refresh(payrun)
    return _payrun_detail(db, payrun)


# --- listing and detail -------------------------------------------------


@router.get("/payruns", response_model=Page[PayrunOut])
def list_payruns(
    db: DbSession,
    _: run_read,
    state: Annotated[PayrunState | None, Query()] = None,
    period_start: Annotated[date | None, Query()] = None,
    period_end: Annotated[date | None, Query()] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
) -> Page[PayrunOut]:
    stmt = select(Payrun)
    if state is not None:
        stmt = stmt.where(Payrun.state == state)
    if period_start is not None:
        stmt = stmt.where(Payrun.period_end >= period_start)
    if period_end is not None:
        stmt = stmt.where(Payrun.period_start <= period_end)

    total = (
        db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    )
    rows = list(
        db.scalars(
            stmt.options(selectinload(Payrun.salary_structure))
            .order_by(Payrun.period_start.desc(), Payrun.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    )
    return Page.build([_payrun_out(db, r) for r in rows], total, page, page_size)


@router.get("/payruns/{payrun_id}", response_model=PayrunDetailOut)
def get_payrun(payrun_id: int, db: DbSession, _: run_read) -> PayrunDetailOut:
    return _payrun_detail(db, _get_payrun(db, payrun_id))


@router.get("/payruns/{payrun_id}/warnings", response_model=list[WarningOut])
def payrun_warnings(
    payrun_id: int, db: DbSession, _: run_read
) -> list[WarningOut]:
    _get_payrun(db, payrun_id)
    return [
        _warning_out(w)
        for w in db.scalars(
            select(PayrollWarning)
            .where(PayrollWarning.payrun_id == payrun_id)
            .order_by(PayrollWarning.severity, PayrollWarning.id)
        )
    ]


# --- state transitions (spec B6) ----------------------------------------


@router.post("/payruns/{payrun_id}/compute", response_model=PayrunDetailOut)
def compute_payrun(
    payrun_id: int, db: DbSession, _: run_update
) -> PayrunDetailOut:
    payrun = _get_payrun(db, payrun_id, for_update=True)
    payrun_service.compute(db, payrun)
    db.commit()
    db.refresh(payrun)
    return _payrun_detail(db, payrun)


@router.post("/payruns/{payrun_id}/validate", response_model=PayrunDetailOut)
def validate_payrun(
    payrun_id: int, db: DbSession, _: run_update
) -> PayrunDetailOut:
    payrun = _get_payrun(db, payrun_id, for_update=True)
    payrun_service.validate(db, payrun)
    db.commit()
    db.refresh(payrun)
    return _payrun_detail(db, payrun)


@router.post("/payruns/{payrun_id}/mark-paid", response_model=PayrunDetailOut)
def mark_paid(
    payrun_id: int, payload: MarkPaidRequest, db: DbSession, ctx: run_update
) -> PayrunDetailOut:
    payrun = _get_payrun(db, payrun_id, for_update=True)
    payrun_service.mark_paid(
        db, payrun, ctx.user.id, payload.force, payload.force_paid_reason
    )
    db.commit()
    db.refresh(payrun)
    return _payrun_detail(db, payrun)


@router.post("/payruns/{payrun_id}/reopen", response_model=PayrunDetailOut)
def reopen_payrun(payrun_id: int, db: DbSession, _: run_update) -> PayrunDetailOut:
    payrun = _get_payrun(db, payrun_id, for_update=True)
    payrun_service.reopen(db, payrun)
    db.commit()
    db.refresh(payrun)
    return _payrun_detail(db, payrun)


@router.post("/payruns/{payrun_id}/cancel", response_model=PayrunDetailOut)
def cancel_payrun(payrun_id: int, db: DbSession, _: run_update) -> PayrunDetailOut:
    payrun = _get_payrun(db, payrun_id, for_update=True)
    payrun_service.cancel(db, payrun)
    db.commit()
    db.refresh(payrun)
    return _payrun_detail(db, payrun)


# --- delivery (spec B8) -------------------------------------------------


@router.post("/payruns/{payrun_id}/send-payslips", response_model=Message)
def send_payslips(
    payrun_id: int,
    background: BackgroundTasks,
    db: DbSession,
    _: run_update,
) -> Message:
    """Bulk email with the PDF attached (spec B8).

    Queued on BackgroundTasks so a 30-payslip send does not hold the request
    open on stage.
    """
    payrun = _get_payrun(db, payrun_id, for_update=True)
    if payrun.state not in (PayrunState.VALIDATED, PayrunState.PAID):
        raise ConflictError(
            "Validate the payrun before sending payslips.",
            code="payrun_not_validated",
        )
    payslips = list(
        db.scalars(
            select(Payslip)
            .where(
                Payslip.payrun_id == payrun_id,
                Payslip.state != PayslipState.CANCELLED,
            )
            .options(selectinload(Payslip.employee))
        )
    )
    background.add_task(mailer.send_payslips, [p.id for p in payslips])
    return Message(
        message=f"Sending {len(payslips)} payslip(s). Check the inbox at "
        "http://localhost:8025"
    )


# --- payslips (spec B7) -------------------------------------------------


@router.get("/payslips", response_model=Page[PayslipOut])
def list_payslips(
    db: DbSession,
    ctx: slip_read,
    payrun_id: Annotated[int | None, Query()] = None,
    employee_id: Annotated[int | None, Query()] = None,
    state: Annotated[PayslipState | None, Query()] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
) -> Page[PayslipOut]:
    stmt = select(Payslip)
    if payrun_id is not None:
        stmt = stmt.where(Payslip.payrun_id == payrun_id)
    if employee_id is not None:
        stmt = stmt.where(Payslip.employee_id == employee_id)
    if state is not None:
        stmt = stmt.where(Payslip.state == state)
    # EMPLOYEE has no payslip grant at all by default, so this is belt and
    # braces for the EMPLOYEE_SELF_PAYSLIP flag (PRD 6.1b).
    if ctx.employee_filter is not None:
        stmt = stmt.where(Payslip.employee_id == ctx.employee_filter)

    total = (
        db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    )
    rows = list(
        db.scalars(
            stmt.options(
                selectinload(Payslip.employee),
                selectinload(Payslip.payrun).selectinload(Payrun.salary_structure),
            )
            .order_by(Payslip.period_start.desc(), Payslip.id)
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    )
    return Page.build([_payslip_out(db, r) for r in rows], total, page, page_size)


def _get_payslip(db: Session, payslip_id: int, ctx: AccessContext) -> Payslip:
    payslip = db.get(Payslip, payslip_id)
    if payslip is None:
        raise NotFoundError(f"Payslip {payslip_id} not found")
    if ctx.employee_filter is not None and payslip.employee_id != ctx.employee_filter:
        # 404, not 403: a 403 here confirms the payslip exists, which lets an
        # own-scoped caller enumerate ids and learn how many payslips other
        # employees have. Indistinguishable from a genuine miss.
        raise NotFoundError(f"Payslip {payslip_id} not found")
    return payslip


@router.get("/payslips/{payslip_id}", response_model=PayslipOut)
def get_payslip(payslip_id: int, db: DbSession, ctx: slip_read) -> PayslipOut:
    return _payslip_out(db, _get_payslip(db, payslip_id, ctx))


@router.get("/payslips/{payslip_id}/pdf", response_class=Response)
def payslip_pdf(payslip_id: int, db: DbSession, ctx: slip_read) -> Response:
    """Print Payslip (spec B8)."""
    payslip = _get_payslip(db, payslip_id, ctx)
    content, media_type, extension = pdf.render_payslip(payslip)
    return Response(
        content=content,
        media_type=media_type,
        headers={
            "Content-Disposition": (
                f'inline; filename="payslip-{payslip.employee_id}-'
                f'{payslip.period_start}.{extension}"'
            )
        },
    )


@router.post("/payslips/{payslip_id}/recompute", response_model=PayslipOut)
def recompute_payslip(
    payslip_id: int, db: DbSession, ctx: slip_update
) -> PayslipOut:
    """Recompute one payslip. Refused once its payrun is finalized.

    PRD v1 had no guard here at all - as written it could rewrite a payslip
    that had already been paid.
    """
    payslip = _get_payslip(db, payslip_id, ctx)
    # Locked for the same reason as the transition endpoints: this recomputes
    # the whole payrun, so it must not race a concurrent validate/mark-paid.
    payrun = _get_payrun(db, payslip.payrun_id, for_update=True)
    if payrun.state not in payrun_service.COMPUTABLE_STATES:
        raise ConflictError(
            f"This payslip belongs to a {payrun.state} payrun and cannot be "
            "recomputed.",
            code="payrun_not_editable",
        )
    payrun_service.compute(db, payrun)
    db.commit()
    db.refresh(payslip)
    return _payslip_out(db, payslip)


@router.get("/payslips/{payslip_id}/total", response_model=dict)
def payslip_total(payslip_id: int, db: DbSession, ctx: slip_read) -> dict:
    """Category totals, for the payslip screen's summary block."""
    payslip = _get_payslip(db, payslip_id, ctx)
    totals: dict[str, Decimal] = {}
    for line in payslip.lines:
        totals.setdefault(line.category.value, Decimal("0.00"))
        totals[line.category.value] += line.amount
    return {k: str(v) for k, v in totals.items()}
