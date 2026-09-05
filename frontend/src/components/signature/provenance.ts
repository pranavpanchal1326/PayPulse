/**
 * THE DERIVATION TREE
 *
 * `ProvenanceDrawer.tsx` renders a tree; this builds one from a payslip. The
 * split is deliberate — §10.3 says *any figure anywhere* is clickable and they
 * all open the same drawer, so the drawer must not know what a payslip is. A
 * dashboard KPI and a payrun total will build their own trees and hand them to
 * the same component.
 *
 * **The end condition is the product.** Every node opens into the rule that
 * produced it, its formula, and the values it actually received — and the
 * chain keeps opening until it reaches a record a human created: the contract
 * somebody signed, the leave request somebody approved, the attendance rows
 * somebody clocked. That is where provenance stops, because that is where
 * arithmetic stops and a decision begins.
 */
import type {
  Attendance, Contract, PayslipDetail, PayslipLine, SalaryRule, TimeOffRequest,
} from "@/api/contract";
import { money, type Money } from "@/api/money";

export interface ProvenanceSource {
  kind: "contract" | "leave" | "attendance" | "employee" | "rule";
  id: number;
  label: string;
  /** Where the record lives. Absent means "not routable yet". */
  href?: string;
}

export interface ProvenanceNode {
  id: string;
  label: string;
  code?: string;
  sequence?: number;
  amount: Money | null;
  /** Deductions render with a leading minus and in vermilion. */
  negative?: boolean;
  /** The rule as written (§4.5), shown in `num-mono`. */
  formula?: string | null;
  /** The values the formula actually received — not the sample context. */
  inputs?: { label: string; value: string }[];
  /** A record a human created. Its presence ends the chain. */
  source?: ProvenanceSource;
  children?: ProvenanceNode[];
}

export interface PayslipProvenanceSources {
  payslip: PayslipDetail;
  rules: SalaryRule[];
  /** Approved leave overlapping the period — what `LWP` is made of. */
  leave?: TimeOffRequest[];
  /** Rows in the period — what `OT` is made of. */
  attendances?: Attendance[];
}

const dec = (n: string | number) => Number(n).toFixed(2);

/**
 * The inputs a rule received, per code.
 *
 * Written out rather than derived, because "the input values it actually
 * received" is the sentence §10.3 turns on, and a generic `quantity × rate`
 * fallback would technically satisfy it while explaining nothing — nobody
 * looking at `1 × 30000.00` learns that BASIC is half the wage prorated over
 * 22 of 22 days.
 */
function inputsFor(
  code: string,
  payslip: PayslipDetail,
  line: PayslipLine,
  contract: Contract | null,
): { label: string; value: string }[] {
  const wage = contract?.wage ?? "0.00";
  const days = [
    { label: "contract_days", value: String(payslip.contract_days) },
    { label: "period_days", value: String(payslip.period_days) },
  ];

  switch (code) {
    case "BASIC":
      return [{ label: "contract.wage", value: wage }, ...days];
    case "HRA":
    case "DA":
      return [{ label: "rules.BASIC", value: basicOf(payslip) }];
    case "CONV":
      return days;
    case "SPECIAL":
      return [{ label: "contract.wage", value: wage }, ...days];
    case "OT":
      return [
        { label: "overtime_hours", value: dec(payslip.overtime_hours) },
        { label: "payable_days", value: dec(payslip.payable_days) },
        { label: "rules.BASIC", value: basicOf(payslip) },
      ];
    case "PF":
      return [{ label: "rules.BASIC", value: basicOf(payslip) }, { label: "cap", value: "15000.00" }];
    case "PT":
    case "TDS":
      return [{ label: "rules.GROSS", value: payslip.gross }];
    case "LWP":
      return [
        { label: "contract.wage", value: wage },
        { label: "unpaid_days", value: dec(payslip.unpaid_days) },
        { label: "period_days", value: String(payslip.period_days) },
      ];
    default:
      return [
        { label: "quantity", value: dec(line.quantity) },
        { label: "rate", value: line.rate },
      ];
  }
}

