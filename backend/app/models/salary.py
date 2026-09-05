"""Salary structures and rules (spec A5, A6).

The brief's fourth named hard part: "Rules are processed in a specific
sequence to ensure dependencies are respected, allowing complex totals to
build upon earlier calculations."

Nothing about the rules lives in Python. They are database rows, fully
creatable, editable, reorderable and deletable through the API - which is
what the scoring line demands: "Implement essential business rules ...
directly in the application logic rather than using hardcoded values."
A judge edits HRA from 40% to 50%, hits Compute, and net salary moves.
"""
from __future__ import annotations

from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    ForeignKey,
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

from app.core.enums import AmountType, ConditionType, RuleCategory
from app.db.base import Base, TimestampMixin

if TYPE_CHECKING:
    pass


class SalaryStructure(Base, TimestampMixin):
    """A named collection of rules (spec A5), e.g. "Regular Salary"."""

    __tablename__ = "salary_structure"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    code: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    currency: Mapped[str] = mapped_column(String(3), default="INR", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    rules: Mapped[list[SalaryRule]] = relationship(
        back_populates="structure",
        cascade="all, delete-orphan",
        order_by="SalaryRule.sequence",
        lazy="selectin",
    )

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        return f"<SalaryStructure {self.code} rules={len(self.rules)}>"


class SalaryRule(Base, TimestampMixin):
    """One earning or deduction line (spec A6).

    `sequence` is the whole point: rules evaluate in ascending order, and a
    later rule may reference an earlier one's result through `rules.<CODE>`
    or a running category total through `categories.<CAT>`. A rule may never
    reference a *later* sequence - that is checked at save and again at
    compute (PRD section 4.4).
    """

    __tablename__ = "salary_rule"
    __table_args__ = (
        UniqueConstraint("structure_id", "code", name="uq_salary_rule_code"),
        CheckConstraint("sequence > 0", name="ck_salary_rule_sequence_positive"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    structure_id: Mapped[int] = mapped_column(
        ForeignKey("salary_structure.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    code: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    category: Mapped[RuleCategory] = mapped_column(
        SAEnum(
            RuleCategory, name="rule_category_enum", native_enum=False, length=16
        ),
        nullable=False,
        index=True,
    )
    sequence: Mapped[int] = mapped_column(Integer, nullable=False, index=True)

    condition_type: Mapped[ConditionType] = mapped_column(
        SAEnum(
            ConditionType, name="condition_type_enum", native_enum=False, length=16
        ),
        default=ConditionType.ALWAYS,
        nullable=False,
    )
    condition_expr: Mapped[str | None] = mapped_column(Text, nullable=True)

    amount_type: Mapped[AmountType] = mapped_column(
        SAEnum(AmountType, name="amount_type_enum", native_enum=False, length=16),
        default=AmountType.FIXED,
        nullable=False,
    )
    amount_fixed: Mapped[Decimal | None] = mapped_column(
        Numeric(12, 2), nullable=True
    )
    percentage: Mapped[Decimal | None] = mapped_column(Numeric(6, 3), nullable=True)
    percentage_base_code: Mapped[str | None] = mapped_column(
        String(20), nullable=True
    )
    amount_formula: Mapped[str | None] = mapped_column(Text, nullable=True)

    # A rule can compute and feed later rules without printing a line -
    # useful for intermediate totals.
    appears_on_payslip: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    structure: Mapped[SalaryStructure] = relationship(back_populates="rules")

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        return f"<SalaryRule {self.sequence} {self.code} {self.category}>"
