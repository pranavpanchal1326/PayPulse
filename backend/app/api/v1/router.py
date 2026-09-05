"""Aggregates every v1 router. Feature routers get mounted here as they land."""
from fastapi import APIRouter

from app.api.v1 import (
    attendances,
    auth,
    contracts,
    dashboard,
    demo,
    employees,
    organization,
    payruns,
    salary,
    timeoff,
    working_schedules,
)

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(organization.router)
api_router.include_router(working_schedules.router)
api_router.include_router(employees.router)
api_router.include_router(contracts.router)
api_router.include_router(attendances.router)
api_router.include_router(timeoff.router)
api_router.include_router(salary.router)
api_router.include_router(payruns.router)
api_router.include_router(dashboard.router)
api_router.include_router(demo.router)
