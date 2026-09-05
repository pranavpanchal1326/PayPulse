/**
 * THE FORMULA SANDBOX, CLIENT SIDE — `POST /salary-rules/validate-formula`.
 *
 * PRD §4.4 puts the real sandbox on the backend, where the amounts that reach
 * a payslip are computed. This is the *dry run* behind it: the rule editor
 * (P9) asks "is this expression valid, and what would it produce?" on every
 * keystroke, and needs an answer in a few milliseconds with a usable error
 * message when the answer is no.
 *
 * **It is a parser, not an evaluator of arbitrary code.** No `eval`, no `new
 * Function`. Formulas come from a text field, and a text field that reaches a
 * JavaScript compiler is a cross-site-scripting hole with extra steps — the
 * fact that this only ever runs against fixtures is not a reason to write the
 * dangerous version. What it accepts is exactly the grammar §4.5's twelve
 * rules are written in: arithmetic, comparisons, `min`/`max`/`round`/`abs`,
 * and Python's `A if C else B`.
 *
 * The identifier whitelist doubles as documentation: an unknown name is a
 * *typo*, reported by name, rather than a silent zero that quietly
 * under-pays somebody.
 */
import type { FormulaValidationResult } from "@/api/contract";

/* ── The evaluation context ──────────────────────────────────────────── */

/**
 * One ordinary month, one ordinary employee, one unpaid day. Deliberately not
 * a round number of days: a sample where `contract_days === period_days`
 * cannot tell a correct proration from a missing one.
 */
export const SAMPLE_CONTEXT: Record<string, number> = {
  "contract.wage": 60000,
  "contract.daily_hours": 8,
  period_days: 22,
  contract_days: 22,
  payable_days: 21,
  worked_days: 21,
  unpaid_days: 1,
  absent_days: 1,
  paid_leave_days: 2,
  unpaid_leave_days: 0,
  worked_hours: 168,
  overtime_hours: 6,
  "rules.BASIC": 30000,
  "rules.HRA": 12000,
  "rules.DA": 6000,
  "rules.CONV": 1600,
  "rules.SPECIAL": 10400,
  "rules.GROSS": 60000,
  "categories.BASIC": 30000,
  "categories.ALLOWANCE": 30000,
  "categories.GROSS": 60000,
  "categories.DEDUCTION": 5060,
};

const FUNCTIONS: Record<string, (args: number[]) => number> = {
  min: (a) => Math.min(...a),
  max: (a) => Math.max(...a),
  abs: (a) => Math.abs(a[0]),
  round: (a) => {
    const factor = 10 ** (a[1] ?? 0);
    const scaled = a[0] * factor;
    // ROUND_HALF_UP away from zero, matching `engine.ts::toPaise`.
    return (scaled < 0 ? -Math.round(-scaled) : Math.round(scaled)) / factor;
  },
};

/** Thrown with a message a person can act on; never surfaced as a stack. */
class FormulaError extends Error {}

/* ── Tokeniser ───────────────────────────────────────────────────────── */

type Token =
  | { kind: "number"; value: number }
  | { kind: "name"; value: string }
  | { kind: "op"; value: string }
  | { kind: "end" };

const OPERATORS = [
  "<=", ">=", "==", "!=", "<", ">", "+", "-", "*", "/", "%", "(", ")", ",",
];

function tokenise(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < source.length) {
    const ch = source[i];

    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(source[i + 1] ?? ""))) {
      const start = i;
      while (i < source.length && /[0-9._]/.test(source[i])) i++;
      const raw = source.slice(start, i).replace(/_/g, "");
      const value = Number(raw);
      if (!Number.isFinite(value)) throw new FormulaError(`"${raw}" is not a number.`);
      tokens.push({ kind: "number", value });
      continue;
    }

    if (/[A-Za-z_]/.test(ch)) {
      const start = i;
      while (i < source.length && /[A-Za-z0-9_.]/.test(source[i])) i++;
      tokens.push({ kind: "name", value: source.slice(start, i) });
      continue;
    }

    const op = OPERATORS.find((o) => source.startsWith(o, i));
    if (!op) throw new FormulaError(`"${ch}" is not something a formula can contain.`);
    tokens.push({ kind: "op", value: op });
    i += op.length;
  }

  tokens.push({ kind: "end" });
  return tokens;
}

/* ── Parser and evaluator, in one pass ───────────────────────────────── */

const KEYWORDS = new Set(["if", "else", "and", "or", "not", "True", "False"]);

