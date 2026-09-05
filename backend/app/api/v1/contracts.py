"""Contracts (spec A2).

Route order matters here: `/contracts/active` and `/contracts/resolve` are
declared before `/contracts/{contract_id}` so the literal paths are not
parsed as an integer id.
"""
from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.core.deps import AccessContext, DbSession, require
from app.core.enums import ContractState
from app.core.errors import ConflictError, NotFoundError, PermissionDeniedError
from app.core.rbac import Action, Resource
from app.models.contract import Contract
from app.models.employee import Employee
from app.models.organization import Department, JobPosition
from app.models.schedule import WorkingSchedule
from app.schemas.common import Page
from app.schemas.contract import (
    ContractCreate,
    ContractOut,
    ContractResolutionOut,
    ContractUpdate,
    ResolutionWarningOut,
)
from app.services import contract_resolver

router = APIRouter(prefix="/contracts", tags=["contracts"])

con_read = Annotated[AccessContext, Depends(require(Resource.CONTRACT, Action.READ))]
con_create = Annotated[
    AccessContext, Depends(require(Resource.CONTRACT, Action.CREATE))
]
con_update = Annotated[
    AccessContext, Depends(require(Resource.CONTRACT, Action.UPDATE))
]

_LOADERS = (
    selectinload(Contract.employee),
    selectinload(Contract.department),
    selectinload(Contract.job_position),
    selectinload(Contract.working_schedule),
)

# Set by migration 0003. Postgres reports it verbatim on violation.
_OVERLAP_CONSTRAINT = "no_overlapping_running_contracts"


def _to_out(contract: Contract, today: date | None = None) -> ContractOut:
    reference = today or date.today()
    return ContractOut(
        id=contract.id,
        employee_id=contract.employee_id,
        employee_name=contract.employee.full_name if contract.employee else None,
        name=contract.name,
        wage=contract.wage,
        currency=contract.currency,
        date_start=contract.date_start,
        date_end=contract.date_end,
        is_open_ended=contract.is_open_ended,
        state=contract.state,
        department_id=contract.department_id,
        department_name=contract.department.name if contract.department else None,
        job_position_id=contract.job_position_id,
        job_position_name=(
            contract.job_position.name if contract.job_position else None
        ),
        working_schedule_id=contract.working_schedule_id,
        working_schedule_name=(
            contract.working_schedule.name if contract.working_schedule else None
        ),
        salary_structure_id=contract.salary_structure_id,
        is_active_now=(
            contract.state is ContractState.RUNNING and contract.covers(reference)
        ),
    )


def _scope(stmt, ctx: AccessContext):
    """EMPLOYEE sees only their own contracts."""
    if ctx.employee_filter is not None:
        return stmt.where(Contract.employee_id == ctx.employee_filter)
    return stmt


def _assert_employee_visible(ctx: AccessContext, employee_id: int) -> None:
    if ctx.employee_filter is not None and employee_id != ctx.employee_filter:
        raise PermissionDeniedError("You may only view your own contracts")


def _assert_refs_exist(db: Session, data: dict) -> None:
    for field, model, label in (
        ("employee_id", Employee, "Employee"),
        ("department_id", Department, "Department"),
        ("job_position_id", JobPosition, "Job position"),
        ("working_schedule_id", WorkingSchedule, "Working schedule"),
    ):
        value = data.get(field)
        if value is not None and db.get(model, value) is None:
            raise NotFoundError(f"{label} {value} not found")


def _commit_translating_overlap(db: Session, contract: Contract) -> None:
    """Turn the exclusion-constraint violation into a message a user can act on.

    Postgres enforces "no concurrent active contracts" (spec A2) rather than
    Python. Without this the frontend would surface a raw driver error.
    """
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        detail = str(getattr(exc, "orig", exc))
        if _OVERLAP_CONSTRAINT in detail:
            clash = db.scalars(
                select(Contract).where(
                    Contract.employee_id == contract.employee_id,
                    Contract.state == ContractState.RUNNING,
                    Contract.id != (contract.id or -1),
                )
            ).all()
            terms = ", ".join(
                f"#{c.id} ({c.date_start} to {c.date_end or 'open-ended'})"
                for c in clash
            )
            raise ConflictError(
                "This employee already has a running contract covering those "
                f"dates: {terms}. End the existing contract first, or start "
                "this one the day after it ends.",
                code="overlapping_contracts",
            ) from exc
        raise


@router.get("/active", response_model=ContractOut | None)
def active_contract(
    db: DbSession,
    ctx: con_read,
    employee_id: Annotated[int, Query()],
    on: Annotated[date | None, Query(description="Defaults to today")] = None,
) -> ContractOut | None:
    _assert_employee_visible(ctx, employee_id)
    day = on or date.today()
    contract = contract_resolver.active_on(db, employee_id, day)
    return _to_out(contract, day) if contract else None


