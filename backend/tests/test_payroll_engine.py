"""The payroll engine (spec A6, PRD sections 4.3-4.6).

Two tests here exist specifically to pin the defects PRD v1 shipped, and
they were written before the engine was wired to anything:

  - test_lwp_charged_once: v1 prorated BASIC by unpaid leave AND deducted
    the same days again as LWP, so unpaid leave was charged twice and every
    percentage rule downstream inherited the error.
  - test_special_allowance_nonzero: v1 made BASIC the entire wage, so
    SPECIAL was max(0, w - w - 0.4w - 0.2w - 1600) = 0 for every employee,
    and GROSS came out at 1.6x the contracted wage.

All pure - fake rules and a fake basis, no database.
"""
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

import pytest

from app.core.enums import AmountType, ConditionType, RuleCategory
from app.services import time_basis
from app.services.payroll_engine import compute_lines, money, totals


@dataclass
class Rule:
    code: str
    name: str
    category: RuleCategory
    sequence: int
    amount_formula: str | None = None
    amount_type: AmountType = AmountType.FORMULA
    amount_fixed: Decimal | None = None
    percentage: Decimal | None = None
    percentage_base_code: str | None = None
    condition_type: ConditionType = ConditionType.ALWAYS
    condition_expr: str | None = None
    appears_on_payslip: bool = True
    is_active: bool = True


@dataclass
class Schedule:
    hours_per_week: Decimal = Decimal("40.00")


@dataclass
class Contract:
    wage: Decimal = Decimal("50000.00")
    working_schedule: Schedule = field(default_factory=Schedule)


@dataclass
class Dept:
    name: str = "Engineering"


@dataclass
class EmpType:
    value: str = "FULL_TIME"


@dataclass
class Employee:
    id: int = 1
    employee_type: EmpType = field(default_factory=EmpType)
    department: Dept = field(default_factory=Dept)


def basis(
    period_days=22, contract_days=22, unpaid_days=0, overtime_hours="0", **kw
):
    return time_basis.PayBasis(
        period_start=date(2026, 3, 1),
        period_end=date(2026, 3, 31),
        period_days=period_days,
        contract_days=contract_days,
        payable_days=contract_days - unpaid_days,
        unpaid_days=unpaid_days,
        paid_leave_days=kw.get("paid_leave_days", 0),
        unpaid_leave_days=kw.get("unpaid_leave_days", unpaid_days),
        absent_days=kw.get("absent_days", 0),
        worked_hours=Decimal(kw.get("worked_hours", "176")),
        overtime_hours=Decimal(overtime_hours),
        missing_checkouts=0,
        daily_hours=Decimal(kw.get("daily_hours", "8")),
        absence_policy="TREAT_AS_UNPAID",
    )


def seeded_rules():
    """The PRD section 4.5 rule set - the one the seed will carry."""
    return [
        Rule(
            "BASIC", "Basic Salary", RuleCategory.BASIC, 10,
            "round(contract.wage * 0.5 * contract_days / period_days, 2)",
        ),
        Rule(
            "HRA", "House Rent Allowance", RuleCategory.ALLOWANCE, 20,
            amount_type=AmountType.PERCENTAGE,
            percentage=Decimal("40"), percentage_base_code="BASIC",
        ),
        Rule(
            "DA", "Dearness Allowance", RuleCategory.ALLOWANCE, 30,
            amount_type=AmountType.PERCENTAGE,
            percentage=Decimal("20"), percentage_base_code="BASIC",
        ),
        Rule(
            "CONV", "Conveyance", RuleCategory.ALLOWANCE, 40,
            "1600 * contract_days / period_days",
        ),
        Rule(
            "SPECIAL", "Special Allowance", RuleCategory.ALLOWANCE, 50,
            # Reads the running ALLOWANCE total rather than naming each
            # rule, so deleting an allowance cannot break this formula.
            "max(0, contract.wage * contract_days / period_days "
            "- rules.BASIC - categories.ALLOWANCE)",
        ),
        Rule(
            "OT", "Overtime", RuleCategory.ALLOWANCE, 60,
            "overtime_hours * (rules.BASIC / (payable_days * "
            "contract.daily_hours)) * 1.5",
        ),
        Rule(
            "GROSS", "Gross Salary", RuleCategory.GROSS, 100,
            "categories.BASIC + categories.ALLOWANCE",
        ),
        Rule(
            "PF", "Provident Fund", RuleCategory.DEDUCTION, 110,
            "min(rules.BASIC + rules.DA, 15000) * 0.12",
        ),
        Rule(
            "PT", "Professional Tax", RuleCategory.DEDUCTION, 120,
            "200 if rules.GROSS > 21000 else 0",
        ),
        Rule(
            "TDS", "Income Tax (simplified)", RuleCategory.DEDUCTION, 130,
            "max(0, (rules.GROSS * 12 - 500000) * 0.05 / 12)",
        ),
        Rule(
            "LWP", "Unpaid Leave / Absence", RuleCategory.DEDUCTION, 140,
            "contract.wage / period_days * unpaid_days",
        ),
        Rule(
            "NET", "Net Salary", RuleCategory.NET, 200,
            "categories.GROSS - categories.DEDUCTION",
        ),
    ]


