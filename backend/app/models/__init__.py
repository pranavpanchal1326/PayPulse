"""Importing this package registers every model on the shared metadata.

Alembic autogenerate and `Base.metadata.create_all` both depend on it.
"""
from app.models.employee import Employee
from app.models.organization import Department, JobPosition
from app.models.schedule import WorkingSchedule, WorkingScheduleLine
from app.models.user import User

__all__ = [
    "Department",
    "Employee",
    "JobPosition",
    "User",
    "WorkingSchedule",
    "WorkingScheduleLine",
]
