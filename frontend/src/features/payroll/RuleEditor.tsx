/**
 * THE RULE EDITOR — S13's middle column.
 *
 * A rule is four decisions that interact: what category it belongs to (which
 * decides whether it builds the tower or carves it), whether it fires at all,
 * how its amount is arrived at, and where in the sequence it sits. The form is
 * arranged in that order because that is the order the evaluator reads them.
 *
 * **`Validate formula` is a dry run, not a syntax check.** It sends the
 * expression to the sandbox with the sample context and shows the *amount it
 * produced* — the number is the answer to "is this right?", where a green tick
 * would only answer "does it parse?". A rejection names the offending token by
 * name, which turns a typo from a silent zero on somebody's payslip into a
 * sentence under the field.
 */
import { useEffect, useState } from "react";
import { FlaskConical, Trash2 } from "lucide-react";
import type { RuleCategory, SalaryRule } from "@/api/contract";
import {
  AMOUNT_TYPES, CONDITION_TYPES, RULE_CATEGORIES,
} from "@/api/contract";
import { money } from "@/api/money";
import {
  Button, Field, Select, Textarea, WarningCard, Well, cx,
} from "@/components/system";
import { RollingNumber } from "@/components/signature";
import { validateFormula } from "./api";

export interface RuleDraft {
  code: string;
  name: string;
  category: RuleCategory;
  sequence: number;
  condition_type: SalaryRule["condition_type"];
  condition_expr: string;
  amount_type: SalaryRule["amount_type"];
  amount_fixed: string;
  percentage: string;
  percentage_base_code: string;
  amount_formula: string;
  appears_on_payslip: boolean;
  is_active: boolean;
}

export const draftOf = (rule: SalaryRule): RuleDraft => ({
  code: rule.code,
  name: rule.name,
  category: rule.category,
  sequence: rule.sequence,
  condition_type: rule.condition_type,
  condition_expr: rule.condition_expr ?? "",
  amount_type: rule.amount_type,
  amount_fixed: rule.amount_fixed ?? "",
  percentage: rule.percentage ?? "",
  percentage_base_code: rule.percentage_base_code ?? "",
  amount_formula: rule.amount_formula ?? "",
  appears_on_payslip: rule.appears_on_payslip,
  is_active: rule.is_active,
});

export const blankDraft = (sequence: number): RuleDraft => ({
  code: "",
  name: "",
  category: "ALLOWANCE",
  sequence,
  condition_type: "ALWAYS",
  condition_expr: "",
  amount_type: "FIXED",
  amount_fixed: "",
  percentage: "",
  percentage_base_code: "",
  amount_formula: "",
  appears_on_payslip: true,
  is_active: true,
});

/** Back to the wire shape — empty strings are `null`, never `""`. */
export function patchOf(draft: RuleDraft, structureId: number): Partial<SalaryRule> {
  const nul = (s: string) => (s.trim() === "" ? null : s.trim());
  return {
    structure_id: structureId,
    code: draft.code.trim().toUpperCase(),
    name: draft.name.trim(),
    category: draft.category,
    sequence: draft.sequence,
    condition_type: draft.condition_type,
    condition_expr: draft.condition_type === "EXPRESSION" ? nul(draft.condition_expr) : null,
    amount_type: draft.amount_type,
    amount_fixed: draft.amount_type === "FIXED" ? nul(draft.amount_fixed) : null,
    percentage: draft.amount_type === "PERCENTAGE" ? nul(draft.percentage) : null,
    percentage_base_code:
      draft.amount_type === "PERCENTAGE" ? nul(draft.percentage_base_code) : null,
    amount_formula: draft.amount_type === "FORMULA" ? nul(draft.amount_formula) : null,
    appears_on_payslip: draft.appears_on_payslip,
    is_active: draft.is_active,
  };
}

interface SandboxResult {
  valid: boolean;
  amount: string | null;
  error: string | null;
  context: Record<string, number | string>;
}