def run(rules=None, employee=None, contract=None, pay_basis=None):
    lines, warnings = compute_lines(
        rules if rules is not None else seeded_rules(),
        employee or Employee(),
        contract or Contract(),
        pay_basis or basis(),
    )
    return {line.rule_code: line.amount for line in lines}, lines, warnings


class TestSeededRuleSet:
    """A full month, no exceptions: wage 50,000 over 22 days."""

    def test_basic_is_half_the_wage(self):
        amounts, _, _ = run()
        assert amounts["BASIC"] == Decimal("25000.00")

    def test_percentage_rules_read_the_earlier_result(self):
        amounts, _, _ = run()
        assert amounts["HRA"] == Decimal("10000.00")  # 40% of BASIC
        assert amounts["DA"] == Decimal("5000.00")  # 20% of BASIC

    def test_special_allowance_nonzero(self):
        """v1 produced 0 here for every employee, always."""
        amounts, _, _ = run()
        assert amounts["SPECIAL"] > 0
        # 50,000 - 25,000 - 10,000 - 5,000 - 1,600
        assert amounts["SPECIAL"] == Decimal("8400.00")

    def test_gross_matches_the_contracted_wage(self):
        """v1 gave 1.6x the wage - 81,600 on a 50,000 contract."""
        amounts, _, _ = run()
        assert amounts["GROSS"] == Decimal("50000.00")

    def test_pf_is_capped(self):
        amounts, _, _ = run()
        # min(25,000 + 5,000, 15,000) * 0.12
        assert amounts["PF"] == Decimal("1800.00")

    def test_conditional_rule_fires(self):
        amounts, _, _ = run()
        assert amounts["PT"] == Decimal("200.00")

    def test_no_warnings_on_a_clean_month(self):
        _, _, warnings = run()
        assert warnings == []


class TestLwpChargedOnce:
    """v1's E1: unpaid leave was deducted twice."""

    def test_basic_is_not_reduced_by_unpaid_leave(self):
        # BASIC prorates on contract_days only - never on unpaid days.
        full = run()[0]
        with_lwp = run(pay_basis=basis(unpaid_days=2))[0]
        assert with_lwp["BASIC"] == full["BASIC"] == Decimal("25000.00")

    def test_lwp_line_charges_exactly_one_day_per_unpaid_day(self):
        amounts, _, _ = run(pay_basis=basis(unpaid_days=2))
        # 50,000 / 22 * 2
        assert amounts["LWP"] == Decimal("4545.45")

    def test_net_drops_by_exactly_the_lwp_amount(self):
        clean = run()[0]
        with_lwp = run(pay_basis=basis(unpaid_days=2))[0]
        drop = clean["NET"] - with_lwp["NET"]
        assert drop == with_lwp["LWP"]

    def test_a_single_unpaid_day_costs_one_day_of_wage(self):
        amounts, _, _ = run(pay_basis=basis(unpaid_days=1))
        assert amounts["LWP"] == Decimal("2272.73")

    def test_no_unpaid_days_means_no_deduction(self):
        amounts, _, _ = run()
        assert amounts["LWP"] == Decimal("0.00")


class TestProration:
    """A joiner or leaver is paid a fraction, not a full month."""

    def test_half_month_halves_the_earnings(self):
        amounts, _, _ = run(pay_basis=basis(contract_days=11))
        assert amounts["BASIC"] == Decimal("12500.00")
        assert amounts["GROSS"] == Decimal("25000.00")

    def test_conveyance_prorates_too(self):
        amounts, _, _ = run(pay_basis=basis(contract_days=11))
        assert amounts["CONV"] == Decimal("800.00")

    def test_full_period_is_not_prorated(self):
        amounts, _, _ = run()
        assert amounts["CONV"] == Decimal("1600.00")


class TestOvertime:
    def test_overtime_uses_the_schedule_not_a_hardcoded_eight(self):
        amounts, _, _ = run(pay_basis=basis(overtime_hours="6"))
        # 6 * (25,000 / (22 * 8)) * 1.5
        assert amounts["OT"] == Decimal("1278.41")

    def test_part_time_schedule_gets_a_higher_hourly_rate(self):
        # v1 divided by a hardcoded 8, which was wrong for every non-8h day.
        amounts, _, _ = run(
            pay_basis=basis(overtime_hours="6", daily_hours="4")
        )
        assert amounts["OT"] == Decimal("2556.82")

    def test_no_overtime_is_zero(self):
        amounts, _, _ = run()
        assert amounts["OT"] == Decimal("0.00")


