/**
 * PAYROLL CONFIGURATION — salary structures, rules and the formula dry-run.
 *
 * The rule editor is the screen where a user can silently break payroll, so
 * the mock refuses the two mistakes that would only surface as a wrong number
 * three screens later:
 *
 *   · **A forward reference.** `percentage_base_code` must name a rule with a
 *     *strictly lower* sequence (PRD §4.4). A rule that reads a later rule
 *     reads a blank, and the payslip is wrong rather than broken.
 *   · **A duplicate or malformed code.** `^[A-Z][A-Z0-9_]{1,19}$` (§3.9), and
 *     unique within the structure, because `rules.BASIC` has to mean one thing.
 *
 * Reordering is its own endpoint (`/reorder`) rather than N patches: dragging
 * a rule up must be one atomic move, or a half-applied drag leaves a structure
 * whose evaluation order is nonsense.
 */
import { http } from "msw";
import type { SalaryRule, SalaryStructure } from "@/api/contract";
import { AMOUNT_TYPES, CONDITION_TYPES, RULE_CATEGORIES } from "@/api/contract";
import { byId, db, nextId } from "../db";
import {
  Fields, Refused, auth, body, conflict, idOf, int, noContent, notFound, ok, paginate,
  query, route, settle, sortBy, str,
} from "../http";
import { validateFormula } from "../formula";

const CODE = /^[A-Z][A-Z0-9_]{1,19}$/;

/** "Distinct employees with a RUNNING contract pointing here" — PRD §5. */
function recount(structure: SalaryStructure): SalaryStructure {
  structure.rule_count = db.salaryRules.filter((r) => r.structure_id === structure.id).length;
  structure.employee_count = new Set(
    db.contracts
      .filter((c) => c.state === "RUNNING" && c.salary_structure_id === structure.id)
      .map((c) => c.employee_id),
  ).size;
  return structure;
}

const rulesOf = (structureId: number): SalaryRule[] =>
  sortBy(db.salaryRules.filter((r) => r.structure_id === structureId), (r) => r.sequence);

function validateRule(patch: Record<string, unknown>, existing: SalaryRule | null): Fields {
  const f = new Fields();

  const structureId = int(patch.structure_id) ?? existing?.structure_id;
  const code = str(patch.code) ?? existing?.code;
  const category = str(patch.category) ?? existing?.category;
  const amountType = str(patch.amount_type) ?? existing?.amount_type;
  const conditionType = str(patch.condition_type) ?? existing?.condition_type ?? "ALWAYS";
  const sequence = int(patch.sequence) ?? existing?.sequence;

  if (!existing) {
    f.require("structure_id", patch.structure_id)
      .require("code", str(patch.code))
      .require("name", str(patch.name))
      .require("category", str(patch.category))
      .require("sequence", patch.sequence);
  }

  if (structureId !== undefined) {
    f.check(
      byId(db.salaryStructures, structureId) !== undefined,
      "structure_id",
      "That structure no longer exists.",
    );
  }

  if (code !== undefined) {
    f.check(CODE.test(code), "code", "Capitals, digits and underscores — like BASIC or HRA_2.");
    const clash = db.salaryRules.find(
      (r) => r.structure_id === structureId && r.code === code && r.id !== existing?.id,
    );
    f.check(!clash, "code", "Another rule in this structure already uses that code.");
  }

  if (category !== undefined) {
    f.check(
      (RULE_CATEGORIES as readonly string[]).includes(category),
      "category",
      "Not a valid category.",
    );
  }
  if (amountType !== undefined) {
    f.check(
      (AMOUNT_TYPES as readonly string[]).includes(amountType),
      "amount_type",
      "Fixed, percentage or formula.",
    );
  }
  if (conditionType !== undefined) {
    f.check(
      (CONDITION_TYPES as readonly string[]).includes(conditionType),
      "condition_type",
      "Always, or an expression.",
    );
  }

  const conditionExpr = str(patch.condition_expr) ?? existing?.condition_expr ?? null;
  if (conditionType === "EXPRESSION") {
    f.require("condition_expr", conditionExpr, "An expression condition needs an expression.");
    if (conditionExpr) {
      const outcome = validateFormula(conditionExpr);
      f.check(outcome.valid, "condition_expr", outcome.error ?? "");
    }
  }

  if (amountType === "FIXED") {
    const fixed = patch.amount_fixed ?? existing?.amount_fixed;
    f.require("amount_fixed", fixed, "A fixed rule needs an amount.");
  }

  if (amountType === "PERCENTAGE") {
    const percentage = patch.percentage ?? existing?.percentage;
    const base = str(patch.percentage_base_code) ?? existing?.percentage_base_code ?? null;
    f.require("percentage", percentage, "A percentage rule needs a percentage.");
    f.require("percentage_base_code", base, "Say which rule the percentage is of.");

    if (base && sequence !== undefined) {
      const target = db.salaryRules.find(
        (r) => r.structure_id === structureId && r.code === base && r.id !== existing?.id,
      );
      if (!target) {
        f.add("percentage_base_code", `There is no rule called ${base} in this structure.`);
      } else if (target.sequence >= sequence) {
        // §4.4: a rule may only read something already computed.
        f.add(
          "percentage_base_code",
          `${base} runs at sequence ${target.sequence}, at or after this rule. ` +
            `A rule can only take a percentage of one that runs before it.`,
        );
      }
    }
  }

  if (amountType === "FORMULA") {
    const expr = str(patch.amount_formula) ?? existing?.amount_formula ?? null;
    f.require("amount_formula", expr, "A formula rule needs a formula.");
    if (expr) {
      const outcome = validateFormula(expr);
      f.check(outcome.valid, "amount_formula", outcome.error ?? "");
    }
  }

  return f;
}

