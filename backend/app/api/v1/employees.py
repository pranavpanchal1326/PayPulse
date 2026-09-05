"""Employee master - the operational hub (spec A1, B1, B2)."""
from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.deps import AccessContext, DbSession, require
from app.core.enums import EmployeeStatus, EmployeeType
from app.core.errors import ConflictError, NotFoundError
from app.core.rbac import Action, Resource
from app.models.employee import Employee
from app.models.organization import Department, JobPosition
from app.models.schedule import WorkingSchedule
from app.schemas.common import Page
from app.schemas.employee import (
    EmployeeCreate,
    EmployeeOut,
    EmployeeSummary,
    EmployeeUpdate,
)
from app.services import employee_service

router = APIRouter(prefix="/employees", tags=["employees"])

emp_read = Annotated[AccessContext, Depends(require(Resource.EMPLOYEE, Action.READ))]
emp_create = Annotated[
    AccessContext, Depends(require(Resource.EMPLOYEE, Action.CREATE))
]
emp_update = Annotated[
    AccessContext, Depends(require(Resource.EMPLOYEE, Action.UPDATE))
]

_LOADERS = (
    selectinload(Employee.department),
    selectinload(Employee.job_position),
    selectinload(Employee.working_schedule),
    selectinload(Employee.manager),
)


def _to_out(employee: Employee) -> EmployeeOut:
    return EmployeeOut(
        id=employee.id,
        employee_number=employee.employee_number,
        first_name=employee.first_name,
        last_name=employee.last_name,
        full_name=employee.full_name,
        work_email=employee.work_email,
        phone=employee.phone,
        department_id=employee.department_id,
        department_name=employee.department.name if employee.department else None,
        job_position_id=employee.job_position_id,
        job_position_name=(
            employee.job_position.name if employee.job_position else None
        ),
        working_schedule_id=employee.working_schedule_id,
        working_schedule_name=(
            employee.working_schedule.name if employee.working_schedule else None
        ),
        manager_id=employee.manager_id,
        manager_name=employee.manager.full_name if employee.manager else None,
        employee_type=employee.employee_type,
        status=employee.status,
        date_of_joining=employee.date_of_joining,
        date_of_exit=employee.date_of_exit,
        bank_account=employee.bank_account,
        bank_ifsc=employee.bank_ifsc,
        has_bank_details=employee.has_bank_details,
    )


def _assert_refs_exist(db: Session, data: dict) -> None:
    """Fail with a useful message rather than a raw FK violation."""
    for field, model, label in (
        ("department_id", Department, "Department"),
        ("job_position_id", JobPosition, "Job position"),
        ("working_schedule_id", WorkingSchedule, "Working schedule"),
        ("manager_id", Employee, "Manager"),
    ):
        value = data.get(field)
        if value is not None and db.get(model, value) is None:
            raise NotFoundError(f"{label} {value} not found")


