"""Payruns, payslips, lines and warnings (spec B5-B7).

A payrun groups payslips for one period. Its state machine is what makes
"Preserves finalized or paid payroll batches as historical records" (B6)
true: a VALIDATED or PAID payrun cannot be recomputed at all, so editing or
deleting a salary rule can never rewrite what was already paid. That guard
replaces the rule-snapshot table PRD v2 proposed - three lines instead of a
table (PRD section 4.7).

payslip_line denormalises rule_code, name, category and sequence, so a
payslip stays readable forever even after the rule behind it is deleted.
"""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy import (
    Enum as SAEnum,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import (
    PayrunState,
    PayslipState,
    RuleCategory,
    WarningCode,
    WarningSeverity,
)
from app.db.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.employee import Employee
    from app.models.salary import SalaryStructure


class Payrun(Base, TimestampMixin):
    __tablename__ = "payrun"
    __table_args__ = (
        CheckConstraint(
            "period_end >= period_start", name="ck_payrun_period_order"
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    salary_structure_id: Mapped[int] = mapped_column(
        ForeignKey("salary_structure.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    period_start: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    period_end: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    currency: Mapped[str] = mapped_column(String(3), default="INR", nullable=False)

    state: Mapped[PayrunState] = mapped_column(
        SAEnum(PayrunState, name="payrun_state_enum", native_enum=False, length=32),
        default=PayrunState.DRAFT,
        nullable=False,
        index=True,
    )

    computed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    validated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    paid_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    paid_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("app_user.id", ondelete="SET NULL"), nullable=True
    )
    # Mandatory when mark-paid is forced past an open warning. Answers "who
    # force-paid this and why" without a general audit-log table.
    force_paid_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    salary_structure: Mapped[SalaryStructure] = relationship()
    payslips: Mapped[list[Payslip]] = relationship(
        back_populates="payrun", cascade="all, delete-orphan"
    )
    warnings: Mapped[list[PayrollWarning]] = relationship(
        back_populates="payrun", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        return f"<Payrun {self.id} {self.period_start}..{self.period_end} {self.state}>"


class Payslip(Base, TimestampMixin):
    __tablename__ = "payslip"
    __table_args__ = (
        UniqueConstraint("payrun_id", "employee_id", name="uq_payslip_employee"),
        # Structural duplicate prevention (spec B6, B9). PRD v1 warned about
        # duplicates over a gap nothing actually closed.
        Index(
            "payslip_one_per_employee_period",
            "employee_id",
            "period_start",
            "period_end",
            unique=True,
            postgresql_where="state <> 'CANCELLED'",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    payrun_id: Mapped[int] = mapped_column(
        ForeignKey("payrun.id", ondelete="CASCADE"), nullable=False, index=True
    )
    employee_id: Mapped[int] = mapped_column(
        ForeignKey("employee.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # The contract this payslip was computed against - the brief's
    # "applicable period contract" (B7), recorded rather than inferred.
    contract_id: Mapped[int | None] = mapped_column(
        ForeignKey("contract.id", ondelete="SET NULL"), nullable=True
    )

    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="INR", nullable=False)

    basic: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"))
    gross: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"))
    total_deductions: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), default=Decimal("0.00")
    )
    net: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"))

    # The pay basis, stored so the payslip explains itself (spec B7 shows
    # "Worked Days") without recomputing against data that may have moved.
    period_days: Mapped[int] = mapped_column(Integer, default=0)
    contract_days: Mapped[int] = mapped_column(Integer, default=0)
    payable_days: Mapped[int] = mapped_column(Integer, default=0)
    unpaid_days: Mapped[int] = mapped_column(Integer, default=0)
    paid_leave_days: Mapped[int] = mapped_column(Integer, default=0)
    unpaid_leave_days: Mapped[int] = mapped_column(Integer, default=0)
    absent_days: Mapped[int] = mapped_column(Integer, default=0)
    worked_hours: Mapped[Decimal] = mapped_column(
        Numeric(7, 2), default=Decimal("0.00")
    )
    overtime_hours: Mapped[Decimal] = mapped_column(
        Numeric(7, 2), default=Decimal("0.00")
    )

    state: Mapped[PayslipState] = mapped_column(
        SAEnum(
            PayslipState, name="payslip_state_enum", native_enum=False, length=32
        ),
        default=PayslipState.DRAFT,
        nullable=False,
        index=True,
    )

    payrun: Mapped[Payrun] = relationship(back_populates="payslips")
    employee: Mapped[Employee] = relationship()
    lines: Mapped[list[PayslipLine]] = relationship(
        back_populates="payslip",
        cascade="all, delete-orphan",
        order_by="PayslipLine.sequence",
        lazy="selectin",
    )

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        return f"<Payslip {self.id} emp={self.employee_id} net={self.net}>"


class PayslipLine(Base):
    """One computed line. This IS the "Salary Computation" breakdown (B7).

    rule_code, name, category and sequence are denormalised on purpose: the
    line must stay readable after the rule behind it has been edited or
    deleted, which the brief explicitly allows.
    """

    __tablename__ = "payslip_line"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    payslip_id: Mapped[int] = mapped_column(
        ForeignKey("payslip.id", ondelete="CASCADE"), nullable=False, index=True
    )

    rule_code: Mapped[str] = mapped_column(String(20), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    category: Mapped[RuleCategory] = mapped_column(
        SAEnum(
            RuleCategory, name="rule_category_enum", native_enum=False, length=16
        ),
        nullable=False,
    )
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)

    quantity: Mapped[Decimal] = mapped_column(Numeric(8, 2), default=Decimal("1.00"))
    rate: Mapped[Decimal | None] = mapped_column(Numeric(12, 3), nullable=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)

    payslip: Mapped[Payslip] = relationship(back_populates="lines")

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        return f"<PayslipLine {self.sequence} {self.rule_code} {self.amount}>"


class PayrollWarning(Base, TimestampMixin):
    """A finding surfaced before finalization (spec B6, B9).

    Persisted rather than computed on the fly so the payrun screen and the
    dashboard alerts panel read exactly the same rows.
    """

    __tablename__ = "payroll_warning"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    payrun_id: Mapped[int] = mapped_column(
        ForeignKey("payrun.id", ondelete="CASCADE"), nullable=False, index=True
    )
    payslip_id: Mapped[int | None] = mapped_column(
        ForeignKey("payslip.id", ondelete="CASCADE"), nullable=True, index=True
    )
    employee_id: Mapped[int | None] = mapped_column(
        ForeignKey("employee.id", ondelete="CASCADE"), nullable=True
    )

    code: Mapped[WarningCode] = mapped_column(
        SAEnum(WarningCode, name="warning_code_enum", native_enum=False, length=40),
        nullable=False,
        index=True,
    )
    severity: Mapped[WarningSeverity] = mapped_column(
        SAEnum(
            WarningSeverity,
            name="warning_severity_enum",
            native_enum=False,
            length=16,
        ),
        nullable=False,
        index=True,
    )
    message: Mapped[str] = mapped_column(Text, nullable=False)

    payrun: Mapped[Payrun] = relationship(back_populates="warnings")

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        return f"<PayrollWarning {self.severity} {self.code}>"
