/**
 * THE CONTRACT DRAWER — read, then edit, in one surface.
 *
 * §09.6 makes the drawer the default detail pattern, and a contract is the
 * case that argues for it: you open one to *check* a wage far more often than
 * to change it, and a modal would make reading it a decision.
 *
 * **The 409 is the design problem on this screen.** B2's exclusion constraint
 * refuses two RUNNING contracts that overlap, and the friendly failure is not
 * "conflict" — it is *"this overlaps «Senior Engineer», which runs to 15 Aug;
 * end that one on the 14th to record a raise"*. The API already writes that
 * sentence. This form's job is to keep it on screen, attached to the dates
 * that caused it, until they change — which is a `WarningCard`, not a toast.
 *
 * The adjacent pair is the case worth remembering: a contract ending on the
 * 15th and the next starting on the 16th is a mid-month raise and is **legal**.
 * v1 rejected it and thereby made a raise unpayable (PRD §3.2). The form
 * therefore never pre-emptively refuses adjacency; it lets the server judge.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Contract, Employee, SalaryStructure, WorkingSchedule } from "@/api/contract";
import { CONTRACT_STATES } from "@/api/contract";
import { ApiError } from "@/api/errors";
import { money } from "@/api/money";
import { useSubmission } from "@/api/useQuery";
import { useAuth } from "@/auth/AuthContext";
import {
  Button, Drawer, Field, Select, StateChip, Textarea, WarningCard, Well, useToast,
} from "@/components/system";
import { RollingNumber } from "@/components/signature";
import { Pair, decimalLabel, formatDate } from "@/features/shared";
import { createContract, updateContract } from "./api";

export interface ContractReference {
  employees: Employee[];
  schedules: WorkingSchedule[];
  structures: SalaryStructure[];
}

interface Draft {
  employee_id: string;
  name: string;
  state: Contract["state"];
  date_start: string;
  date_end: string;
  wage: string;
  working_schedule_id: string;
  salary_structure_id: string;
  notes: string;
}

const blank = (): Draft => ({
  employee_id: "",
  name: "",
  state: "DRAFT",
  date_start: new Date().toISOString().slice(0, 10),
  date_end: "",
  wage: "",
  working_schedule_id: "",
  salary_structure_id: "",
  notes: "",
});

const draftOf = (c: Contract): Draft => ({
  employee_id: String(c.employee_id),
  name: c.name,
  state: c.state,
  date_start: c.date_start,
  date_end: c.date_end ?? "",
  wage: c.wage,
  working_schedule_id: String(c.working_schedule_id),
  salary_structure_id: c.salary_structure_id === null ? "" : String(c.salary_structure_id),
  notes: c.notes ?? "",
});

export function ContractDrawer({
  open,
  contract,
  reference,
  onClose,
  onSaved,
}: {
  open: boolean;
  contract?: Contract;
  reference: ContractReference;
  onClose: () => void;
  onSaved: (saved: Contract) => void;
}) {
  const { can } = useAuth();
  const toast = useToast();
  const form = useSubmission();

  const editable = can("contract", contract ? "update" : "create");
  const [mode, setMode] = useState<"read" | "edit">(contract ? "read" : "edit");
  const [draft, setDraft] = useState<Draft>(() => (contract ? draftOf(contract) : blank()));

  /**
   * The 409 lives here rather than in `useSubmission`, because it is not a
   * field error and not a generic message — it is a *conflict with a named
   * other record*, and the screen renders it as its own card.
   */
  const [conflict, setConflict] = useState<string>();

  useEffect(() => {
    if (!open) return;
    setDraft(contract ? draftOf(contract) : blank());
    setMode(contract ? "read" : "edit");
    setConflict(undefined);
    form.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, contract?.id]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const schedule = reference.schedules.find((s) => String(s.id) === draft.working_schedule_id);

  async function save() {
    setConflict(undefined);
    const patch: Partial<Contract> = {
      employee_id: Number(draft.employee_id),
      name: draft.name.trim(),
      state: draft.state,
      date_start: draft.date_start,
      date_end: draft.date_end === "" ? null : draft.date_end,
      wage: draft.wage.trim(),
      working_schedule_id: Number(draft.working_schedule_id) || undefined,
      salary_structure_id:
        draft.salary_structure_id === "" ? null : Number(draft.salary_structure_id),
      notes: draft.notes.trim() === "" ? null : draft.notes.trim(),
    };

    let saved: Contract | undefined;
    const ok = await form.submit(async () => {
      try {
        saved = contract
          ? await updateContract(contract.id, patch)
          : await createContract(patch);
      } catch (cause) {
        // 409 is the overlap. It is not a field error and it is not a toast:
        // it names another contract and has to stay readable while the dates
        // are corrected.
        if (cause instanceof ApiError && cause.status === 409) {
          setConflict(cause.message);
          return;
        }
        throw cause;
      }
    });

    if (ok && saved) {
      toast(contract ? "Contract updated." : "Contract created.", "jade");
      onSaved(saved);
    }
  }

  const title = contract ? contract.name : "New contract";

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={title}
      wide
      footer={
        mode === "edit" ? (
          <div className="pp-form__row" style={{ justifyContent: "flex-end" }}>
            <Button
              variant="quiet"
              onClick={() => (contract ? setMode("read") : onClose())}
              disabled={form.busy}
            >
              Cancel
            </Button>
            <Button variant="primary" loading={form.busy} onClick={save}>
              {contract ? "Save changes" : "Create contract"}
            </Button>
          </div>
        ) : (
          editable && (
            <div className="pp-form__row" style={{ justifyContent: "flex-end" }}>
              <Button variant="primary" onClick={() => setMode("edit")}>Edit</Button>
            </div>
          )
        )
      }
    >
      {conflict && (
        <div style={{ marginBottom: "var(--s-4)" }}>
          <WarningCard
            severity="error"
            code="CONTRACT_OVERLAP"
            detail={conflict}
            blocks="This contract cannot be saved while it overlaps another running one."
          />
        </div>
      )}

      {form.message && (
        <p className="pp-form__error t-ui-sm" role="alert">{form.message}</p>
      )}

      {mode === "read" && contract ? (
        <ReadFace contract={contract} schedule={schedule} reference={reference} />
      ) : (
        <div className="pp-form">
          <Select
            label="Employee"
            required
            disabled={!!contract}
            help={contract ? "A contract cannot be moved between people — cancel it and write a new one." : undefined}
            error={form.fields.employee_id}
            value={draft.employee_id}
            onChange={(e) => set("employee_id", e.target.value)}
            options={[
              { value: "", label: "Choose a person" },
              ...reference.employees.map((e) => ({
                value: String(e.id),
                label: `${e.full_name} · ${e.employee_number}`,
              })),
            ]}
          />

          <Field
            label="Contract name"
            required
            placeholder="Senior Engineer · 2026"
            error={form.fields.name}
            value={draft.name}
            onChange={(e) => set("name", e.target.value)}
          />

          <div className="pp-form__row">
            <Field
              label="Starts"
              type="date"
              required
              error={form.fields.date_start}
              value={draft.date_start}
              onChange={(e) => set("date_start", e.target.value)}
            />
            <Field
              label="Ends"
              type="date"
              min={draft.date_start || undefined}
              help="Leave empty for an open-ended contract."
              error={form.fields.date_end}
              value={draft.date_end}
              onChange={(e) => set("date_end", e.target.value)}
            />
          </div>

          <div className="pp-form__row">
            <Field
              label="Monthly wage"
              required
              inputMode="decimal"
              placeholder="50000.00"
              help="The gross monthly figure the structure computes from."
              error={form.fields.wage}
              value={draft.wage}
              onChange={(e) => set("wage", e.target.value)}
            />
            <Select
              label="State"
              error={form.fields.state}
              value={draft.state}
              onChange={(e) => set("state", e.target.value as Contract["state"])}
              options={CONTRACT_STATES.map((s) => ({
                value: s,
                label: s.charAt(0) + s.slice(1).toLowerCase(),
              }))}
              help={
                draft.state === "RUNNING"
                  ? "Running contracts may not overlap another running one for the same person."
                  : "Only a running contract is used by payroll."
              }
            />
          </div>

          <div className="pp-form__row">
            <Select
              label="Working schedule"
              error={form.fields.working_schedule_id}
              value={draft.working_schedule_id}
              onChange={(e) => set("working_schedule_id", e.target.value)}
              options={[
                { value: "", label: "The employee's own schedule" },
                ...reference.schedules.map((s) => ({
                  value: String(s.id),
                  label: `${s.name} · ${decimalLabel(s.hours_per_week)}h/week`,
                })),
              ]}
            />
            <Select
              label="Salary structure"
              error={form.fields.salary_structure_id}
              value={draft.salary_structure_id}
              onChange={(e) => set("salary_structure_id", e.target.value)}
              options={[
                { value: "", label: "None — payroll will skip this contract" },
                ...reference.structures.map((s) => ({ value: String(s.id), label: s.name })),
              ]}
            />
          </div>

          <Textarea
            label="Notes"
            rows={3}
            error={form.fields.notes}
            value={draft.notes}
            onChange={(e) => set("notes", e.target.value)}
          />

          {/* The live consequence of the two fields above it. A wage and a
              schedule are only meaningful together, and this is where the
              reader would otherwise have to do the division themselves. */}
          {schedule && (
            <Well style={{ padding: "var(--s-4)" }}>
              <p className="t-micro" style={{ margin: 0, color: "var(--ink-400)" }}>
                ON THIS SCHEDULE
              </p>
              <div className="pp-ct__derived">
                <span className="t-ui-sm">
                  {decimalLabel(schedule.hours_per_week)} hours a week ·{" "}
                  {decimalLabel(schedule.daily_hours)} a day
                  {schedule.crosses_midnight && " · crosses midnight"}
                </span>
                {/^\d+(\.\d{1,2})?$/.test(draft.wage.trim()) && (
                  <span className="t-ui-sm" style={{ color: "var(--ink-500)" }}>
                    ≈{" "}
                    <RollingNumber
                      value={
                        money(
                          (
                            Number(draft.wage) /
                            Math.max(Number(schedule.hours_per_week) * 4.333, 1)
                          ).toFixed(2),
                        )
                      }
                      scale="mono"
                    />{" "}
                    an hour
                  </span>
                )}
              </div>
            </Well>
          )}
        </div>
      )}
    </Drawer>
  );
}