@router.get(
    "/resolve",
    response_model=ContractResolutionOut,
    summary="Which contract payroll would use for a period, and why",
)
def resolve_contract(
    db: DbSession,
    ctx: con_read,
    employee_id: Annotated[int, Query()],
    period_start: Annotated[date, Query()],
    period_end: Annotated[date, Query()],
) -> ContractResolutionOut:
    _assert_employee_visible(ctx, employee_id)
    if period_end < period_start:
        raise ConflictError(
            "period_end cannot be before period_start", code="invalid_date_range"
        )
    resolution = contract_resolver.resolve(db, employee_id, period_start, period_end)
    return ContractResolutionOut(
        employee_id=employee_id,
        period_start=period_start,
        period_end=period_end,
        contract=_to_out(resolution.contract) if resolution.contract else None,
        candidates=[_to_out(c) for c in resolution.candidates],
        warnings=[
            ResolutionWarningOut(code=w.code, message=w.message)
            for w in resolution.warnings
        ],
        blocking=resolution.is_blocking,
    )


@router.get("", response_model=Page[ContractOut])
def list_contracts(
    db: DbSession,
    ctx: con_read,
    employee_id: Annotated[int | None, Query()] = None,
    state: Annotated[ContractState | None, Query()] = None,
    active_on: Annotated[
        date | None, Query(description="Only contracts whose term covers this day")
    ] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=200)] = 25,
) -> Page[ContractOut]:
    stmt = select(Contract)
    if employee_id is not None:
        _assert_employee_visible(ctx, employee_id)
        stmt = stmt.where(Contract.employee_id == employee_id)
    if state is not None:
        stmt = stmt.where(Contract.state == state)
    if active_on is not None:
        stmt = stmt.where(
            Contract.date_start <= active_on,
            (Contract.date_end.is_(None)) | (Contract.date_end >= active_on),
        )
    stmt = _scope(stmt, ctx)

    total = (
        db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    )
    rows = list(
        db.scalars(
            stmt.options(*_LOADERS)
            .order_by(Contract.employee_id, Contract.date_start.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    )
    return Page.build([_to_out(r) for r in rows], total, page, page_size)


@router.get("/{contract_id}", response_model=ContractOut)
def get_contract(contract_id: int, db: DbSession, ctx: con_read) -> ContractOut:
    contract = db.scalar(
        _scope(select(Contract).where(Contract.id == contract_id), ctx)
    )
    if contract is None:
        raise NotFoundError(f"Contract {contract_id} not found")
    return _to_out(contract)


@router.post("", response_model=ContractOut, status_code=status.HTTP_201_CREATED)
def create_contract(
    payload: ContractCreate, db: DbSession, _: con_create
) -> ContractOut:
    data = payload.model_dump()
    _assert_refs_exist(db, data)

    employee = db.get(Employee, data["employee_id"])
    if data["date_start"] < employee.date_of_joining:
        raise ConflictError(
            f"Contract starts {data['date_start']} but {employee.full_name} "
            f"joined on {employee.date_of_joining}.",
            code="contract_before_joining",
        )

    if not data.get("name"):
        data["name"] = f"Contract - {employee.full_name} from {data['date_start']}"
    data["currency"] = data["currency"].upper()

    contract = Contract(**data)
    db.add(contract)
    _commit_translating_overlap(db, contract)
    db.refresh(contract)
    return _to_out(contract)


@router.patch("/{contract_id}", response_model=ContractOut)
def update_contract(
    contract_id: int, payload: ContractUpdate, db: DbSession, _: con_update
) -> ContractOut:
    contract = db.get(Contract, contract_id)
    if contract is None:
        raise NotFoundError(f"Contract {contract_id} not found")

    data = payload.model_dump(exclude_unset=True)
    _assert_refs_exist(db, data)
    if "currency" in data and data["currency"]:
        data["currency"] = data["currency"].upper()

    for field, value in data.items():
        setattr(contract, field, value)

    # Cross-field rules the PATCH schema cannot see, because either date may
    # arrive on its own.
    if contract.date_end and contract.date_end < contract.date_start:
        raise ConflictError(
            "date_end cannot be before date_start", code="invalid_date_range"
        )
    employee = db.get(Employee, contract.employee_id)
    if employee and contract.date_start < employee.date_of_joining:
        raise ConflictError(
            f"Contract starts {contract.date_start} but {employee.full_name} "
            f"joined on {employee.date_of_joining}.",
            code="contract_before_joining",
        )

    _commit_translating_overlap(db, contract)
    db.refresh(contract)
    return _to_out(contract)