export const payrollConfigHandlers = [
  /* ── Structures ────────────────────────────────────────────────────── */

  http.get(route("/salary-structures"), async ({ request }) => {
    await settle();
    const user = auth(request, "salary_structure", "read");
    if (user instanceof Refused) return user.response;

    const url = new URL(request.url);
    const activeOnly = query(url).bool("is_active");
    const rows = db.salaryStructures
      .filter((s) => activeOnly === undefined || s.is_active === activeOnly)
      .map(recount);
    return ok(paginate(sortBy(rows, (s) => s.name), url));
  }),

  http.post(route("/salary-structures"), async ({ request }) => {
    await settle();
    const user = auth(request, "salary_structure", "create");
    if (user instanceof Refused) return user.response;

    const patch = await body(request);
    const name = str(patch.name);
    const code = str(patch.code);

    const f = new Fields().require("name", name).require("code", code);
    if (code !== undefined) {
      f.check(CODE.test(code), "code", "Capitals, digits and underscores.");
      f.check(!db.salaryStructures.some((s) => s.code === code), "code", "That code is taken.");
    }
    if (f.failed) return f.response();

    const created: SalaryStructure = {
      id: nextId(db.salaryStructures),
      name: name!,
      code: code!,
      currency: str(patch.currency) ?? "INR",
      rule_count: 0,
      employee_count: 0,
      is_active: true,
    };
    db.salaryStructures.push(created);
    return ok(created, 201);
  }),

  /** Rules ordered, plus the two counts PRD §5 asks this route to carry. */
  http.get(route("/salary-structures/:id"), async ({ request, params }) => {
    await settle();
    const user = auth(request, "salary_structure", "read");
    if (user instanceof Refused) return user.response;

    const row = byId(db.salaryStructures, idOf(params));
    if (!row) return notFound("That salary structure");

    return ok({ ...recount(row), rules: rulesOf(row.id) });
  }),

  http.patch(route("/salary-structures/:id"), async ({ request, params }) => {
    await settle();
    const user = auth(request, "salary_structure", "update");
    if (user instanceof Refused) return user.response;

    const row = byId(db.salaryStructures, idOf(params));
    if (!row) return notFound("That salary structure");

    const patch = await body(request);
    const name = str(patch.name);
    if (name) row.name = name;
    if (typeof patch.is_active === "boolean") row.is_active = patch.is_active;
    return ok(recount(row));
  }),

  /**
   * Drag-to-reorder, as one move. The body is the complete ordering, so a
   * request that names a subset is refused rather than applied to part of the
   * list — a half-reordered structure evaluates in an order nobody chose.
   */
  http.post(route("/salary-structures/:id/reorder"), async ({ request, params }) => {
    await settle();
    const user = auth(request, "salary_structure", "update");
    if (user instanceof Refused) return user.response;

    const structure = byId(db.salaryStructures, idOf(params));
    if (!structure) return notFound("That salary structure");

    const ids = (await body(request)).rule_ids;
    if (!Array.isArray(ids)) {
      return new Fields().add("rule_ids", "Send the rule ids in their new order.").response();
    }

    const current = rulesOf(structure.id);
    const requested = ids.map(Number);
    const sameSet =
      requested.length === current.length &&
      new Set(requested).size === requested.length &&
      current.every((r) => requested.includes(r.id));

    if (!sameSet) {
      return conflict(
        "The order sent does not match this structure's rules. Reload and try again — " +
          "somebody may have added or removed one.",
      );
    }

    // Re-sequence in tens, leaving room to insert a rule between two later.
    requested.forEach((id, index) => {
      const rule = byId(db.salaryRules, id);
      if (rule) rule.sequence = (index + 1) * 10;
    });

    return ok({ ...recount(structure), rules: rulesOf(structure.id) });
  }),

  /* ── Rules ─────────────────────────────────────────────────────────── */

  http.post(route("/salary-rules/validate-formula"), async ({ request }) => {
    await settle();
    const user = auth(request, "salary_rule", "read");
    if (user instanceof Refused) return user.response;

    const patch = await body(request);
    const outcome = validateFormula(
      str(patch.expression) ?? "",
      (patch.context as Record<string, number | string>) ?? {},
    );

    // An invalid formula is a 200 with `valid: false` — the editor asks this
    // on every keystroke, and half-typed input is not an error condition.
    const { referenced, ...result } = outcome;
    return ok({ ...result, referenced });
  }),

  http.get(route("/salary-rules"), async ({ request }) => {
    await settle();
    const user = auth(request, "salary_rule", "read");
    if (user instanceof Refused) return user.response;

    const url = new URL(request.url);
    const q = query(url);
    const structureId = q.num("structure_id");
    const category = q.get("category");

    const rows = db.salaryRules.filter(
      (r) =>
        (structureId === undefined || r.structure_id === structureId) &&
        (category === undefined || r.category === category),
    );
    return ok(paginate(sortBy(rows, (r) => r.sequence), url));
  }),

  http.post(route("/salary-rules"), async ({ request }) => {
    await settle();
    const user = auth(request, "salary_rule", "create");
    if (user instanceof Refused) return user.response;

    const patch = await body(request);
    const f = validateRule(patch, null);
    if (f.failed) return f.response();

    const created: SalaryRule = {
      id: nextId(db.salaryRules),
      structure_id: int(patch.structure_id)!,
      code: str(patch.code)!,
      name: str(patch.name)!,
      category: str(patch.category) as SalaryRule["category"],
      sequence: int(patch.sequence)!,
      condition_type: (str(patch.condition_type) as SalaryRule["condition_type"]) ?? "ALWAYS",
      condition_expr: str(patch.condition_expr) ?? null,
      amount_type: (str(patch.amount_type) as SalaryRule["amount_type"]) ?? "FORMULA",
      amount_fixed: patch.amount_fixed === undefined || patch.amount_fixed === null
        ? null
        : Number(patch.amount_fixed).toFixed(2),
      percentage: patch.percentage === undefined || patch.percentage === null
        ? null
        : Number(patch.percentage).toFixed(2),
      percentage_base_code: str(patch.percentage_base_code) ?? null,
      amount_formula: str(patch.amount_formula) ?? null,
      appears_on_payslip: patch.appears_on_payslip !== false,
      is_active: patch.is_active !== false,
    };

    db.salaryRules.push(created);
    const structure = byId(db.salaryStructures, created.structure_id);
    if (structure) recount(structure);
    return ok(created, 201);
  }),

  http.patch(route("/salary-rules/:id"), async ({ request, params }) => {
    await settle();
    const user = auth(request, "salary_rule", "update");
    if (user instanceof Refused) return user.response;

    const row = byId(db.salaryRules, idOf(params));
    if (!row) return notFound("That rule");

    const patch = await body(request);
    const f = validateRule(patch, row);
    if (f.failed) return f.response();

    for (const key of [
      "code", "name", "category", "sequence", "condition_type", "condition_expr",
      "amount_type", "percentage_base_code", "amount_formula", "appears_on_payslip", "is_active",
    ] as const) {
      if (key in patch) (row as unknown as Record<string, unknown>)[key] = patch[key];
    }
    for (const key of ["amount_fixed", "percentage"] as const) {
      if (key in patch) {
        row[key] = patch[key] === null ? null : Number(patch[key]).toFixed(2);
      }
    }

    return ok(row);
  }),

  /**
   * Deleting a rule does **not** touch the payslips it produced. Lines carry a
   * denormalised `rule_code` precisely so history survives a change to the
   * configuration (PRD §4.7) — a payslip is a document, not a live query.
   */
  http.delete(route("/salary-rules/:id"), async ({ request, params }) => {
    await settle();
    const user = auth(request, "salary_rule", "delete");
    if (user instanceof Refused) return user.response;

    const id = idOf(params);
    const row = byId(db.salaryRules, id);
    if (!row) return notFound("That rule");

    const dependents = db.salaryRules.filter(
      (r) => r.structure_id === row.structure_id && r.percentage_base_code === row.code,
    );
    if (dependents.length > 0) {
      return conflict(
        `${dependents.map((d) => d.code).join(", ")} ` +
          `${dependents.length === 1 ? "takes" : "take"} a percentage of ${row.code}. ` +
          `Change ${dependents.length === 1 ? "it" : "them"} before deleting this rule.`,
      );
    }

    db.salaryRules.splice(db.salaryRules.indexOf(row), 1);
    const structure = byId(db.salaryStructures, row.structure_id);
    if (structure) recount(structure);
    return noContent();
  }),
];