class Evaluator {
  private at = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly context: Record<string, number>,
    /** Every name the expression touched — the UI highlights these. */
    readonly referenced = new Set<string>(),
  ) {}

  private peek(): Token {
    return this.tokens[this.at];
  }

  private takeOp(value: string): boolean {
    const t = this.peek();
    if (t.kind === "op" && t.value === value) {
      this.at++;
      return true;
    }
    return false;
  }

  private takeName(value: string): boolean {
    const t = this.peek();
    if (t.kind === "name" && t.value === value) {
      this.at++;
      return true;
    }
    return false;
  }

  private expectOp(value: string): void {
    if (!this.takeOp(value)) throw new FormulaError(`Expected "${value}".`);
  }

  /** `X if C else Y` — the conditional §4.5 writes `PT` with. */
  expression(): number {
    const consequent = this.or();
    if (!this.takeName("if")) return consequent;

    const condition = this.or();
    if (!this.takeName("else")) {
      throw new FormulaError('A conditional needs an "else": value if condition else other.');
    }
    const alternative = this.expression();
    return condition !== 0 ? consequent : alternative;
  }

  private or(): number {
    let left = this.and();
    while (this.takeName("or")) {
      const right = this.and();
      left = left !== 0 || right !== 0 ? 1 : 0;
    }
    return left;
  }

  private and(): number {
    let left = this.not();
    while (this.takeName("and")) {
      const right = this.not();
      left = left !== 0 && right !== 0 ? 1 : 0;
    }
    return left;
  }

  private not(): number {
    if (this.takeName("not")) return this.not() !== 0 ? 0 : 1;
    return this.comparison();
  }

  private comparison(): number {
    const left = this.additive();
    for (const op of ["<=", ">=", "==", "!=", "<", ">"]) {
      if (this.takeOp(op)) {
        const right = this.additive();
        const result =
          op === "<=" ? left <= right
          : op === ">=" ? left >= right
          : op === "==" ? left === right
          : op === "!=" ? left !== right
          : op === "<" ? left < right
          : left > right;
        return result ? 1 : 0;
      }
    }
    return left;
  }

  private additive(): number {
    let left = this.multiplicative();
    for (;;) {
      if (this.takeOp("+")) left += this.multiplicative();
      else if (this.takeOp("-")) left -= this.multiplicative();
      else return left;
    }
  }

  private multiplicative(): number {
    let left = this.unary();
    for (;;) {
      if (this.takeOp("*")) {
        left *= this.unary();
      } else if (this.takeOp("/")) {
        const right = this.unary();
        // §4.4: a division by zero is a *message*, not a NaN on a payslip.
        if (right === 0) throw new FormulaError("This divides by zero.");
        left /= right;
      } else if (this.takeOp("%")) {
        const right = this.unary();
        if (right === 0) throw new FormulaError("This divides by zero.");
        left %= right;
      } else {
        return left;
      }
    }
  }

  private unary(): number {
    if (this.takeOp("-")) return -this.unary();
    if (this.takeOp("+")) return this.unary();
    return this.primary();
  }

  private primary(): number {
    const token = this.peek();

    if (token.kind === "number") {
      this.at++;
      return token.value;
    }

    if (this.takeOp("(")) {
      const value = this.expression();
      this.expectOp(")");
      return value;
    }

    if (token.kind === "name") {
      this.at++;
      const name = token.value;

      if (name === "True") return 1;
      if (name === "False") return 0;

      // A call: `min(a, b)`.
      if (this.peek().kind === "op" && (this.peek() as { value: string }).value === "(") {
        this.expectOp("(");
        const args: number[] = [];
        if (!this.takeOp(")")) {
          do {
            args.push(this.expression());
          } while (this.takeOp(","));
          this.expectOp(")");
        }
        const fn = FUNCTIONS[name];
        if (!fn) {
          throw new FormulaError(
            `"${name}" is not available. You can use ${Object.keys(FUNCTIONS).join(", ")}.`,
          );
        }
        if (args.length === 0) throw new FormulaError(`"${name}" needs an argument.`);
        return fn(args);
      }

      if (KEYWORDS.has(name)) {
        throw new FormulaError(`"${name}" cannot be used as a value.`);
      }

      if (!(name in this.context)) {
        throw new FormulaError(`"${name}" is not a value a rule can read.`);
      }
      this.referenced.add(name);
      return this.context[name];
    }

    throw new FormulaError("The expression ends before it is finished.");
  }

  finish(): void {
    if (this.peek().kind !== "end") {
      throw new FormulaError("There is something left over at the end of the expression.");
    }
  }
}

/* ── The public surface ──────────────────────────────────────────────── */

export interface FormulaOutcome extends FormulaValidationResult {
  /** Names the expression actually read — the editor highlights them. */
  referenced: string[];
}

/**
 * Never throws. A formula that cannot be evaluated is an *answer*
 * (`valid: false` with a message), because the editor asks this on every
 * keystroke and half-typed input is the normal case, not an exception.
 */
export function validateFormula(
  expression: string,
  overrides: Record<string, number | string> = {},
): FormulaOutcome {
  const context = { ...SAMPLE_CONTEXT };
  for (const [key, value] of Object.entries(overrides)) {
    const n = Number(value);
    if (Number.isFinite(n)) context[key] = n;
  }

  const sample_context: Record<string, number | string> = { ...context };

  if (expression.trim() === "") {
    return {
      valid: false,
      amount: null,
      error: "Write an expression first.",
      sample_context,
      referenced: [],
    };
  }

  try {
    const evaluator = new Evaluator(tokenise(expression), context);
    const value = evaluator.expression();
    evaluator.finish();

    if (!Number.isFinite(value)) {
      throw new FormulaError("This produces a number the payslip cannot carry.");
    }

    return {
      valid: true,
      // Money on the wire is a two-decimal string, here as everywhere.
      amount: value.toFixed(2),
      error: null,
      sample_context,
      referenced: [...evaluator.referenced],
    };
  } catch (cause) {
    return {
      valid: false,
      amount: null,
      error: cause instanceof FormulaError ? cause.message : "That expression cannot be read.",
      sample_context,
      referenced: [],
    };
  }
}
