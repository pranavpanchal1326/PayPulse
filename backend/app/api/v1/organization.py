"""Departments and job positions - the employee form's lookup data."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.deps import AccessContext, DbSession, require
from app.core.errors import ConflictError, NotFoundError
from app.core.rbac import Action, Resource
from app.models.employee import Employee
from app.models.organization import Department, JobPosition
from app.schemas.organization import (
    DepartmentCreate,
    DepartmentOut,
    DepartmentUpdate,
    JobPositionCreate,
    JobPositionOut,
    JobPositionUpdate,
)

router = APIRouter(tags=["organization"])

# --- departments -------------------------------------------------------

dept_read = Annotated[
    AccessContext, Depends(require(Resource.DEPARTMENT, Action.READ))
]
dept_create = Annotated[
    AccessContext, Depends(require(Resource.DEPARTMENT, Action.CREATE))
]
dept_update = Annotated[
    AccessContext, Depends(require(Resource.DEPARTMENT, Action.UPDATE))
]


def _headcount_map(db: Session, column, ids: list[int]) -> dict[int, int]:
    """Employee counts keyed by the given FK, in one query rather than N."""
    if not ids:
        return {}
    rows = db.execute(
        select(column, func.count(Employee.id))
        .where(column.in_(ids))
        .group_by(column)
    ).all()
    return {key: count for key, count in rows}


@router.get("/departments", response_model=list[DepartmentOut])
def list_departments(db: DbSession, _: dept_read) -> list[DepartmentOut]:
    departments = list(db.scalars(select(Department).order_by(Department.name)))
    counts = _headcount_map(
        db, Employee.department_id, [d.id for d in departments]
    )
    return [
        DepartmentOut(
            id=d.id,
            name=d.name,
            description=d.description,
            employee_count=counts.get(d.id, 0),
        )
        for d in departments
    ]


@router.post(
    "/departments", response_model=DepartmentOut, status_code=status.HTTP_201_CREATED
)
def create_department(
    payload: DepartmentCreate, db: DbSession, _: dept_create
) -> DepartmentOut:
    if db.scalar(select(Department).where(Department.name == payload.name)):
        raise ConflictError(f"A department named {payload.name!r} already exists")
    department = Department(**payload.model_dump())
    db.add(department)
    db.commit()
    db.refresh(department)
    return DepartmentOut.model_validate(department)


@router.patch("/departments/{department_id}", response_model=DepartmentOut)
def update_department(
    department_id: int, payload: DepartmentUpdate, db: DbSession, _: dept_update
) -> DepartmentOut:
    department = db.get(Department, department_id)
    if department is None:
        raise NotFoundError(f"Department {department_id} not found")
    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"] != department.name:
        if db.scalar(select(Department).where(Department.name == data["name"])):
            raise ConflictError(f"A department named {data['name']!r} already exists")
    for field, value in data.items():
        setattr(department, field, value)
    db.commit()
    db.refresh(department)
    return DepartmentOut.model_validate(department)


# --- job positions -----------------------------------------------------

pos_read = Annotated[
    AccessContext, Depends(require(Resource.JOB_POSITION, Action.READ))
]
pos_create = Annotated[
    AccessContext, Depends(require(Resource.JOB_POSITION, Action.CREATE))
]
pos_update = Annotated[
    AccessContext, Depends(require(Resource.JOB_POSITION, Action.UPDATE))
]


def _position_out(position: JobPosition, count: int = 0) -> JobPositionOut:
    return JobPositionOut(
        id=position.id,
        name=position.name,
        description=position.description,
        department_id=position.department_id,
        department_name=position.department.name if position.department else None,
        employee_count=count,
    )


@router.get("/job-positions", response_model=list[JobPositionOut])
def list_job_positions(
    db: DbSession,
    _: pos_read,
    department_id: Annotated[int | None, Query()] = None,
) -> list[JobPositionOut]:
    stmt = select(JobPosition).order_by(JobPosition.name)
    if department_id is not None:
        stmt = stmt.where(JobPosition.department_id == department_id)
    positions = list(db.scalars(stmt))
    counts = _headcount_map(
        db, Employee.job_position_id, [p.id for p in positions]
    )
    return [_position_out(p, counts.get(p.id, 0)) for p in positions]


@router.post(
    "/job-positions",
    response_model=JobPositionOut,
    status_code=status.HTTP_201_CREATED,
)
def create_job_position(
    payload: JobPositionCreate, db: DbSession, _: pos_create
) -> JobPositionOut:
    if payload.department_id is not None and not db.get(
        Department, payload.department_id
    ):
        raise NotFoundError(f"Department {payload.department_id} not found")
    position = JobPosition(**payload.model_dump())
    db.add(position)
    db.commit()
    db.refresh(position)
    return _position_out(position)


@router.patch("/job-positions/{position_id}", response_model=JobPositionOut)
def update_job_position(
    position_id: int, payload: JobPositionUpdate, db: DbSession, _: pos_update
) -> JobPositionOut:
    position = db.get(JobPosition, position_id)
    if position is None:
        raise NotFoundError(f"Job position {position_id} not found")
    data = payload.model_dump(exclude_unset=True)
    if data.get("department_id") is not None and not db.get(
        Department, data["department_id"]
    ):
        raise NotFoundError(f"Department {data['department_id']} not found")
    for field, value in data.items():
        setattr(position, field, value)
    db.commit()
    db.refresh(position)
    return _position_out(position)
