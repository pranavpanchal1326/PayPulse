"""Payroll seed: the salary structure, its rules, and historical payruns.

Split out of seed.py to keep each file readable.

The rule set is PRD section 4.5. Two things about it are deliberate:

  BASIC is 50% of the prorated wage, not the whole wage. PRD v1 made it the
  entire wage, which left SPECIAL evaluating to zero for every employee and
  GROSS at 1.6x the contracted amount.

  SPECIAL reads `categories.ALLOWANCE` rather than naming HRA, DA and CONV
  individually, so deleting an allowance rule - which the brief requires be
  possible, and which the demo does - cannot break it.

Historical payruns matter as much as the rules: spec B9 wants a Monthly Net
Salary Trend "using historical data", and an empty chart on stage reads as
a bug (PRD risk 4).
"""
from __future__ import annotations

import logging
from calendar import monthrange
from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.enums import (
    AmountType,
    ConditionType,
    ContractState,
    RuleCategory,
)
from app.models.contract import Contract
from app.models.employee import Employee
from app.models.payroll import Payrun
from app.models.salary import SalaryRule, SalaryStructure
from app.services import payrun_service

logger = logging.getLogger("seed")

STRUCTURE_CODE = "REGULAR"
STRUCTURE_NAME = "Regular Salary"

# (seq, code, name, category, amount_type, spec)
# `spec` is the fixed amount, (percentage, base_code), or a formula.
RULES: list[tuple] = [
    (
        10, "BASIC", "Basic Salary", RuleCategory.BASIC, AmountType.FORMULA,
        "round(contract.wage * 0.5 * contract_days / period_days, 2)",
    ),
    (
        20, "HRA", "House Rent Allowance", RuleCategory.ALLOWANCE,
        AmountType.PERCENTAGE, (Decimal("40"), "BASIC"),
    ),
    (
        30, "DA", "Dearness Allowance", RuleCategory.ALLOWANCE,
        AmountType.PERCENTAGE, (Decimal("20"), "BASIC"),
    ),
    (
        40, "CONV", "Conveyance Allowance", RuleCategory.ALLOWANCE,
        AmountType.FORMULA, "1600 * contract_days / period_days",
    ),
    (
        50, "SPECIAL", "Special Allowance", RuleCategory.ALLOWANCE,
        AmountType.FORMULA,
        "max(0, contract.wage * contract_days / period_days "
        "- rules.BASIC - categories.ALLOWANCE)",
    ),
    (
        60, "OT", "Overtime", RuleCategory.ALLOWANCE, AmountType.FORMULA,
        "overtime_hours * (rules.BASIC / (payable_days * "
        "contract.daily_hours)) * 1.5",
    ),
    (
        100, "GROSS", "Gross Salary", RuleCategory.GROSS, AmountType.FORMULA,
        "categories.BASIC + categories.ALLOWANCE",
    ),
    (
        110, "PF", "Provident Fund", RuleCategory.DEDUCTION, AmountType.FORMULA,
        "min(rules.BASIC + rules.DA, 15000) * 0.12",
    ),
    (
        120, "PT", "Professional Tax", RuleCategory.DEDUCTION, AmountType.FORMULA,
        "200 if rules.GROSS > 21000 else 0",
    ),
    (
        130, "TDS", "Income Tax (simplified)", RuleCategory.DEDUCTION,
        AmountType.FORMULA,
        "max(0, (rules.GROSS * 12 - 500000) * 0.05 / 12)",
    ),
    (
        140, "LWP", "Unpaid Leave / Absence", RuleCategory.DEDUCTION,
        AmountType.FORMULA, "contract.wage / period_days * unpaid_days",
    ),
    (
        200, "NET", "Net Salary", RuleCategory.NET, AmountType.FORMULA,
        "categories.GROSS - categories.DEDUCTION",
    ),
]


def seed_structure(db: Session) -> SalaryStructure:
    structure = db.scalar(
        select(SalaryStructure).where(SalaryStructure.code == STRUCTURE_CODE)
    )
    if structure is None:
        structure = SalaryStructure(code=STRUCTURE_CODE)
        db.add(structure)
    structure.name = STRUCTURE_NAME
    structure.description = (
        "Indian payroll: basic, allowances, statutory deductions, and a "
        "net that builds on the running category totals."
    )
    structure.currency = "INR"
    structure.is_active = True
    db.flush()

    for sequence, code, name, category, amount_type, spec in RULES:
        rule = db.scalar(
            select(SalaryRule).where(
                SalaryRule.structure_id == structure.id, SalaryRule.code == code
            )
        )
        if rule is None:
            rule = SalaryRule(structure_id=structure.id, code=code)
            db.add(rule)
        rule.name = name
        rule.category = category
        rule.sequence = sequence
        rule.amount_type = amount_type
        rule.condition_type = ConditionType.ALWAYS
        rule.appears_on_payslip = True
        rule.is_active = True
        rule.amount_fixed = rule.percentage = rule.percentage_base_code = None
        rule.amount_formula = None

        if amount_type is AmountType.FIXED:
            rule.amount_fixed = spec
        elif amount_type is AmountType.PERCENTAGE:
            rule.percentage, rule.percentage_base_code = spec
        else:
            rule.amount_formula = spec

    db.flush()

    # Every contract points at the structure, so the payrun wizard has
    # something to select and employee_count is non-zero.
    for contract in db.scalars(
        select(Contract).where(Contract.state == ContractState.RUNNING)
    ):
        contract.salary_structure_id = structure.id
    db.flush()

    logger.info("  salary rules       %d in %s", len(RULES), STRUCTURE_NAME)
    return structure


def _month_bounds(anchor: date, months_back: int) -> tuple[date, date]:
    """First and last day of the month `months_back` before `anchor`."""
    year, month = anchor.year, anchor.month - months_back
    while month <= 0:
        month += 12
        year -= 1
    return date(year, month, 1), date(
        year, month, monthrange(year, month)[1]
    )


def seed_payruns(db: Session, structure: SalaryStructure, months: int = 6) -> None:
    """Historical payruns so the trend chart has real data (spec B9).

    Earlier months are computed, validated and marked paid; the most recent
    month is left DRAFT so the demo has a live batch to drive through
    compute -> validate -> mark paid on stage.
    """
    today = date.today()
    employees = list(db.scalars(select(Employee).order_by(Employee.id)))
    employee_ids = [
        e.id
        for e in employees
        if any(c.state is ContractState.RUNNING for c in e.contracts)
    ]
    if not employee_ids:
        logger.info("  payruns            skipped (no running contracts)")
        return

    created = paid = 0
    for months_back in range(months, 0, -1):
        start, end = _month_bounds(today, months_back)
        if db.scalar(select(Payrun.id).where(Payrun.period_start == start)):
            continue

        payrun = payrun_service.create(
            db, f"{start:%B %Y} Payroll", structure, start, end, employee_ids
        )
        payrun_service.compute(db, payrun)
        created += 1

        if months_back == 1:
            continue  # leave the latest month DRAFT for the demo

        try:
            payrun_service.validate(db, payrun)
            payrun_service.mark_paid(
                db,
                payrun,
                user_id=None,
                force=True,
                reason="Historical batch seeded for the trend chart",
            )
            paid += 1
        except Exception as exc:
            # A month with a blocking warning stays COMPUTED rather than
            # being forced into a state the engine does not agree with.
            logger.info("  payrun %s left computed: %s", start, exc)

    db.flush()
    logger.info(
        "  payruns            %d created, %d paid, latest left DRAFT "
        "(%d employees each)",
        created,
        paid,
        len(employee_ids),
    )
