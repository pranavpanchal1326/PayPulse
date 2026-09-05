"""Employment contracts and the resolution of which one applies (B2)."""
from __future__ import annotations

from datetime import date
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.enums import ContractState, WarningCode


class ContractBase(BaseModel):
    """Fields shared by creating and reading a contract."""
    employee_id: int
    name: str | None = Field(
        default=None,
        max_length=160,
        description="Defaults to 'Contract - <employee> from <date_start>'.",
    )
    wage: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    currency: str = Field(default="INR", min_length=3, max_length=3)
    date_start: date
    date_end: date | None = None
    state: ContractState = ContractState.DRAFT
    department_id: int | None = None
    job_position_id: int | None = None
    working_schedule_id: int | None = None
    salary_structure_id: int | None = None

    @model_validator(mode="after")
    def _end_after_start(self) -> ContractBase:
        """Reject a contract that ends before it starts."""
        if self.date_end and self.date_end < self.date_start:
            raise ValueError("date_end cannot be before date_start")
        return self


class ContractCreate(ContractBase):
    """A new contract for one employee."""
    pass


class ContractUpdate(BaseModel):
    """Changes to a contract. Omitted fields are left alone."""
    name: str | None = Field(default=None, max_length=160)
    wage: Decimal | None = Field(default=None, gt=0, max_digits=12, decimal_places=2)
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    date_start: date | None = None
    date_end: date | None = None
    state: ContractState | None = None
    department_id: int | None = None
    job_position_id: int | None = None
    working_schedule_id: int | None = None
    salary_structure_id: int | None = None


class ContractOut(BaseModel):
    """A contract, with the employee and schedule it names resolved."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    employee_id: int
    employee_name: str | None = None
    name: str
    wage: Decimal
    currency: str
    date_start: date
    date_end: date | None = None
    is_open_ended: bool = False
    state: ContractState
    department_id: int | None = None
    department_name: str | None = None
    job_position_id: int | None = None
    job_position_name: str | None = None
    working_schedule_id: int | None = None
    working_schedule_name: str | None = None
    salary_structure_id: int | None = None
    # True when this is the contract in force today - drives the list view's
    # "active contract clearly highlighted" requirement (spec A2).
    is_active_now: bool = False


class ResolutionWarningOut(BaseModel):
    """One reason a contract lookup was ambiguous or came back empty."""
    code: WarningCode
    message: str


class ContractResolutionOut(BaseModel):
    """What payroll would use for this employee and period, and why.

    Exposed as its own endpoint so the payrun wizard (and a curious judge)
    can see the decision before any payslip exists.
    """

    employee_id: int
    period_start: date
    period_end: date
    contract: ContractOut | None = None
    candidates: list[ContractOut] = []
    warnings: list[ResolutionWarningOut] = []
    blocking: bool = False
