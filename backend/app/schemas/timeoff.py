from __future__ import annotations

from datetime import date
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.enums import HalfDay, LeaveUnit, RequestState

# --- types -------------------------------------------------------------


class TimeOffTypeCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    code: str = Field(min_length=1, max_length=20, pattern=r"^[A-Z][A-Z0-9_]{0,19}$")
    unit: LeaveUnit = LeaveUnit.DAYS
    # False makes every approved day of this type an LWP deduction.
    is_paid: bool = True
    requires_allocation: bool = True
    color: str | None = Field(default=None, max_length=16)
    is_active: bool = True


class TimeOffTypeUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    unit: LeaveUnit | None = None
    is_paid: bool | None = None
    requires_allocation: bool | None = None
    color: str | None = Field(default=None, max_length=16)
    is_active: bool | None = None


class TimeOffTypeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    code: str
    unit: LeaveUnit
    is_paid: bool
    requires_allocation: bool
    color: str | None = None
    is_active: bool


# --- allocations -------------------------------------------------------


class LeaveAllocationCreate(BaseModel):
    employee_id: int
    time_off_type_id: int
    days: Decimal = Field(gt=0, max_digits=6, decimal_places=2)
    validity_from: date
    validity_to: date | None = None
    notes: str | None = None

    @model_validator(mode="after")
    def _validity_order(self) -> LeaveAllocationCreate:
        if self.validity_to and self.validity_to < self.validity_from:
            raise ValueError("validity_to cannot be before validity_from")
        return self


class LeaveAllocationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    employee_id: int
    employee_name: str | None = None
    time_off_type_id: int
    type_name: str | None = None
    days: Decimal
    validity_from: date
    validity_to: date | None = None
    state: RequestState
    notes: str | None = None


# --- requests ----------------------------------------------------------


class TimeOffRequestCreate(BaseModel):
    # Omitted by an employee filing for themselves.
    employee_id: int | None = None
    time_off_type_id: int
    date_from: date
    date_to: date
    # Required only when the type is measured in hours.
    duration_hours: Decimal | None = Field(
        default=None, gt=0, max_digits=6, decimal_places=2
    )
    # Which half of the day, when it is half a day. Null is a whole day.
    half_day: HalfDay | None = None
    reason: str | None = None
    # Skip DRAFT and go straight to the approver.
    submit: bool = True

    @model_validator(mode="after")
    def _date_order(self) -> TimeOffRequestCreate:
        if self.date_to < self.date_from:
            raise ValueError("date_to cannot be before date_from")
        return self


class DecisionRequest(BaseModel):
    note: str | None = Field(default=None, max_length=500)


class TimeOffRequestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    employee_id: int
    employee_name: str | None = None
    time_off_type_id: int
    type_name: str | None = None
    type_code: str | None = None
    # False here is what becomes an LWP line on the payslip.
    is_paid: bool = True
    date_from: date
    date_to: date
    # Schedule- and holiday-aware working days, frozen at write time.
    duration_days: Decimal
    duration_hours: Decimal | None = None
    half_day: HalfDay | None = None
    calendar_days: int = 0
    state: RequestState
    reason: str | None = None
    approver_id: int | None = None
    approver_name: str | None = None
    decision_note: str | None = None


class BalanceOut(BaseModel):
    """Spec A4: "tracking detailed metrics like taken, remaining, and
    validity periods". `pending` and `projected_remaining` are added because
    approval blocks past zero, so the employee needs to see what they have
    already committed before filing more."""

    time_off_type_id: int
    type_name: str
    type_code: str
    unit: LeaveUnit
    is_paid: bool
    requires_allocation: bool
    allocated: Decimal
    taken: Decimal
    pending: Decimal
    remaining: Decimal
    projected_remaining: Decimal
    validity_from: date | None = None
    validity_to: date | None = None


class LeaveSummary(BaseModel):
    """Approved leave in a period, split the way the pay basis needs it."""

    employee_id: int
    period_start: date
    period_end: date
    paid_leave_days: int
    unpaid_leave_days: int
    total_leave_days: int