@router.get("", response_model=Page[EmployeeOut])
def list_employees(
    db: DbSession,
    ctx: emp_read,
    q: Annotated[str | None, Query(description="Name or email substring")] = None,
    department_id: Annotated[int | None, Query()] = None,
    status_filter: Annotated[
        EmployeeStatus | None, Query(alias="status")
    ] = None,
    employee_type: Annotated[EmployeeType | None, Query()] = None,
    manager_id: Annotated[int | None, Query()] = None,
    scope: Annotated[
        Literal["all", "my_team"],
        Query(description="my_team limits results to the caller's direct reports"),
    ] = "all",
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=200)] = 25,
) -> Page[EmployeeOut]:
    stmt = select(Employee)

    if q:
        pattern = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                Employee.first_name.ilike(pattern),
                Employee.last_name.ilike(pattern),
                Employee.work_email.ilike(pattern),
            )
        )
    if department_id is not None:
        stmt = stmt.where(Employee.department_id == department_id)
    if status_filter is not None:
        stmt = stmt.where(Employee.status == status_filter)
    if employee_type is not None:
        stmt = stmt.where(Employee.employee_type == employee_type)
    if manager_id is not None:
        stmt = stmt.where(Employee.manager_id == manager_id)
    if scope == "my_team":
        # Meaningless for a caller with no employee record of their own; an
        # empty page is the honest answer rather than every employee.
        stmt = stmt.where(Employee.manager_id == ctx.user.employee_id)

    # Own-scoped roles (EMPLOYEE) are narrowed last so no filter above can
    # widen what they see.
    stmt = employee_service.apply_scope(stmt, ctx)

    total = db.scalar(
        select(func.count()).select_from(stmt.order_by(None).subquery())
    ) or 0
    rows = list(
        db.scalars(
            stmt.options(*_LOADERS)
            .order_by(Employee.first_name, Employee.last_name)
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    )
    return Page.build([_to_out(r) for r in rows], total, page, page_size)


@router.get("/{employee_id}", response_model=EmployeeOut)
def get_employee(employee_id: int, db: DbSession, ctx: emp_read) -> EmployeeOut:
    return _to_out(employee_service.get_or_404(db, employee_id, ctx))


@router.get(
    "/{employee_id}/summary",
    response_model=EmployeeSummary,
    summary="Smart-button counts in one call",
)
def employee_summary(
    employee_id: int, db: DbSession, ctx: emp_read
) -> EmployeeSummary:
    employee = employee_service.get_or_404(db, employee_id, ctx)
    return EmployeeSummary(
        employee_id=employee.id, **employee_service.summary_counts(db, employee.id)
    )


@router.post("", response_model=EmployeeOut, status_code=status.HTTP_201_CREATED)
def create_employee(
    payload: EmployeeCreate, db: DbSession, _: emp_create
) -> EmployeeOut:
    data = payload.model_dump()
    email = data["work_email"].lower()
    if db.scalar(select(Employee).where(Employee.work_email == email)):
        raise ConflictError(f"An employee with email {email!r} already exists")

    _assert_refs_exist(db, data)
    employee_service.assert_no_manager_cycle(
        db, employee_id=None, manager_id=data.get("manager_id")
    )

    data["work_email"] = email
    data["bank_ifsc"] = employee_service.validate_ifsc(data.get("bank_ifsc"))
    employee = Employee(**data)
    employee.status = employee_service.derive_status(employee.date_of_exit)

    db.add(employee)
    db.commit()
    db.refresh(employee)
    return _to_out(employee)


@router.patch("/{employee_id}", response_model=EmployeeOut)
def update_employee(
    employee_id: int, payload: EmployeeUpdate, db: DbSession, _: emp_update
) -> EmployeeOut:
    employee = db.get(Employee, employee_id)
    if employee is None:
        raise NotFoundError(f"Employee {employee_id} not found")

    data = payload.model_dump(exclude_unset=True)

    if "work_email" in data and data["work_email"] is not None:
        data["work_email"] = data["work_email"].lower()
        clash = db.scalar(
            select(Employee).where(
                Employee.work_email == data["work_email"], Employee.id != employee_id
            )
        )
        if clash:
            raise ConflictError(
                f"An employee with email {data['work_email']!r} already exists"
            )

    _assert_refs_exist(db, data)
    if "manager_id" in data:
        employee_service.assert_no_manager_cycle(
            db, employee_id=employee_id, manager_id=data["manager_id"]
        )
    if "bank_ifsc" in data:
        data["bank_ifsc"] = employee_service.validate_ifsc(data["bank_ifsc"])

    for field, value in data.items():
        setattr(employee, field, value)

    # Cross-field rule the per-field PATCH schema cannot express: either date
    # may arrive alone, so it is checked against the merged record.
    if employee.date_of_exit and employee.date_of_exit < employee.date_of_joining:
        raise ConflictError(
            "date_of_exit cannot be before date_of_joining",
            code="invalid_date_range",
        )
    employee.status = employee_service.derive_status(employee.date_of_exit)

    db.commit()
    db.refresh(employee)
    return _to_out(employee)
