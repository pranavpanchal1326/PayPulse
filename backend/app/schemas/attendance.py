from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.core.enums import AttendanceStatus


class AttendanceCreate(BaseModel):
    """Note the absence of worked_hours, overtime_hours and status: all three
    are computed server-side (spec B3) and anything a client sends is
    ignored."""

    employee_id: int
    check_in: datetime
    check_out: datetime | None = None
    break_minutes: int = Field(default=0, ge=0, lt=24 * 60)
    notes: str | None = Field(default=None, max_length=255)


class AttendanceUpdate(BaseModel):
    """A manual correction. `edit_reason` is mandatory - spec B3 restricts
    corrections to authorised users, and an unexplained edit is not
    auditable."""

    check_in: datetime | None = None
    check_out: datetime | None = None
    break_minutes: int | None = Field(default=None, ge=0, lt=24 * 60)
    notes: str | None = Field(default=None, max_length=255)
    edit_reason: str = Field(min_length=3, max_length=500)


class CheckInRequest(BaseModel):
    # Omit both to check in "now" as the calling employee.
    employee_id: int | None = None
    at: datetime | None = None


class CheckOutRequest(BaseModel):
    employee_id: int | None = None
    at: datetime | None = None
    break_minutes: int | None = Field(default=None, ge=0, lt=24 * 60)


class AttendanceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    employee_id: int
    employee_name: str | None = None
    work_date: date
    check_in: datetime
    check_out: datetime | None = None
    break_minutes: int
    worked_hours: Decimal
    overtime_hours: Decimal
    status: AttendanceStatus
    is_manual_edit: bool = False
    edited_by_id: int | None = None
    edited_by_name: str | None = None
    edit_reason: str | None = None
    is_holiday: bool = False
    notes: str | None = None


class AttendanceOverview(BaseModel):
    """Period aggregates, shaped for the dashboard's Attendance Overview
    (spec B9: Present, Late, Absent, Overtime, missing check-outs, manual
    edits, coverage)."""

    employee_id: int | None = None
    period_start: date
    period_end: date

    period_days: int
    contract_days: int
    days_with_records: int
    # Derived, never a row status: scheduled days with no record and no
    # approved leave (PRD section 3.4).
    absent_days: int
    # Approved leave in the period, split the way the pay basis needs it.
    paid_leave_days: int = 0
    unpaid_leave_days: int = 0
    # A record on a day already covered by leave. Leave wins for pay; the
    # hours still count towards overtime.
    attendance_on_leave_days: int = 0

    present: int
    late: int
    overtime_days: int
    missing_checkouts: int
    manual_edits: int

    worked_hours: Decimal
    overtime_hours: Decimal
    # Share of scheduled days accounted for, present OR excused by leave.
    coverage_pct: float
    # Share actually worked - coverage minus the excused days.
    present_pct: float = 0.0
    absence_policy: str
