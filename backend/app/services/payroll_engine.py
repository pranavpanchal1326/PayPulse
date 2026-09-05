"""The payroll engine (spec A6, B7; PRD section 4.3).

Rules evaluate in ascending `sequence`. After each one, two assignments make
the brief's "complex totals build upon earlier calculations" true:

    rules[code]         = amount   -> a later rule can reference it
    categories[cat]    += amount   -> running totals per category

Those two lines are the whole feature. SPECIAL references BASIC, HRA, DA and
CONV; GROSS sums two categories; NET subtracts one from another. All of it
falls out of ordered evaluation over a mutable context.

Every line rounds HALF_UP to 2dp *at line level*, and the category totals
accumulate already-rounded amounts, so `sum(lines) == net` exactly. PRD
section 4.6 requires that invariant; a payslip that does not reconcile is
the one thing a payslip may never do.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy.orm import Session

from app.core.enums import AmountType, ConditionType, RuleCategory, WarningCode
from app.services import contract_resolver, formula, time_basis
from app.services.contract_resolver import ResolvedWarning

_CENTS = Decimal("0.01")

EARNING_CATEGORIES = (RuleCategory.BASIC, RuleCategory.ALLOWANCE)


def money(value: Decimal) -> Decimal:
    return Decimal(value).quantize(_CENTS, rounding=ROUND_HALF_UP)


@dataclass
class ComputedLine:
    """One payslip line, before it is persisted."""

    rule_code: str
    name: str
    category: RuleCategory
    sequence: int
    amount: Decimal
    quantity: Decimal = Decimal("1.00")
    rate: Decimal | None = None
    appears_on_payslip: bool = True


@dataclass
class ComputedPayslip:
    """The result of computing one employee for one period."""

    employee_id: int
    contract_id: int | None
    period_start: date
    period_end: date
    currency: str = "INR"

    lines: list[ComputedLine] = field(default_factory=list)
    warnings: list[ResolvedWarning] = field(default_factory=list)
    basis: time_basis.PayBasis | None = None

    basic: Decimal = Decimal("0.00")
    gross: Decimal = Decimal("0.00")
    total_deductions: Decimal = Decimal("0.00")
    net: Decimal = Decimal("0.00")

    @property
    def visible_lines(self) -> list[ComputedLine]:
        return [line for line in self.lines if line.appears_on_payslip]


def build_context(employee, contract, basis: time_basis.PayBasis) -> dict:
    """The evaluation context handed to every formula (PRD section 4.3)."""

    class _Namespace:
        """Attribute access over a dict, so `contract.wage` reads naturally.

        The sandbox only permits attributes on allowlisted namespaces, so
        this cannot be walked into anything dangerous.
        """

        def __init__(self, values: dict):
            self.__dict__.update(values)

        def __getattr__(self, name):
            raise formula.FormulaError(
                f"{name!r} is not available on this object."
            )

    contract_ns = _Namespace(
        {
            "wage": Decimal(contract.wage) if contract else Decimal("0.00"),
            "daily_hours": basis.daily_hours,
            "hours_per_week": (
                contract.working_schedule.hours_per_week
                if contract is not None and contract.working_schedule is not None
                else Decimal("0.00")
            ),
        }
    )
    employee_ns = _Namespace(
        {
            "employee_type": (
                employee.employee_type.value if employee.employee_type else ""
            ),
            "department": (
                employee.department.name if employee.department else ""
            ),
        }
    )

    return {
        "contract": contract_ns,
        "employee": employee_ns,
        **basis.as_context(),
    }


def _rule_amount(rule, context: dict) -> tuple[Decimal, Decimal | None]:
    """Evaluate one rule to (amount, rate). Rate is shown on the payslip."""
    if rule.amount_type is AmountType.FIXED:
        return Decimal(rule.amount_fixed or 0), None

    if rule.amount_type is AmountType.PERCENTAGE:
        base_code = rule.percentage_base_code
        rules_ns = context["rules"]
        if base_code not in rules_ns.__dict__:
            raise formula.FormulaError(
                f"{rule.code} is a percentage of {base_code!r}, which has not "
                "been computed yet. Check the rule sequence."
            )
        base = Decimal(rules_ns.__dict__[base_code])
        pct = Decimal(rule.percentage or 0)
        return base * pct / Decimal(100), pct

    return formula.evaluate(rule.amount_formula or "0", context), None


class _Mutable:
    """A namespace whose contents grow as rules are evaluated."""

    def __init__(self, values: dict | None = None):
        self.__dict__.update(values or {})

    def __getattr__(self, name):
        raise formula.FormulaError(
            f"{name!r} has not been computed yet. Rules can only reference "
            "codes with a lower sequence."
        )


def compute_lines(
    rules, employee, contract, basis: time_basis.PayBasis
) -> tuple[list[ComputedLine], list[ResolvedWarning]]:
    """Evaluate an ordered rule set. The heart of spec A6."""
    context = build_context(employee, contract, basis)
    rules_ns = _Mutable()
    categories = _Mutable(
        {category.value: Decimal("0.00") for category in RuleCategory}
    )
    context["rules"] = rules_ns
    context["categories"] = categories

    lines: list[ComputedLine] = []
    warnings: list[ResolvedWarning] = []

    for rule in sorted(rules, key=lambda r: r.sequence):
        if not rule.is_active:
            continue
        try:
            if rule.condition_type is ConditionType.EXPRESSION:
                if not formula.evaluate_condition(rule.condition_expr, context):
                    continue
            amount, rate = _rule_amount(rule, context)
            amount = money(amount)
        except formula.FormulaError as exc:
            # One bad formula must never kill a whole payrun: the line
            # records zero and the payslip carries the reason.
            warnings.append(
                ResolvedWarning(
                    WarningCode.RULE_EVAL_FAILED,
                    f"Rule {rule.code} failed: {exc}",
                )
            )
            amount, rate = Decimal("0.00"), None

        lines.append(
            ComputedLine(
                rule_code=rule.code,
                name=rule.name,
                category=rule.category,
                sequence=rule.sequence,
                amount=amount,
                rate=rate,
                appears_on_payslip=rule.appears_on_payslip,
            )
        )

        # The two assignments that make ordered evaluation meaningful.
        rules_ns.__dict__[rule.code] = amount
        categories.__dict__[rule.category.value] += amount

    return lines, warnings


def totals(lines: list[ComputedLine]) -> tuple[Decimal, Decimal, Decimal, Decimal]:
    """(basic, gross, deductions, net), summed from already-rounded lines."""
    basic = sum(
        (line.amount for line in lines if line.category is RuleCategory.BASIC),
        Decimal("0.00"),
    )
    gross = sum(
        (line.amount for line in lines if line.category in EARNING_CATEGORIES),
        Decimal("0.00"),
    )
    deductions = sum(
        (line.amount for line in lines if line.category is RuleCategory.DEDUCTION),
        Decimal("0.00"),
    )
    return money(basic), money(gross), money(deductions), money(gross - deductions)


def compute(
    db: Session,
    employee,
    structure,
    period_start: date,
    period_end: date,
    holidays: frozenset[date] | None = None,
) -> ComputedPayslip:
    """Compute one employee's payslip. The engine's entry point."""
    result = ComputedPayslip(
        employee_id=employee.id,
        contract_id=None,
        period_start=period_start,
        period_end=period_end,
        currency=structure.currency if structure else "INR",
    )

    # 1. Resolve the applicable contract (spec A2).
    resolution = contract_resolver.resolve(
        db, employee.id, period_start, period_end
    )
    result.warnings.extend(resolution.warnings)
    if resolution.contract is None:
        return result
    result.contract_id = resolution.contract.id
    result.currency = resolution.contract.currency

    active = [r for r in structure.rules if r.is_active] if structure else []
    if not active:
        result.warnings.append(
            ResolvedWarning(
                WarningCode.NO_STRUCTURE_RULES,
                "This salary structure has no active rules, so nothing can "
                "be computed.",
            )
        )
        return result

    # 2. The pay basis (PRD section 4.2).
    basis = time_basis.build(
        db, employee, resolution.contract, period_start, period_end, holidays
    )
    result.basis = basis

    if basis.missing_checkouts:
        result.warnings.append(
            ResolvedWarning(
                WarningCode.MISSING_CHECKOUT,
                f"{basis.missing_checkouts} attendance record(s) in this "
                "period have no check-out, so their hours count as zero.",
            )
        )
    if basis.contract_days and basis.absent_days > basis.contract_days * 0.3:
        result.warnings.append(
            ResolvedWarning(
                WarningCode.HIGH_ABSENCE,
                f"{basis.absent_days} of {basis.contract_days} scheduled days "
                "have no attendance record and no approved leave.",
            )
        )

    # 3-4. Evaluate rules in sequence.
    lines, rule_warnings = compute_lines(
        active, employee, resolution.contract, basis
    )
    result.lines = lines
    result.warnings.extend(rule_warnings)

    # 5. Finalize and assert reconciliation.
    result.basic, result.gross, result.total_deductions, result.net = totals(lines)

    net_line = next(
        (line for line in lines if line.category is RuleCategory.NET), None
    )
    if net_line is not None and net_line.amount != result.net:
        result.warnings.append(
            ResolvedWarning(
                WarningCode.PAYSLIP_NOT_RECONCILED,
                f"The NET rule produced {net_line.amount} but gross minus "
                f"deductions is {result.net}. The rule set does not balance.",
            )
        )
    if result.net < 0:
        result.warnings.append(
            ResolvedWarning(
                WarningCode.NEGATIVE_NET,
                f"Net pay is {result.net}. Deductions exceed gross.",
            )
        )

    return result
