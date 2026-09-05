"""Employment contracts - the period-based terms payroll computes against.

The brief's first named hard part: "Ensure payroll processes only the
contract applicable to the selected period, avoiding concurrent active
contracts" (A2). Both halves are handled, and neither in Python:

  - "avoiding concurrent active contracts" is a Postgres exclusion
    constraint, created in migration 0003. It is written in raw SQL there
    rather than declared here because it needs btree_gist and a partial
    WHERE clause; see the migration for the exact definition.

  - "only the contract applicable to the selected period" is
    services/contract_resolver.py.

Adjacent contracts are deliberately legal: a contract ending Jan 15 and one
starting Jan 16 do not overlap, and both may be RUNNING. That is a mid-month
raise, the commonest reason an employee has two contracts. PRD v1 treated
this as a blocking error and made a raise unpayable (PRD section 3.2).
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint,
    Date,
    ForeignKey,
    Integer,
    Numeric,
    String,
)
from sqlalchemy import (
    Enum as SAEnum,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import ContractState
from app.db.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.employee import Employee
    from app.models.organization import Department, JobPosition
    from app.models.schedule import WorkingSchedule


class Contract(Base, TimestampMixin):
    __tablename__ = "contract"
    __table_args__ = (
        CheckConstraint("wage > 0", name="ck_contract_wage_positive"),
        CheckConstraint(
            "date_end IS NULL OR date_end >= date_start",
            name="ck_contract_end_after_start",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    employee_id: Mapped[int] = mapped_column(
        ForeignKey("employee.id", ondelete="CASCADE"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(160))

    # --- terms (brief A2: "duration, department, position, wage, structure") ---
    wage: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="INR", nullable=False)

    date_start: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    # NULL means open-ended, which the resolver reads as 'infinity'.
    date_end: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)

    state: Mapped[ContractState] = mapped_column(
        SAEnum(
            ContractState, name="contract_state_enum", native_enum=False, length=32
        ),
        default=ContractState.DRAFT,
        nullable=False,
        index=True,
    )

    department_id: Mapped[int | None] = mapped_column(
        ForeignKey("department.id", ondelete="SET NULL"), nullable=True
    )
    job_position_id: Mapped[int | None] = mapped_column(
        ForeignKey("job_position.id", ondelete="SET NULL"), nullable=True
    )
    working_schedule_id: Mapped[int | None] = mapped_column(
        ForeignKey("working_schedule.id", ondelete="SET NULL"), nullable=True
    )

    # Plain integer for now; promoted to a real FK in the B6 migration once
    # salary_structure exists - the same staging 0001 used for
    # app_user.employee_id.
    salary_structure_id: Mapped[int | None] = mapped_column(
        Integer, nullable=True, index=True
    )

    # --- relationships ---
    employee: Mapped[Employee] = relationship(back_populates="contracts")
    department: Mapped[Department | None] = relationship()
    job_position: Mapped[JobPosition | None] = relationship()
    working_schedule: Mapped[WorkingSchedule | None] = relationship()

    @property
    def is_open_ended(self) -> bool:
        return self.date_end is None

    def covers(self, day: date) -> bool:
        """Whether this contract's term includes `day`, ignoring its state."""
        if day < self.date_start:
            return False
        return self.date_end is None or day <= self.date_end

    def overlaps_period(self, period_start: date, period_end: date) -> bool:
        """Whether the contract term intersects [period_start, period_end]."""
        if self.date_start > period_end:
            return False
        return self.date_end is None or self.date_end >= period_start

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        end = self.date_end or "open"
        return f"<Contract {self.id} emp={self.employee_id} {self.date_start}..{end}>"
