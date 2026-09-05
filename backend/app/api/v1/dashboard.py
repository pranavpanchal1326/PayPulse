"""Payroll dashboard (spec A7, B9).

One endpoint, one round trip, role-filtered. HR_MANAGER has "no access to
payroll features" (spec page 3), so the same endpoint strips every money
field for that role rather than a second endpoint drifting out of sync
(PRD section 6.1a).
"""
from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.core.deps import AccessContext, DbSession, require
from app.core.enums import EmployeeType, Role
from app.core.errors import ConflictError
from app.core.rbac import Action, Resource
from app.services import dashboard as dashboard_service

router = APIRouter(tags=["dashboard"])

dash_read = Annotated[
    AccessContext, Depends(require(Resource.DASHBOARD, Action.READ))
]


@router.get("/dashboard", response_model=dict)
def get_dashboard(
    db: DbSession,
    ctx: dash_read,
    period_start: Annotated[date, Query()],
    period_end: Annotated[date, Query()],
    department_id: Annotated[int | None, Query()] = None,
    employee_type: Annotated[EmployeeType | None, Query()] = None,
) -> dict:
    """Live aggregates over HR, attendance, leave and payroll."""
    if period_end < period_start:
        raise ConflictError(
            "period_end cannot be before period_start", code="invalid_date_range"
        )
    payload = dashboard_service.build(
        db,
        period_start,
        period_end,
        department_id,
        employee_type,
        include_money=ctx.user.role is not Role.HR_MANAGER,
    )
    payload["scope"] = (
        "hr" if ctx.user.role is Role.HR_MANAGER else "payroll"
    )
    return payload
