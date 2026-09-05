/**
 * THE SALARY STRUCTURE — one structure, twelve rules, PRD §4.5 verbatim.
 *
 * The `amount_formula` strings are the real ones: they are what the rule
 * editor (P9) renders, what the formula sandbox validates, and what the
 * backend will evaluate. They are **not** what the mock evaluates — see
 * `engine.ts`, which reimplements these twelve by hand rather than shipping a
 * parser the product does not need on the client.
 *
 * That split is deliberate and has one rule attached to it: **if a formula
 * string changes here, the matching branch in `engine.ts` changes with it.**
 * The alternative — a second, drifting definition of how pay is computed — is
 * exactly what §4.5 exists to stop.
 */
import type { SalaryRule, SalaryStructure } from "@/api/contract";
import { CURRENCY } from "./anchor";
import { STRUCTURE_ID } from "./contracts";

type RuleSpec = Omit<SalaryRule, "id" | "structure_id">;

const formula = (
  code: string,
  name: string,
  category: SalaryRule["category"],
  sequence: number,
  expr: string,
  condition?: string,
): RuleSpec => ({
  code,
  name,
  category,
  sequence,
  condition_type: condition ? "EXPRESSION" : "ALWAYS",
  condition_expr: condition ?? null,
  amount_type: "FORMULA",
  amount_fixed: null,
  percentage: null,
  percentage_base_code: null,
  amount_formula: expr,
  appears_on_payslip: true,
  is_active: true,
});

const percentage = (
  code: string,
  name: string,
  category: SalaryRule["category"],
  sequence: number,
  pct: number,
  base: string,
): RuleSpec => ({
  code,
  name,
  category,
  sequence,
  condition_type: "ALWAYS",
  condition_expr: null,
  amount_type: "PERCENTAGE",
  amount_fixed: null,
  percentage: pct.toFixed(2),
  percentage_base_code: base,
  amount_formula: null,
  appears_on_payslip: true,
  is_active: true,
});

/**
 * Ordered by `sequence`, and the order is the whole mechanism: `SPECIAL`,
 * `OT`, `PF`, `PT`, `TDS` and `NET` all back-reference earlier results, which
 * is the brief's *"rules are processed in a specific sequence to ensure
 * dependencies are respected"* made visible on the payslip.
 */
const RULE_SPECS: RuleSpec[] = [
  formula("BASIC", "Basic Salary", "BASIC", 10,
    "round(contract.wage * 0.5 * contract_days / period_days, 2)"),

  percentage("HRA", "House Rent Allowance", "ALLOWANCE", 20, 40, "BASIC"),
  percentage("DA", "Dearness Allowance", "ALLOWANCE", 30, 20, "BASIC"),

  formula("CONV", "Conveyance", "ALLOWANCE", 40,
    "1600 * contract_days / period_days"),

  // The balancing figure that makes GROSS ≈ the contract wage. v1's version of
  // this line always evaluated to zero (§4.5) — hence the worked example in
  // the PRD, and hence this rule being seeded rather than optional.
  formula("SPECIAL", "Special Allowance", "ALLOWANCE", 50,
    "max(0, contract.wage * contract_days / period_days" +
    " - rules.BASIC - rules.HRA - rules.DA - rules.CONV)"),

  formula("OT", "Overtime", "ALLOWANCE", 60,
    "overtime_hours * (rules.BASIC / (payable_days * contract.daily_hours)) * 1.5",
    "overtime_hours > 0"),

  formula("GROSS", "Gross Salary", "GROSS", 100,
    "categories.BASIC + categories.ALLOWANCE"),

  formula("PF", "Provident Fund", "DEDUCTION", 110,
    "min(rules.BASIC + rules.DA, 15000) * 0.12"),

  formula("PT", "Professional Tax", "DEDUCTION", 120,
    "200 if rules.GROSS > 21000 else 0"),

  // Labelled "(simplified)" on the payslip and the PDF because it is our own
  // demo content, not statutory Indian income tax — PRD §4.5 is explicit.
  formula("TDS", "Income Tax (simplified)", "DEDUCTION", 130,
    "max(0, (rules.GROSS * 12 - 500000) * 0.05 / 12)"),

  // Unpaid time is charged in exactly one place. v1 charged it twice.
  formula("LWP", "Unpaid Leave / Absence", "DEDUCTION", 140,
    "contract.wage / period_days * unpaid_days",
    "unpaid_days > 0"),

  formula("NET", "Net Salary", "NET", 200,
    "categories.GROSS - categories.DEDUCTION"),
];

export const salaryRules: SalaryRule[] = RULE_SPECS.map((spec, i) => ({
  ...spec,
  id: i + 1,
  structure_id: STRUCTURE_ID,
}));

export const ruleByCode = new Map(salaryRules.map((r) => [r.code, r]));

export const salaryStructures: SalaryStructure[] = [
  {
    id: STRUCTURE_ID,
    name: "Standard monthly · India",
    code: "STD_IN",
    currency: CURRENCY,
    rule_count: salaryRules.length,
    // Filled from the contract fixtures at assembly time (see `index.ts`) —
    // "distinct employees with a RUNNING contract pointing here" (PRD §5).
    employee_count: 0,
    is_active: true,
  },
];
