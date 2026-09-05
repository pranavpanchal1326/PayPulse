"""The Employee - the hub every other record hangs off.

`date_of_joining` and `date_of_exit` are load-bearing rather than decorative:
they bound `contract_days` in the payroll engine (PRD section 4.2), which is
what makes a joiner on the 20th and a leaver on the 10th prorate correctly
instead of each being paid a full month.
"""
from __future__ import annotations

from datetime import date
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint,
    Date,
    ForeignKey,
    Integer,
    String,
)
from sqlalchemy import (
    Enum as SAEnum,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import EmployeeStatus, EmployeeType
from app.db.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.attendance import Attendance
    from app.models.contract import Contract
    from app.models.organization import Department, JobPosition
    from app.models.schedule import WorkingSchedule
    from app.models.timeoff import LeaveAllocation, TimeOffRequest


class Employee(Base, TimestampMixin):
    """A person on the roster: their HR record, not their login.

    The login lives on User, which points here through employee_id.
    """
    __tablename__ = "employee"
    __table_args__ = (
        CheckConstraint(
            "date_of_exit IS NULL OR date_of_exit >= date_of_joining",
            name="ck_employee_exit_after_joining",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    # --- identity ---
    first_name: Mapped[str] = mapped_column(String(80))
    last_name: Mapped[str] = mapped_column(String(80))
    work_email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    phone: Mapped[str | None] = mapped_column(String(32), nullable=True)

    # --- job ---
    department_id: Mapped[int | None] = mapped_column(
        ForeignKey("department.id", ondelete="SET NULL"), nullable=True, index=True
    )
    job_position_id: Mapped[int | None] = mapped_column(
        ForeignKey("job_position.id", ondelete="SET NULL"), nullable=True, index=True
    )
    working_schedule_id: Mapped[int | None] = mapped_column(
        ForeignKey("working_schedule.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    # Required by the brief (A1, B2: "department, manager, schedule, job
    # position"). Also powers ?scope=my_team.
    manager_id: Mapped[int | None] = mapped_column(
        ForeignKey("employee.id", ondelete="SET NULL"), nullable=True, index=True
    )
    employee_type: Mapped[EmployeeType] = mapped_column(
        SAEnum(
            EmployeeType, name="employee_type_enum", native_enum=False, length=32
        ),
        default=EmployeeType.FULL_TIME,
        index=True,
    )

    # --- lifecycle ---
    date_of_joining: Mapped[date] = mapped_column(Date, nullable=False)
    date_of_exit: Mapped[date | None] = mapped_column(Date, nullable=True)
    # Derived from date_of_exit on every write (see services.employee_service);
    # stored so list filtering stays a plain indexed predicate.
    status: Mapped[EmployeeStatus] = mapped_column(
        SAEnum(
            EmployeeStatus, name="employee_status_enum", native_enum=False, length=32
        ),
        default=EmployeeStatus.ACTIVE,
        index=True,
    )

    # --- payout details ---
    # Emptiness here is what raises MISSING_BANK_DETAILS at mark-paid (B7).
    bank_account: Mapped[str | None] = mapped_column(String(34), nullable=True)
    bank_ifsc: Mapped[str | None] = mapped_column(String(11), nullable=True)

    # --- relationships ---
    department: Mapped[Department | None] = relationship(back_populates="employees")
    job_position: Mapped[JobPosition | None] = relationship(
        back_populates="employees"
    )
    working_schedule: Mapped[WorkingSchedule | None] = relationship(
        back_populates="employees"
    )
    manager: Mapped[Employee | None] = relationship(
        remote_side="Employee.id", back_populates="reports"
    )
    reports: Mapped[list[Employee]] = relationship(back_populates="manager")
    contracts: Mapped[list[Contract]] = relationship(
        back_populates="employee",
        cascade="all, delete-orphan",
        order_by="Contract.date_start.desc()",
    )
    attendances: Mapped[list[Attendance]] = relationship(
        back_populates="employee",
        cascade="all, delete-orphan",
        order_by="Attendance.work_date.desc()",
    )
    allocations: Mapped[list[LeaveAllocation]] = relationship(
        back_populates="employee", cascade="all, delete-orphan"
    )
    time_off_requests: Mapped[list[TimeOffRequest]] = relationship(
        back_populates="employee",
        cascade="all, delete-orphan",
        order_by="TimeOffRequest.date_from.desc()",
    )

    @property
    def full_name(self) -> str:
        """First and last name, joined for display."""
        return f"{self.first_name} {self.last_name}".strip()

    @property
    def has_bank_details(self) -> bool:
        """Whether payroll can pay this employee - both fields present."""
        return bool(self.bank_account and self.bank_ifsc)

    @property
    def employee_number(self) -> str:
        """The staff number shown on the roster, the payslip and the pickers.

        Derived from the primary key rather than stored: it has to be stable
        and unique, which the id already is, and a second column would only
        add a way for the two to disagree. Formatted, because "EMP0007" is
        recognisable as an employee number on a payslip and "7" is not.
        """
        return f"EMP{self.id:04d}"

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        return f"<Employee {self.id} {self.full_name}>"
