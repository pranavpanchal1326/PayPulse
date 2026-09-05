"""Salary structures and rules, payruns, payslips and warnings (A6, B5-B8).

Money is serialised as a string throughout, never a float, so no amount
loses paise on the way to the browser.
"""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.enums import (
    AmountType,
    ConditionType,
    EmployeeType,
    PayrunState,
    PayslipState,
    RuleCategory,
    WarningCode,
    WarningSeverity,
)

# --- salary rules (spec A6) --------------------------------------------


class SalaryRuleBase(BaseModel):
    """Fields shared by creating and reading a salary rule."""
    code: str = Field(pattern=r"^[A-Z][A-Z0-9_]{1,19}$")
    name: str = Field(min_length=1, max_length=120)
    category: RuleCategory
    sequence: int = Field(gt=0)
    condition_type: ConditionType = ConditionType.ALWAYS
    condition_expr: str | None = None
    amount_type: AmountType = AmountType.FIXED
    amount_fixed: Decimal | None = None
    percentage: Decimal | None = None
    percentage_base_code: str | None = None
    amount_formula: str | None = None
    appears_on_payslip: bool = True
    is_active: bool = True

    @model_validator(mode="after")
    def _amount_fields_match_the_type(self) -> SalaryRuleBase:
        """Require the amount fields the chosen amount_type actually uses."""
        if self.amount_type is AmountType.FIXED and self.amount_fixed is None:
            raise ValueError("amount_fixed is required for a FIXED rule")
        if self.amount_type is AmountType.PERCENTAGE and (
            self.percentage is None or not self.percentage_base_code
        ):
            raise ValueError(
                "percentage and percentage_base_code are required for a "
                "PERCENTAGE rule"
            )
        if self.amount_type is AmountType.FORMULA and not self.amount_formula:
            raise ValueError("amount_formula is required for a FORMULA rule")
        return self


class SalaryRuleCreate(SalaryRuleBase):
    """A new rule inside a structure."""
    structure_id: int


class SalaryRuleUpdate(BaseModel):
    """Changes to a rule. Omitted fields are left alone."""
    name: str | None = Field(default=None, min_length=1, max_length=120)
    category: RuleCategory | None = None
    sequence: int | None = Field(default=None, gt=0)
    condition_type: ConditionType | None = None
    condition_expr: str | None = None
    amount_type: AmountType | None = None
    amount_fixed: Decimal | None = None
    percentage: Decimal | None = None
    percentage_base_code: str | None = None
    amount_formula: str | None = None
    appears_on_payslip: bool | None = None
    is_active: bool | None = None


class SalaryRuleOut(BaseModel):
    """A rule as the editor and the payslip breakdown read it."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    structure_id: int
    code: str
    name: str
    category: RuleCategory
    sequence: int
    condition_type: ConditionType
    condition_expr: str | None = None
    amount_type: AmountType
    amount_fixed: Decimal | None = None
    percentage: Decimal | None = None
    percentage_base_code: str | None = None
    amount_formula: str | None = None
    appears_on_payslip: bool
    is_active: bool


class ReorderRequest(BaseModel):
    """New sequence for a structure's rules. Order decides what sees what."""
    """Drag-to-reorder (spec A5): ids in their new evaluation order."""

    rule_ids: list[int] = Field(min_length=1)


class FormulaCheckRequest(BaseModel):
    """A formula to validate before it is saved."""
    expression: str
    # Optional sample context so the author sees a real number, not just
    # "valid".
    wage: Decimal = Decimal("50000.00")
    period_days: int = 22
    contract_days: int = 22


class FormulaCheckResponse(BaseModel):
    """Whether a formula parses, and what it evaluates to on sample data."""
    valid: bool
    error: str | None = None
    sample_result: Decimal | None = None
    references: list[str] = []


# --- structures (spec A5) ----------------------------------------------


class SalaryStructureCreate(BaseModel):
    """A new salary structure."""
    name: str = Field(min_length=1, max_length=120)
    code: str = Field(pattern=r"^[A-Z][A-Z0-9_]{1,19}$")
    description: str | None = None
    currency: str = Field(default="INR", min_length=3, max_length=3)


class SalaryStructureUpdate(BaseModel):
    """Changes to a structure. Omitted fields are left alone."""
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = None
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    is_active: bool | None = None


