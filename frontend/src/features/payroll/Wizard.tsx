/**
 * S14 · S15 — THE PAYRUN WIZARD, and the door into the dark room.
 *
 * Two steps, and the whole design turns on what the first one does **not** do.
 *
 * **Step 1 creates nothing.** The spec is emphatic — *"Clicking Continue moves
 * to employee selection without creating the Payrun"* — so the preview call is
 * stateless and idempotent, and the interface says so out loud in a flush
 * `micro` line under the well: `COMPUTED · NOT PERSISTED`. That line is not
 * decoration. It is the difference between a screen you can safely explore and
 * one where every keystroke leaves a draft row behind, and the user has no way
 * to know which kind they are looking at unless it is written down.
 *
 * **Proration is visible before anybody commits.** Each eligible row carries
 * `contract_days / period_days` as a miniature LINE segment, so a joiner on
 * the 20th reads as a two-thirds-empty bar rather than as a surprise on a
 * payslip three screens later.
 *
 * **Blocked rows explain themselves inline.** A row that cannot be paid drops
 * to 55% and states its reason on the row. Hiding them would be worse: "why is
 * Kavya not in this run?" is the question that gets asked at the wrong moment,
 * and the answer belongs where the absence is.
 *
 * The room is dark from here to the cockpit (§04.4). It is entered
 * deliberately, and it is the same dark ramp the global theme uses — not a
 * second palette.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { EligibleEmployee, EligibleEmployeesRequest, EmployeeType } from "@/api/contract";
import { EMPLOYEE_TYPES } from "@/api/contract";
import { money } from "@/api/money";
import { useQuery, useSubmission } from "@/api/useQuery";
import { PageHeader } from "@/app/Shell";
import {
  Button, EmptyState, Field, Select, Skeleton, WarningCard, Well, cx, useToast,
} from "@/components/system";
import { Ratio, RollingCount, RollingNumber } from "@/components/signature";
import { currentMonth, openPeriod } from "@/lib/clock";
import { addMonths, monthEnd, monthLabel, monthStart } from "@/lib/date";
import { LoadFailure, formatDate } from "@/features/shared";
import { createPayrun, listDepartments, listStructures, previewEligible } from "./api";
import { DarkRoom } from "./DarkRoom";

const BLOCKER_TEXT: Record<string, string> = {
  NO_ACTIVE_CONTRACT:
    "No contract covers this period, so there is no wage to compute from.",
  ALREADY_PAID_THIS_PERIOD:
    "Already paid for this period. Paying twice is the failure this check exists to stop.",
};

const NOTE_TEXT: Record<string, string> = {
  PRORATED_PERIOD: "Part of the period only — pay is prorated by contract days.",
  MULTI_CONTRACT_PERIOD:
    "Two contracts inside this period. The one in force at the period end is used, and the payrun will say so.",
};

export function Wizard() {
  const navigate = useNavigate();
  const toast = useToast();
  const form = useSubmission();

  const [step, setStep] = useState<1 | 2>(1);

  /** The fixtures are anchored, so the open period is the sensible default. */
  const [structureId, setStructureId] = useState("");
  const [periodStart, setPeriodStart] = useState(monthStart(openPeriod()));
  const [periodEnd, setPeriodEnd] = useState(monthEnd(openPeriod()));
  const [departmentId, setDepartmentId] = useState("");
  const [employeeType, setEmployeeType] = useState("");
  const [name, setName] = useState("");
  const [chosen, setChosen] = useState<Set<number>>(new Set());

  const structures = useQuery(() => listStructures(), []);
  const departments = useQuery(() => listDepartments(), []);

  /** One structure is the common case; choosing it for the user is not a decision. */
  useEffect(() => {
    const items = structures.data ?? [];
    if (structureId === "" && items.length > 0) setStructureId(String(items[0].id));
  }, [structures.data, structureId]);

  useEffect(() => {
    if (name === "" && periodEnd) {
      setName(`${monthLabel(periodEnd.slice(0, 7))} payroll`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodEnd]);

  const request: EligibleEmployeesRequest | null =
    structureId === "" || periodStart === "" || periodEnd === "" || periodEnd < periodStart
      ? null
      : {
          salary_structure_id: Number(structureId),
          period_start: periodStart,
          period_end: periodEnd,
          department_id: departmentId === "" ? undefined : Number(departmentId),
          employee_type: employeeType === "" ? undefined : (employeeType as EmployeeType),
        };

  /**
   * The preview. Re-runs on every criterion change **because it is free to** —
   * the endpoint persists nothing, so there is no draft row accumulating
   * behind the exploration.
   */
  const preview = useQuery(
    () => (request ? previewEligible(request) : Promise.resolve<EligibleEmployee[]>([])),
    [JSON.stringify(request)],
  );

  const rows = preview.data ?? [];
  const eligible = useMemo(() => rows.filter((r) => r.eligible), [rows]);
  const blocked = useMemo(() => rows.filter((r) => !r.eligible), [rows]);

  /** Everybody eligible is selected on arrival; deselecting is the exception. */
  useEffect(() => {
    setChosen(new Set(eligible.map((r) => r.employee_id)));
  }, [eligible]);

  const selectedRows = eligible.filter((r) => chosen.has(r.employee_id));
  const selectedWage = selectedRows.reduce(
    (sum, r) => sum + Number(r.contract_wage ?? 0) * (r.period_days ? r.contract_days / r.period_days : 1),
    0,
  );

  async function create() {
    if (!request) return;
    const ok = await form.submit(async () => {
      const created = await createPayrun({
        name: name.trim(),
        salary_structure_id: request.salary_structure_id,
        period_start: request.period_start,
        period_end: request.period_end,
        employee_ids: [...chosen],
      });
      toast(`${created.name} created with ${created.payslip_count} draft payslips.`, "jade");
      navigate(`/payroll/${created.id}`, { replace: true });
    });
    if (!ok) setStep(2);
  }

  return (
    <DarkRoom>
      <PageHeader
        title="New payrun"
        meta={
          <span>
            Step {step} of 2 ·{" "}
            {step === 1 ? "scope" : `${chosen.size} of ${eligible.length} employees selected`}
          </span>
        }
        action={
          <Button
            variant="quiet"
            icon={<ArrowLeft size={16} />}
            onClick={() => (step === 1 ? navigate("/payroll") : setStep(1))}
          >
            {step === 1 ? "Cancel" : "Back to scope"}
          </Button>
        }
      />

      {step === 1 ? (
        <>
          <div className="pp-wiz__fields">
            <Select
              label="Salary structure"
              required
              value={structureId}
              onChange={(e) => setStructureId(e.target.value)}
              options={[
                { value: "", label: "Choose a structure" },
                ...(structures.data ?? []).map((s) => ({
                  value: String(s.id),
                  label: `${s.name} · ${s.rule_count} rules`,
                })),
              ]}
            />
            <Field
              label="Period start"
              type="date"
              required
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
            />
            <Field
              label="Period end"
              type="date"
              required
              min={periodStart || undefined}
              error={periodEnd < periodStart ? "The period ends before it starts." : undefined}
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
            />
            <Select
              label="Department"
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              options={[
                { value: "", label: "Every department" },
                ...(departments.data ?? []).map((d) => ({
                  value: String(d.id),
                  label: d.name,
                })),
              ]}
            />
            <Select
              label="Employee type"
              value={employeeType}
              onChange={(e) => setEmployeeType(e.target.value)}
              options={[
                { value: "", label: "Every type" },
                ...EMPLOYEE_TYPES.map((t) => ({
                  value: t,
                  label: t.charAt(0) + t.slice(1).toLowerCase().replace(/_/g, " "),
                })),
              ]}
            />
            <div className="pp-wiz__quick">
              <span className="t-micro">QUICK PERIODS</span>
              <div className="pp-form__row">
                {[0, -1, -2].map((offset) => {
                  const month = addMonths(currentMonth(), offset - 1);
                  const active = periodStart === monthStart(month) && periodEnd === monthEnd(month);
                  return (
                    <Button
                      key={month}
                      size="sm"
                      variant={active ? "key" : "quiet"}
                      aria-pressed={active}
                      onClick={() => {
                        setPeriodStart(monthStart(month));
                        setPeriodEnd(monthEnd(month));
                      }}
                    >
                      {monthLabel(month)}
                    </Button>
                  );
                })}
              </div>
            </div>
          </div>

          <Well className="pp-wiz__well" deep>
            {!request ? (
              <EmptyState
                title="Choose a structure and a period"
                body="The preview shows exactly who would be paid, and what proportion of the period each of them is on contract for, before anything is created."
              />
            ) : preview.state === "error" ? (
              <LoadFailure what="The eligibility preview" error={preview.error} onRetry={preview.reload} />
            ) : preview.initial ? (
              <Skeleton width="100%" />
            ) : rows.length === 0 ? (
              <EmptyState
                title="Nobody matches that scope"
                body="No employee has a contract on this structure inside that period. Widen the department or type filter, or check the contracts."
              />
            ) : (
              <div className="pp-wiz__summary">
                <div className="pp-wiz__count">
                  <RollingCount value={eligible.length} scale="hero" label="eligible employees" />
                  <p className="t-micro">ELIGIBLE</p>
                </div>
                <div className="pp-wiz__count">
                  <RollingCount value={blocked.length} scale="hero" label="blocked employees" />
                  <p className="t-micro">BLOCKED</p>
                </div>
                <p className="t-body pp-wiz__summarytext">
                  {eligible.length} of {rows.length} people on this structure can be paid for{" "}
                  {formatDate(periodStart)} → {formatDate(periodEnd)}.
                  {blocked.length > 0 &&
                    ` The other ${blocked.length} state their reason on the next step.`}
                </p>
              </div>
            )}
          </Well>

          {/* The spec's requirement, stated in the interface. */}
          <p className="t-micro pp-wiz__notpersisted">COMPUTED · NOT PERSISTED</p>
          <p className="t-ui-sm pp-wiz__notpersisted-why">
            Nothing above has been written down. This preview is a stateless
            call — change the period as often as you like; no draft payrun is
            left behind, and Continue still creates nothing.
          </p>

          <div className="pp-wiz__actions">
            <Button
              variant="primary"
              size="lg"
              iconAfter={<ArrowRight size={16} />}
              disabled={eligible.length === 0}
              onClick={() => setStep(2)}
            >
              Continue to employees
            </Button>
          </div>
        </>
      ) : (
        <>
          <Field
            label="Payrun name"
            required
            className="pp-wiz__name"
            error={form.fields.name}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          {form.message && (
            <WarningCard
              severity="error"
              code="PAYRUN_NOT_CREATED"
              detail={form.message}
              blocks="Nothing was created. Your selection is unchanged."
            />
          )}

          <div className="pp-wiz__selecthead">
            <p className="t-ui">
              <RollingCount value={chosen.size} scale="m" label="selected" /> of {eligible.length}{" "}
              selected · approximately{" "}
              <RollingNumber value={money(selectedWage.toFixed(2))} scale="m" label="total wage" />{" "}
              in contract wages
            </p>
            <div className="pp-form__row">
              <Button
                size="sm"
                variant="quiet"
                onClick={() => setChosen(new Set(eligible.map((r) => r.employee_id)))}
              >
                Select all
              </Button>
              <Button size="sm" variant="quiet" onClick={() => setChosen(new Set())}>
                Clear
              </Button>
            </div>
          </div>

          <Well deep className="pp-wiz__list">
            {rows.map((row) => (
              <EligibleRow
                key={row.employee_id}
                row={row}
                checked={chosen.has(row.employee_id)}
                onToggle={() =>
                  setChosen((current) => {
                    const next = new Set(current);
                    if (next.has(row.employee_id)) next.delete(row.employee_id);
                    else next.add(row.employee_id);
                    return next;
                  })
                }
              />
            ))}
          </Well>

          <div className="pp-wiz__actions">
            <Button
              variant="primary"
              size="lg"
              loading={form.busy}
              disabled={chosen.size === 0 || name.trim() === ""}
              onClick={create}
            >
              Create payrun with {chosen.size} {chosen.size === 1 ? "payslip" : "payslips"}
            </Button>
            {chosen.size === 0 && (
              <p className="t-ui-sm pp-wiz__hint">
                A payrun with nobody in it would compute nothing. Select at
                least one person.
              </p>
            )}
          </div>
        </>
      )}
    </DarkRoom>
  );
}

/* ── One row ──────────────────────────────────────────────────────────── */

function EligibleRow({
  row,
  checked,
  onToggle,
}: {
  row: EligibleEmployee;
  checked: boolean;
  onToggle: () => void;
}) {
  const prorated = row.contract_days < row.period_days;

  return (
    <label className={cx("pp-elig", !row.eligible && "pp-elig--blocked")}>
      <input
        type="checkbox"
        checked={checked}
        disabled={!row.eligible}
        onChange={onToggle}
        aria-describedby={row.eligible ? undefined : `blk-${row.employee_id}`}
      />

      <span className="pp-elig__who">
        <span className="t-ui">{row.name}</span>
        <span className="t-ui-sm">{row.department ?? "No department"}</span>
      </span>

      <span className="pp-elig__days">
        {/* Proration, drawn. §12 S15's miniature LINE segment. */}
        <Ratio
          value={row.contract_days}
          of={row.period_days}
          warnBelowFull
          label={`On contract for ${row.contract_days} of ${row.period_days} days in the period`}
        />
        <span className={cx("t-micro", prorated && "pp-elig__prorated")}>
          {row.contract_days}/{row.period_days} DAYS
        </span>
      </span>

      <span className="pp-elig__wage">
        {row.contract_wage === null ? (
          <span className="t-ui-sm" style={{ color: "var(--ink-400)" }}>no wage</span>
        ) : (
          <RollingNumber value={money(row.contract_wage)} scale="table" />
        )}
      </span>

      <span className="pp-elig__notes" id={`blk-${row.employee_id}`}>
        {row.blockers.map((code) => (
          <span key={code} className="pp-elig__blocker t-ui-sm">
            {BLOCKER_TEXT[code] ?? code}
          </span>
        ))}
        {row.notes.map((code) => (
          <span key={code} className="pp-elig__note t-ui-sm">
            {NOTE_TEXT[code] ?? code}
          </span>
        ))}
      </span>
    </label>
  );
}
