"""Working schedules.

`hours_per_week` is never accepted from a client - spec A3 requires it to be
calculated from the day pattern. Every write funnels through
`services.schedule_calc.recompute`.
"""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.deps import AccessContext, DbSession, require
from app.core.enums import Weekday
from app.core.errors import ConflictError, NotFoundError
from app.core.rbac import Action, Resource
from app.models.employee import Employee
from app.models.schedule import WorkingSchedule, WorkingScheduleLine
from app.schemas.schedule import (
    WorkingScheduleCreate,
    WorkingScheduleLineOut,
    WorkingScheduleOut,
    WorkingScheduleUpdate,
)
from app.services import schedule_calc

router = APIRouter(prefix="/working-schedules", tags=["working schedules"])

sched_read = Annotated[
    AccessContext, Depends(require(Resource.WORKING_SCHEDULE, Action.READ))
]
sched_create = Annotated[
    AccessContext, Depends(require(Resource.WORKING_SCHEDULE, Action.CREATE))
]
sched_update = Annotated[
    AccessContext, Depends(require(Resource.WORKING_SCHEDULE, Action.UPDATE))
]


def _to_out(schedule: WorkingSchedule, employee_count: int = 0) -> WorkingScheduleOut:
    lines = [
        WorkingScheduleLineOut(
            id=line.id,
            day_of_week=line.day_of_week,
            day_name=Weekday(line.day_of_week).label,
            start_time=line.start_time,
            end_time=line.end_time,
            break_minutes=line.break_minutes,
            hours=schedule_calc.line_hours(line),
            crosses_midnight=line.end_time <= line.start_time,
        )
        for line in schedule.lines
    ]
    return WorkingScheduleOut(
        id=schedule.id,
        name=schedule.name,
        hours_per_week=schedule.hours_per_week,
        working_days=schedule_calc.working_days(schedule.lines),
        daily_hours=schedule_calc.daily_hours(schedule.lines),
        employee_count=employee_count,
        lines=lines,
    )


def _employee_count(db: Session, schedule_id: int) -> int:
    return (
        db.scalar(
            select(func.count())
            .select_from(Employee)
            .where(Employee.working_schedule_id == schedule_id)
        )
        or 0
    )


def _replace_lines(schedule: WorkingSchedule, payload_lines) -> None:
    """Validate then swap the whole weekly pattern, and refresh the hours."""
    schedule_calc.assert_unique_days(payload_lines)
    for line in payload_lines:
        # Raises BusinessRuleError on an over-long shift or an impossible
        # break, before anything is written.
        schedule_calc.line_hours(line)

    schedule.lines.clear()
    for line in sorted(payload_lines, key=lambda item: item.day_of_week):
        schedule.lines.append(
            WorkingScheduleLine(
                day_of_week=line.day_of_week,
                start_time=line.start_time,
                end_time=line.end_time,
                break_minutes=line.break_minutes,
            )
        )
    schedule_calc.recompute(schedule)


@router.get("", response_model=list[WorkingScheduleOut])
def list_schedules(db: DbSession, _: sched_read) -> list[WorkingScheduleOut]:
    schedules = list(db.scalars(select(WorkingSchedule).order_by(WorkingSchedule.name)))
    return [_to_out(s, _employee_count(db, s.id)) for s in schedules]


@router.get("/{schedule_id}", response_model=WorkingScheduleOut)
def get_schedule(schedule_id: int, db: DbSession, _: sched_read) -> WorkingScheduleOut:
    schedule = db.get(WorkingSchedule, schedule_id)
    if schedule is None:
        raise NotFoundError(f"Working schedule {schedule_id} not found")
    return _to_out(schedule, _employee_count(db, schedule_id))


@router.post(
    "", response_model=WorkingScheduleOut, status_code=status.HTTP_201_CREATED
)
def create_schedule(
    payload: WorkingScheduleCreate, db: DbSession, _: sched_create
) -> WorkingScheduleOut:
    if db.scalar(select(WorkingSchedule).where(WorkingSchedule.name == payload.name)):
        raise ConflictError(f"A schedule named {payload.name!r} already exists")
    schedule = WorkingSchedule(name=payload.name)
    _replace_lines(schedule, payload.lines)
    db.add(schedule)
    db.commit()
    db.refresh(schedule)
    return _to_out(schedule)


@router.patch("/{schedule_id}", response_model=WorkingScheduleOut)
def update_schedule(
    schedule_id: int,
    payload: WorkingScheduleUpdate,
    db: DbSession,
    _: sched_update,
) -> WorkingScheduleOut:
    schedule = db.get(WorkingSchedule, schedule_id)
    if schedule is None:
        raise NotFoundError(f"Working schedule {schedule_id} not found")

    if payload.name is not None and payload.name != schedule.name:
        if db.scalar(
            select(WorkingSchedule).where(WorkingSchedule.name == payload.name)
        ):
            raise ConflictError(f"A schedule named {payload.name!r} already exists")
        schedule.name = payload.name

    # `lines` omitted means "leave the pattern alone"; an empty list is a
    # deliberate request to clear it, which is why this checks for None.
    if payload.lines is not None:
        _replace_lines(schedule, payload.lines)

    db.commit()
    db.refresh(schedule)
    return _to_out(schedule, _employee_count(db, schedule_id))