/* ── The read face ────────────────────────────────────────────────────── */

function ReadFace({
  contract,
  schedule,
  reference,
}: {
  contract: Contract;
  schedule: WorkingSchedule | undefined;
  reference: ContractReference;
}) {
  const structure = reference.structures.find((s) => s.id === contract.salary_structure_id);
  return (
    <>
      <div className="pp-ct__hero">
        <RollingNumber value={money(contract.wage)} scale="xl" label="monthly wage" />
        <StateChip state={contract.state} />
      </div>

      <Well style={{ marginTop: "var(--s-4)" }}>
        <div className="pp-pairs">
          <Pair
            k="Employee"
            v={
              <Link to={`/people/${contract.employee_id}`} className="focusable">
                {contract.employee_name}
              </Link>
            }
          />
          <Pair k="Currency" v={contract.currency} />
          <Pair k="Starts" v={formatDate(contract.date_start)} />
          <Pair k="Ends" v={contract.date_end ? formatDate(contract.date_end) : "Open-ended"} />
          <Pair
            k="Working schedule"
            v={
              schedule ? (
                <Link to={`/contracts/schedules/${schedule.id}`} className="focusable">
                  {schedule.name}
                </Link>
              ) : null
            }
          />
          <Pair k="Hours a week" v={schedule ? decimalLabel(schedule.hours_per_week) : null} />
          <Pair
            k="Salary structure"
            v={
              structure ? (
                <Link to={`/payroll/structures/${structure.id}`} className="focusable">
                  {structure.name}
                </Link>
              ) : null
            }
          />
          <Pair k="Notes" v={contract.notes} />
        </div>
      </Well>
    </>
  );
}
