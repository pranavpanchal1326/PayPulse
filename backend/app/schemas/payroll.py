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
    structure_id: int


class SalaryRuleUpdate(BaseModel):
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
    """Drag-to-reorder (spec A5): ids in their new evaluation order."""

    rule_ids: list[int] = Field(min_length=1)


class FormulaCheckRequest(BaseModel):
    expression: str
    # Optional sample context so the author sees a real number, not just
    # "valid".
    wage: Decimal = Decimal("50000.00")
    period_days: int = 22
    contract_days: int = 22


class FormulaCheckResponse(BaseModel):
    valid: bool
    error: str | None = None
    sample_result: Decimal | None = None
    references: list[str] = []


# --- structures (spec A5) ----------------------------------------------


class SalaryStructureCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    code: str = Field(pattern=r"^[A-Z][A-Z0-9_]{1,19}$")
    description: str | None = None
    currency: str = Field(default="INR", min_length=3, max_length=3)


class SalaryStructureUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = None
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    is_active: bool | None = None


class SalaryStructureOut(BaseModel):
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
    salary_structure_id: int
    period_start: date
    period_end: date
    department_id: int | None = None
    employee_type: EmployeeType | None = None


class EligibilityOut(BaseModel):
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
    name: str = Field(min_length=1, max_length=160)
    salary_structure_id: int
    period_start: date
    period_end: date
    employee_ids: list[int] = Field(min_length=1)


class MarkPaidRequest(BaseModel):
    force: bool = False
    force_paid_reason: str | None = Field(default=None, max_length=500)


# --- payrun and payslip ------------------------------------------------


class WarningOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: WarningCode
    severity: WarningSeverity
    message: str
    employee_id: int | None = None
    payslip_id: int | None = None
    blocks: str | None = None


class PayslipLineOut(BaseModel):
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
    model_config = ConfigDict(from_attributes=True)

    id: int
    payrun_id: int
    payrun_name: str | None = None
    employee_id: int
    employee_name: str | None = None
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
    id: int
    employee_id: int
    employee_name: str
    gross: Decimal
    total_deductions: Decimal
    net: Decimal
    payable_days: int
    state: PayslipState
    warning_count: int = 0


class PayrunOut(BaseModel):
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
    payslips: list[PayslipSummaryOut] = []
    warnings: list[WarningOut] = []
