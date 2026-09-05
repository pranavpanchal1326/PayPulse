"""The employee record: roster, directory and profile (spec B1)."""
from __future__ import annotations

from datetime import date

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator

from app.core.enums import EmployeeStatus, EmployeeType


class EmployeeBase(BaseModel):
    """Fields shared by creating and updating an employee."""
    first_name: str = Field(min_length=1, max_length=80)
    last_name: str = Field(min_length=1, max_length=80)
    work_email: EmailStr
    phone: str | None = Field(default=None, max_length=32)
    department_id: int | None = None
    job_position_id: int | None = None
    working_schedule_id: int | None = None
    manager_id: int | None = None
    employee_type: EmployeeType = EmployeeType.FULL_TIME
    date_of_joining: date
    date_of_exit: date | None = None
    bank_account: str | None = Field(default=None, max_length=34)
    bank_ifsc: str | None = Field(default=None, max_length=11)

    @model_validator(mode="after")
    def _exit_after_joining(self) -> EmployeeBase:
        """Reject an exit date earlier than the joining date."""
        if self.date_of_exit and self.date_of_exit < self.date_of_joining:
            raise ValueError("date_of_exit cannot be before date_of_joining")
        return self


class EmployeeCreate(EmployeeBase):
    """A new employee. Their staff number is derived, never supplied."""
    pass


class EmployeeUpdate(BaseModel):
    """Every field optional - PATCH semantics."""

    first_name: str | None = Field(default=None, min_length=1, max_length=80)
    last_name: str | None = Field(default=None, min_length=1, max_length=80)
    work_email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=32)
    department_id: int | None = None
    job_position_id: int | None = None
    working_schedule_id: int | None = None
    manager_id: int | None = None
    employee_type: EmployeeType | None = None
    date_of_joining: date | None = None
    date_of_exit: date | None = None
    bank_account: str | None = Field(default=None, max_length=34)
    bank_ifsc: str | None = Field(default=None, max_length=11)


class EmployeeOut(BaseModel):
    """An employee as the roster and profile screens show them."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    # Derived on the model from the id; see Employee.employee_number.
    employee_number: str = ""
    first_name: str
    last_name: str
    full_name: str
    work_email: EmailStr
    phone: str | None = None

    department_id: int | None = None
    department_name: str | None = None
    job_position_id: int | None = None
    job_position_name: str | None = None
    working_schedule_id: int | None = None
    working_schedule_name: str | None = None
    manager_id: int | None = None
    manager_name: str | None = None

    employee_type: EmployeeType
    # Derived from date_of_exit on write; read-only over the API.
    status: EmployeeStatus
    date_of_joining: date
    date_of_exit: date | None = None

    bank_account: str | None = None
    bank_ifsc: str | None = None
    # Drives the MISSING_BANK_DETAILS warning at mark-paid (B6).
    has_bank_details: bool = False


class EmployeeSummary(BaseModel):
    """Smart-button counts for the employee form (spec B2).

    Modules that have not been built yet report 0; the shape is final so the
    frontend never has to change when a block lands.
    """

    employee_id: int
    contracts: int = 0
    attendances: int = 0
    time_off_requests: int = 0
    allocations: int = 0
    payslips: int = 0