export function RuleEditor({
  draft,
  onChange,
  onSave,
  onCancel,
  onDelete,
  siblings,
  forwardOffenders,
  dirty,
  saving,
  fieldErrors,
  message,
  editable,
  isNew,
}: {
  draft: RuleDraft;
  onChange: (patch: Partial<RuleDraft>) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
  /** Every other rule in the structure — the base-code choices. */
  siblings: SalaryRule[];
  /** Codes this rule reads that are evaluated later. Highlighted here *and* in the list. */
  forwardOffenders: string[] | undefined;
  dirty: boolean;
  saving: boolean;
  fieldErrors: Record<string, string>;
  message: string | undefined;
  editable: boolean;
  isNew: boolean;
}) {
  const [sandbox, setSandbox] = useState<SandboxResult>();
  const [testing, setTesting] = useState(false);

  /** A result about a formula that has since been edited is worse than none. */
  useEffect(() => {
    setSandbox(undefined);
  }, [draft.amount_formula, draft.condition_expr, draft.code]);

  async function test(expression: string) {
    setTesting(true);
    try {
      const result = await validateFormula({ expression });
      setSandbox({
        valid: result.valid,
        amount: result.amount,
        error: result.error,
        context: result.sample_context ?? {},
      });
    } catch {
      setSandbox({
        valid: false,
        amount: null,
        error: "The sandbox could not be reached.",
        context: {},
      });
    } finally {
      setTesting(false);
    }
  }

  const earlier = siblings
    .filter((r) => r.sequence < draft.sequence && r.code !== draft.code)
    .sort((a, b) => a.sequence - b.sequence);

  return (
    <div className="pp-rules__editor">
      <header className="pp-rules__editorhead">
        <h2 className="t-h3" style={{ margin: 0 }}>
          {isNew ? "New rule" : draft.code || "Rule"}
        </h2>
        {editable && onDelete && !isNew && (
          <Button size="sm" variant="quiet" icon={<Trash2 size={14} />} onClick={onDelete}>
            Delete
          </Button>
        )}
      </header>

      {forwardOffenders && (
        <WarningCard
          severity="warning"
          code="RULE_FORWARD_REFERENCE"
          detail={`This rule reads ${forwardOffenders.join(", ")}, which the evaluator has not produced yet at sequence ${draft.sequence}.`}
          blocks="It resolves to zero rather than failing, so the payslip would be quietly wrong."
        />
      )}

      {message && <p className="pp-form__error t-ui-sm" role="alert">{message}</p>}

      <div className="pp-form">
        <div className="pp-form__row">
          <Field
            label="Code"
            required
            disabled={!editable || !isNew}
            help={isNew ? "Capitals, digits and underscores." : "A code is permanent — payslips quote it long after the rule changes."}
            error={fieldErrors.code}
            value={draft.code}
            onChange={(e) => onChange({ code: e.target.value.toUpperCase() })}
          />
          <Field
            label="Sequence"
            type="number"
            min={1}
            step={10}
            required
            disabled={!editable}
            help="Lower runs first. Reorder by dragging the list."
            error={fieldErrors.sequence}
            value={draft.sequence}
            onChange={(e) => onChange({ sequence: Number(e.target.value) || 0 })}
          />
        </div>

        <Field
          label="Name"
          required
          disabled={!editable}
          help="What the payslip prints."
          error={fieldErrors.name}
          value={draft.name}
          onChange={(e) => onChange({ name: e.target.value })}
        />

        <Select
          label="Category"
          disabled={!editable}
          error={fieldErrors.category}
          value={draft.category}
          onChange={(e) => onChange({ category: e.target.value as RuleCategory })}
          options={RULE_CATEGORIES.map((c) => ({ value: c, label: c }))}
          help={
            draft.category === "DEDUCTION"
              ? "Deductions carve the tower rather than stacking on it."
              : draft.category === "GROSS" || draft.category === "NET"
                ? "A total of other rules. It publishes a result and contributes nothing of its own."
                : "Builds the tower. Its amount is added to the gross."
          }
        />

        <fieldset className="pp-form__legend">
          <legend className="t-micro">WHEN IT APPLIES</legend>
          <Select
            label="Condition"
            disabled={!editable}
            value={draft.condition_type}
            onChange={(e) =>
              onChange({ condition_type: e.target.value as SalaryRule["condition_type"] })
            }
            options={CONDITION_TYPES.map((c) => ({
              value: c,
              label: c === "ALWAYS" ? "Always" : "Only when an expression holds",
            }))}
          />
          {draft.condition_type === "EXPRESSION" && (
            <Field
              label="Condition expression"
              disabled={!editable}
              placeholder="overtime_hours > 0"
              error={fieldErrors.condition_expr}
              help="A rule whose condition is false contributes nothing and prints no line."
              value={draft.condition_expr}
              onChange={(e) => onChange({ condition_expr: e.target.value })}
            />
          )}
        </fieldset>

        <fieldset className="pp-form__legend">
          <legend className="t-micro">HOW MUCH</legend>
          <Select
            label="Amount"
            disabled={!editable}
            value={draft.amount_type}
            onChange={(e) => onChange({ amount_type: e.target.value as SalaryRule["amount_type"] })}
            options={AMOUNT_TYPES.map((a) => ({
              value: a,
              label: a === "FIXED" ? "A fixed amount" : a === "PERCENTAGE" ? "A percentage of an earlier rule" : "A formula",
            }))}
          />

          {draft.amount_type === "FIXED" && (
            <Field
              label="Fixed amount"
              inputMode="decimal"
              disabled={!editable}
              placeholder="1600.00"
              error={fieldErrors.amount_fixed}
              value={draft.amount_fixed}
              onChange={(e) => onChange({ amount_fixed: e.target.value })}
            />
          )}

          {draft.amount_type === "PERCENTAGE" && (
            <div className="pp-form__row">
              <Field
                label="Percentage"
                inputMode="decimal"
                disabled={!editable}
                placeholder="40.00"
                help="40.00 means 40%, not 0.4."
                error={fieldErrors.percentage}
                value={draft.percentage}
                onChange={(e) => onChange({ percentage: e.target.value })}
              />
              <Select
                label="Of"
                disabled={!editable}
                error={fieldErrors.percentage_base_code}
                help="Only rules that evaluate earlier — a later one would resolve to zero."
                value={draft.percentage_base_code}
                onChange={(e) => onChange({ percentage_base_code: e.target.value })}
                options={[
                  { value: "", label: "Choose a rule" },
                  ...earlier.map((r) => ({ value: r.code, label: `${r.code} · ${r.name}` })),
                ]}
              />
            </div>
          )}

          {draft.amount_type === "FORMULA" && (
            <>
              <Textarea
                label="Formula"
                rows={3}
                disabled={!editable}
                className="pp-rules__formula"
                placeholder="round(contract.wage * 0.5 * contract_days / period_days, 2)"
                error={fieldErrors.amount_formula}
                value={draft.amount_formula}
                onChange={(e) => onChange({ amount_formula: e.target.value })}
              />
              <div className="pp-rules__testrow">
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<FlaskConical size={14} />}
                  loading={testing}
                  disabled={draft.amount_formula.trim() === ""}
                  onClick={() => test(draft.amount_formula)}
                >
                  Validate formula
                </Button>
                {draft.condition_type === "EXPRESSION" && draft.condition_expr.trim() !== "" && (
                  <Button
                    size="sm"
                    variant="quiet"
                    loading={testing}
                    onClick={() => test(draft.condition_expr)}
                  >
                    Validate condition
                  </Button>
                )}
              </div>
            </>
          )}
        </fieldset>

        {sandbox && <SandboxResultPanel result={sandbox} />}

        <fieldset className="pp-form__legend">
          <legend className="t-micro">ON THE DOCUMENT</legend>
          <label className="pp-check">
            <input
              type="checkbox"
              disabled={!editable}
              checked={draft.appears_on_payslip}
              onChange={(e) => onChange({ appears_on_payslip: e.target.checked })}
            />
            <span>
              <span className="t-ui">Prints on the payslip</span>
              <span className="t-ui-sm">
                An intermediate rule that exists only to be referenced by a
                later one is computed either way; this decides whether the
                employee sees a line for it.
              </span>
            </span>
          </label>
          <label className="pp-check">
            <input
              type="checkbox"
              disabled={!editable}
              checked={draft.is_active}
              onChange={(e) => onChange({ is_active: e.target.checked })}
            />
            <span>
              <span className="t-ui">Active</span>
              <span className="t-ui-sm">
                An inactive rule is skipped entirely. Historic payslips keep
                their lines — those are denormalised, so turning this off never
                rewrites a document that has already been issued.
              </span>
            </span>
          </label>
        </fieldset>
      </div>

      {editable && (
        <div className="pp-rules__actions">
          <Button variant="quiet" onClick={onCancel} disabled={saving || !dirty}>
            Discard changes
          </Button>
          <Button variant="primary" loading={saving} disabled={!dirty} onClick={onSave}>
            {isNew ? "Create rule" : "Save rule"}
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * The sandbox's answer, with the context it was computed against.
 *
 * Showing the amount without the inputs would be a number nobody can check —
 * the whole promise of this product is that a figure opens into what produced
 * it, and a dry run is the one place that is cheap to honour completely.
 */
function SandboxResultPanel({ result }: { result: SandboxResult }) {
  const shown = Object.entries(result.context).filter(([key]) =>
    ["contract.wage", "period_days", "contract_days", "payable_days", "unpaid_days", "overtime_hours"].includes(key),
  );

  return (
    <Well className={cx("pp-sandbox", !result.valid && "pp-sandbox--invalid")}>
      <p className="t-micro pp-sandbox__label">
        {result.valid ? "AGAINST THE SAMPLE MONTH, THIS PRODUCES" : "THE SANDBOX REFUSED THIS"}
      </p>

      {result.valid && result.amount !== null ? (
        <RollingNumber value={money(result.amount)} scale="xl" label="sandbox result" />
      ) : (
        <p className="t-body pp-sandbox__error" role="alert">{result.error}</p>
      )}

      {shown.length > 0 && (
        <dl className="pp-sandbox__ctx">
          {shown.map(([key, value]) => (
            <div key={key}>
              <dt className="n-mono">{key}</dt>
              <dd className="n-mono">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </Well>
  );
}