const basicOf = (payslip: PayslipDetail) => payslip.basic;

/**
 * The record behind a line.
 *
 * `LWP` is the interesting one: it is the only line whose existence is caused
 * by something a person did rather than by a rule firing, so it points at the
 * leave request and, through it, at whoever approved it. §10.3's example ends
 * exactly there — *"from: leave request #418, approved by Imran Shaikh"*.
 */
function sourceFor(
  code: string,
  contract: Contract | null,
  leave: TimeOffRequest[],
  attendances: Attendance[],
): ProvenanceSource | undefined {
  if (code === "LWP") {
    const unpaid = leave.filter((r) => !r.is_paid && r.state === "APPROVED");
    const first = unpaid[0];
    if (!first) return undefined;
    return {
      kind: "leave",
      id: first.id,
      label:
        `Leave request #${first.id} · ${first.date_from} to ${first.date_to}` +
        (first.approver_name ? ` · approved by ${first.approver_name}` : ""),
      href: `/leave/${first.id}`,
    };
  }

  if (code === "OT") {
    const overtime = attendances.filter((a) => Number(a.overtime_hours) > 0);
    if (overtime.length === 0) return undefined;
    return {
      kind: "attendance",
      id: overtime[0].id,
      label: `${overtime.length} attendance ${overtime.length === 1 ? "row" : "rows"} with overtime`,
      href: "/time",
    };
  }

  if (!contract) return undefined;
  return {
    kind: "contract",
    id: contract.id,
    label: `${contract.name} · ${contract.wage} from ${contract.date_start}`,
    href: `/contracts/${contract.id}`,
  };
}

export function buildPayslipProvenance({
  payslip,
  rules,
  leave = [],
  attendances = [],
}: PayslipProvenanceSources): ProvenanceNode {
  const contract = payslip.contract ?? null;
  const ruleByCode = new Map(rules.map((r) => [r.code, r]));

  const leafFor = (line: PayslipLine, negative: boolean): ProvenanceNode => {
    const rule = ruleByCode.get(line.rule_code);
    return {
      id: `line-${line.id}`,
      label: line.name,
      code: line.rule_code,
      sequence: line.sequence,
      amount: money(line.amount),
      negative,
      // The rule as *written*, from the structure — not a re-statement of it.
      formula:
        rule?.amount_formula ??
        (rule?.amount_type === "PERCENTAGE" && rule.percentage
          ? `${rule.percentage}% of ${rule.percentage_base_code}`
          : null),
      inputs: inputsFor(line.rule_code, payslip, line, contract),
      source: sourceFor(line.rule_code, contract, leave, attendances),
    };
  };

  const earnings = payslip.lines
    .filter((l) => l.category === "BASIC" || l.category === "ALLOWANCE")
    .sort((a, b) => a.sequence - b.sequence)
    .map((l) => leafFor(l, false));

  const deductions = payslip.lines
    .filter((l) => l.category === "DEDUCTION")
    .sort((a, b) => a.sequence - b.sequence)
    .map((l) => leafFor(l, true));

  return {
    id: `payslip-${payslip.id}`,
    label: "Net salary",
    code: "NET",
    amount: money(payslip.net),
    formula: "categories.GROSS − categories.DEDUCTION",
    inputs: [
      { label: "gross", value: payslip.gross },
      { label: "deductions", value: payslip.total_deductions },
      { label: "payable_days", value: dec(payslip.payable_days) },
    ],
    children: [
      {
        id: `gross-${payslip.id}`,
        label: "Gross salary",
        code: "GROSS",
        amount: money(payslip.gross),
        formula: "categories.BASIC + categories.ALLOWANCE",
        children: earnings,
      },
      {
        id: `deductions-${payslip.id}`,
        label: "Deductions",
        code: "DEDUCTIONS",
        amount: money(payslip.total_deductions),
        negative: true,
        children: deductions,
      },
    ],
  };
}