class SalaryStructureOut(BaseModel):
    """A structure with its ordered rules."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    code: str
    description: str | None = None
    currency: str
    is_active: bool
    rule_count: int = 0
    employee_count: int = 0
    rules: list[SalaryRuleOut] = []


# --- payrun wizard (spec B5) -------------------------------------------


class EligibilityRequest(BaseModel):
    """Ask who could be paid for a period, before creating the payrun."""
    salary_structure_id: int
    period_start: date
    period_end: date
    department_id: int | None = None
    employee_type: EmployeeType | None = None


class EligibilityOut(BaseModel):
    """One employee's eligibility, with the reasons they are blocked."""
    employee_id: int
    name: str
    department: str | None = None
    contract_wage: str | None = None
    currency: str = "INR"
    period_days: int
    contract_days: int
    eligible: bool
    blockers: list[str] = []
    notes: list[str] = []


class PayrunCreate(BaseModel):
    """A new payrun: a structure, a period and who it covers."""
    name: str = Field(min_length=1, max_length=160)
    salary_structure_id: int
    period_start: date
    period_end: date
    employee_ids: list[int] = Field(min_length=1)


class MarkPaidRequest(BaseModel):
    """Mark a validated payrun paid, with a reason if warnings are forced."""
    force: bool = False
    force_paid_reason: str | None = Field(default=None, max_length=500)


# --- payrun and payslip ------------------------------------------------


class WarningOut(BaseModel):
    """One payroll warning, its severity and the transition it blocks."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    payrun_id: int
    code: WarningCode
    severity: WarningSeverity
    message: str
    employee_id: int | None = None
    employee_name: str | None = None
    payslip_id: int | None = None
    blocks: str | None = None
    # Warnings are not resolved in place: `compute` clears the payrun's
    # warnings and regenerates them, so a warning that is still stored is by
    # definition still open. The field exists because the reader needs to know
    # that, not because there is a resolution workflow behind it.
    is_resolved: bool = False


class PayslipLineOut(BaseModel):
    """One computed line on a payslip: rule, quantity, rate and amount."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    rule_code: str
    name: str
    category: RuleCategory
    sequence: int
    quantity: Decimal
    rate: Decimal | None = None
    amount: Decimal


class PayslipOut(BaseModel):
    """A full payslip with every line, as the payslip screen renders it."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    payrun_id: int
    payrun_name: str | None = None
    employee_id: int
    employee_name: str | None = None
    employee_number: str = ""
    contract_id: int | None = None
    structure_name: str | None = None
    period_start: date
    period_end: date
    currency: str

    basic: Decimal
    gross: Decimal
    total_deductions: Decimal
    net: Decimal

    period_days: int
    contract_days: int
    # The brief's B7 "Worked Days".
    payable_days: int
    unpaid_days: int
    paid_leave_days: int
    unpaid_leave_days: int
    absent_days: int
    worked_hours: Decimal
    overtime_hours: Decimal

    state: PayslipState
    lines: list[PayslipLineOut] = []
    warnings: list[WarningOut] = []


class PayslipSummaryOut(BaseModel):
    """A payslip without its lines, for lists and pickers."""
    id: int
    employee_id: int
    employee_name: str
    gross: Decimal
    total_deductions: Decimal
    net: Decimal
    payable_days: int
    state: PayslipState
    warning_count: int = 0
    # The cockpit row shows which warnings, not just how many - "2 warnings"
    # sends the reader hunting, "MISSING_BANK_DETAILS" does not. The full
    # objects still live on the payrun; these are the codes for the chips.
    warning_codes: list[WarningCode] = []


class PayrunOut(BaseModel):
    """A payrun with its totals and state."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    salary_structure_id: int
    structure_name: str | None = None
    period_start: date
    period_end: date
    currency: str
    state: PayrunState
    computed_at: datetime | None = None
    validated_at: datetime | None = None
    paid_at: datetime | None = None
    force_paid_reason: str | None = None

    payslip_count: int = 0
    total_gross: Decimal = Decimal("0.00")
    total_deductions: Decimal = Decimal("0.00")
    total_net: Decimal = Decimal("0.00")
    error_count: int = 0
    warning_count: int = 0


class PayrunDetailOut(PayrunOut):
    """A payrun plus its payslips and warnings."""
    payslips: list[PayslipSummaryOut] = []
    warnings: list[WarningOut] = []
    # Pre-counted by severity so the cockpit header needs no client reduce.
    warning_counts: dict[str, int] = {}