class TestOrderedEvaluation:
    """The brief's fourth hard part."""

    def test_a_rule_can_reference_an_earlier_result(self):
        amounts, _, _ = run()
        assert amounts["HRA"] == amounts["BASIC"] * Decimal("0.4")

    def test_a_rule_can_reference_a_running_category_total(self):
        amounts, _, _ = run()
        earnings = sum(
            amounts[code] for code in ("BASIC", "HRA", "DA", "CONV", "SPECIAL", "OT")
        )
        assert amounts["GROSS"] == earnings

    def test_forward_reference_fails_the_line_not_the_payrun(self):
        rules = seeded_rules()
        rules.append(
            Rule("EARLY", "Too early", RuleCategory.ALLOWANCE, 5, "rules.BASIC * 2")
        )
        amounts, _, warnings = run(rules=rules)
        assert amounts["EARLY"] == Decimal("0.00")
        assert any(w.code.value == "RULE_EVAL_FAILED" for w in warnings)
        # The rest of the payslip still computed.
        assert amounts["NET"] > 0

    def test_reordering_changes_the_result(self):
        # An isolated set: the seeded rules are interdependent by design, so
        # a minimal one shows the sequencing effect on its own.
        def small(total_sequence):
            return [
                Rule("A", "A", RuleCategory.ALLOWANCE, 10, "100"),
                Rule("B", "B", RuleCategory.ALLOWANCE, 20, "rules.A * 2"),
                Rule(
                    "TOTAL", "Total", RuleCategory.GROSS, total_sequence,
                    "categories.ALLOWANCE",
                ),
            ]

        after = run(rules=small(30))[0]
        before = run(rules=small(15))[0]
        assert after["TOTAL"] == Decimal("300.00")  # sees A and B
        assert before["TOTAL"] == Decimal("100.00")  # sees only A

    def test_an_inactive_rule_is_skipped_entirely(self):
        rules = seeded_rules()
        next(r for r in rules if r.code == "CONV").is_active = False
        amounts, _, _ = run(rules=rules)
        assert "CONV" not in amounts

    def test_deleting_a_rule_shifts_the_balancing_figure(self):
        # Deleting CONV must not change GROSS - SPECIAL absorbs it. This is
        # the demo beat: delete a rule, recompute, watch the payslip change.
        rules = [r for r in seeded_rules() if r.code != "CONV"]
        amounts, _, _ = run(rules=rules)
        assert amounts["SPECIAL"] == Decimal("10000.00")
        assert amounts["GROSS"] == Decimal("50000.00")


class TestReconciliation:
    """PRD section 4.6: sum(lines) == net, exactly."""

    @pytest.mark.parametrize(
        "kwargs",
        [
            {},
            {"unpaid_days": 2},
            {"contract_days": 11},
            {"overtime_hours": "7.5"},
            {"contract_days": 13, "unpaid_days": 3, "overtime_hours": "2.25"},
        ],
    )
    def test_totals_reconcile(self, kwargs):
        amounts, lines, _ = run(pay_basis=basis(**kwargs))
        basic, gross, deductions, net = totals(lines)
        assert gross - deductions == net
        assert net == amounts["NET"], "the NET rule must agree with the totals"

    def test_gross_is_the_sum_of_earning_lines(self):
        _, lines, _ = run()
        _, gross, _, _ = totals(lines)
        earnings = sum(
            line.amount
            for line in lines
            if line.category in (RuleCategory.BASIC, RuleCategory.ALLOWANCE)
        )
        assert gross == earnings

    def test_every_amount_is_two_decimal_places(self):
        _, lines, _ = run(pay_basis=basis(overtime_hours="3.33"))
        for line in lines:
            assert line.amount == line.amount.quantize(Decimal("0.01"))

    def test_money_rounds_half_up(self):
        assert money(Decimal("0.125")) == Decimal("0.13")
        assert money(Decimal("2.345")) == Decimal("2.35")


class TestPayBasisInvariants:
    def test_payable_plus_unpaid_must_equal_contract_days(self):
        with pytest.raises(ValueError, match="payable_days"):
            time_basis.PayBasis(
                period_start=date(2026, 3, 1),
                period_end=date(2026, 3, 31),
                period_days=22,
                contract_days=22,
                payable_days=22,
                unpaid_days=2,  # 22 + 2 != 22
                paid_leave_days=0,
                unpaid_leave_days=2,
                absent_days=0,
                worked_hours=Decimal("0"),
                overtime_hours=Decimal("0"),
                missing_checkouts=0,
                daily_hours=Decimal("8"),
                absence_policy="TREAT_AS_UNPAID",
            )

    def test_contract_days_may_not_exceed_period_days(self):
        with pytest.raises(ValueError, match="contract_days"):
            basis(period_days=20, contract_days=22)

    def test_context_exposes_worked_days_as_an_alias(self):
        context = basis(unpaid_days=2).as_context()
        assert context["worked_days"] == context["payable_days"] == 20
