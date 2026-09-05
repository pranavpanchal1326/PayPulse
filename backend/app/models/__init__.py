"""Importing this package registers every model on the shared metadata.

Alembic autogenerate and `Base.metadata.create_all` both depend on it.
"""
from app.models.attendance import Attendance
from app.models.contract import Contract
from app.models.employee import Employee
from app.models.holiday import PublicHoliday
from app.models.organization import Department, JobPosition
from app.models.schedule import WorkingSchedule, WorkingScheduleLine
from app.models.user import User

__all__ = [
    "Attendance",
    "Contract",
    "Department",
    "Employee",
    "JobPosition",
    "PublicHoliday",
    "User",
    "WorkingSchedule",
    "WorkingScheduleLine",
]
