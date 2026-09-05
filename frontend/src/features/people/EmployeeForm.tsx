/**
 * CREATE / EDIT AN EMPLOYEE · a Drawer, per §09.6.
 *
 * The three validations P5 names — IFSC shape, exit-before-joining, duplicate
 * email — are **server rules**, and this form renders the server's answer on
 * the field it names. There is deliberately no client-side re-implementation
 * of them: a second copy would drift, and the one that matters is the one the
 * API enforces. The form does what the browser gives for free (required,
 * `type=email`, a date picker) and lets the envelope do the rest.
 */
import { useEffect, useState } from "react";
import type { Employee, EmployeeType } from "@/api/contract";
import { EMPLOYEE_TYPES } from "@/api/contract";
import { useSubmission } from "@/api/useQuery";
import { Button, Drawer, Field, Select, useToast } from "@/components/system";
import { createEmployee, updateEmployee } from "./api";
import { humanise } from "@/features/shared";

export interface ReferenceData {
  departments: Array<{ id: number; name: string }>;
  positions: Array<{ id: number; title: string }>;
  managers: Array<{ id: number; full_name: string }>;
  schedules: Array<{ id: number; name: string }>;
}

interface Draft {
  full_name: string;
  email: string;
  phone: string;
  date_of_joining: string;
  date_of_exit: string;
  employee_type: EmployeeType;
  department_id: string;
  job_position_id: string;
  manager_id: string;
  working_schedule_id: string;
  bank_account: string;
  bank_ifsc: string;
}

const blank = (): Draft => ({
  full_name: "", email: "", phone: "", date_of_joining: "", date_of_exit: "",
  employee_type: "FULL_TIME", department_id: "", job_position_id: "", manager_id: "",
  working_schedule_id: "", bank_account: "", bank_ifsc: "",
});

const draftOf = (e: Employee): Draft => ({
  full_name: e.full_name,
  email: e.email,
  phone: e.phone ?? "",
  date_of_joining: e.date_of_joining,
  date_of_exit: e.date_of_exit ?? "",
  employee_type: e.employee_type,
  department_id: e.department_id === null ? "" : String(e.department_id),
  job_position_id: e.job_position_id === null ? "" : String(e.job_position_id),
  manager_id: e.manager_id === null ? "" : String(e.manager_id),
  working_schedule_id: e.working_schedule_id === null ? "" : String(e.working_schedule_id),
  bank_account: e.bank_account ?? "",
  bank_ifsc: e.bank_ifsc ?? "",
});

/** An empty select means "none", which the API spells `null`. */
const ref = (value: string): number | null => (value === "" ? null : Number(value));
const text = (value: string): string | null => (value.trim() === "" ? null : value.trim());

export function EmployeeForm({
  open,
  onClose,
  employee,
  reference,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  /** Absent means create. */
  employee?: Employee;
  reference: ReferenceData;
  onSaved: (saved: Employee) => void;
}) {
  const [draft, setDraft] = useState<Draft>(blank);
  const { busy, fields, message, submit, reset } = useSubmission();
  const toast = useToast();

  // Re-seed on open, so a cancelled edit never leaks into the next one.
  useEffect(() => {
    if (!open) return;
    setDraft(employee ? draftOf(employee) : blank());
    reset();
  }, [open, employee, reset]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  async function save() {
    const patch: Partial<Employee> = {
      full_name: draft.full_name.trim(),
      email: draft.email.trim(),
      phone: text(draft.phone),
      date_of_joining: draft.date_of_joining,
      // Clearing the exit date is what re-activates someone — §3.3 derives
      // status from it — so an emptied field has to travel as an explicit
      // null rather than being dropped from the patch.
      date_of_exit: text(draft.date_of_exit),
      employee_type: draft.employee_type,
      department_id: ref(draft.department_id),
      job_position_id: ref(draft.job_position_id),
      manager_id: ref(draft.manager_id),
      working_schedule_id: ref(draft.working_schedule_id),
      bank_account: text(draft.bank_account),
      bank_ifsc: text(draft.bank_ifsc)?.toUpperCase() ?? null,
    };

    const saved = await submit(async () => {
      const row = employee
        ? await updateEmployee(employee.id, patch)
        : await createEmployee(patch);
      onSaved(row);
    });

    if (saved) {
      toast(employee ? "Changes saved." : `${patch.full_name} added.`, "jade");
      onClose();
    }
  }

  const options = <T,>(rows: T[], id: (r: T) => number, label: (r: T) => string, none: string) => [
    { value: "", label: none },
    ...rows.map((r) => ({ value: String(id(r)), label: label(r) })),
  ];

  return (
    <Drawer
      open={open}
      onClose={onClose}
      wide
      title={employee ? `Edit ${employee.full_name}` : "Add an employee"}
      footer={
        <div style={{ display: "flex", gap: "var(--s-3)", marginLeft: "auto" }}>
          <Button variant="quiet" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={() => void save()}>
            {employee ? "Save changes" : "Add employee"}
          </Button>
        </div>
      }
    >
      <form
        className="pp-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        {/* Non-field failures only — validation renders on the field (§09.3). */}
        {message && <p className="pp-form__error t-ui-sm" role="alert">{message}</p>}

        <Field
          label="Full name"
          required
          value={draft.full_name}
          error={fields.full_name}
          onChange={(e) => set("full_name", e.target.value)}
        />

        <div className="pp-form__row">
          <Field
            label="Email"
            type="email"
            required
            value={draft.email}
            error={fields.email}
            help="Also the sign-in address, so it has to be unique."
            onChange={(e) => set("email", e.target.value)}
          />
          <Field
            label="Phone"
            value={draft.phone}
            error={fields.phone}
            onChange={(e) => set("phone", e.target.value)}
          />
        </div>

        <p className="t-micro pp-form__legend">Employment</p>

        <div className="pp-form__row">
          <Field
            label="Date of joining"
            type="date"
            required
            value={draft.date_of_joining}
            error={fields.date_of_joining}
            onChange={(e) => set("date_of_joining", e.target.value)}
          />
          <Field
            label="Date of exit"
            type="date"
            value={draft.date_of_exit}
            error={fields.date_of_exit}
            help="Leave empty while employed — status follows this date."
            onChange={(e) => set("date_of_exit", e.target.value)}
          />
        </div>

        <div className="pp-form__row">
          <Select
            label="Employee type"
            value={draft.employee_type}
            error={fields.employee_type}
            options={EMPLOYEE_TYPES.map((t) => ({ value: t, label: humanise(t) }))}
            onChange={(e) => set("employee_type", e.target.value as EmployeeType)}
          />
          <Select
            label="Working schedule"
            value={draft.working_schedule_id}
            error={fields.working_schedule_id}
            options={options(reference.schedules, (s) => s.id, (s) => s.name, "Default")}
            onChange={(e) => set("working_schedule_id", e.target.value)}
          />
        </div>

        <div className="pp-form__row">
          <Select
            label="Department"
            value={draft.department_id}
            error={fields.department_id}
            options={options(reference.departments, (d) => d.id, (d) => d.name, "No department")}
            onChange={(e) => set("department_id", e.target.value)}
          />
          <Select
            label="Job position"
            value={draft.job_position_id}
            error={fields.job_position_id}
            options={options(reference.positions, (p) => p.id, (p) => p.title, "No position")}
            onChange={(e) => set("job_position_id", e.target.value)}
          />
        </div>

        <Select
          label="Manager"
          value={draft.manager_id}
          error={fields.manager_id}
          options={options(
            // Nobody reports to themselves; the server refuses it, so the
            // option is not offered in the first place.
            reference.managers.filter((m) => m.id !== employee?.id),
            (m) => m.id,
            (m) => m.full_name,
            "No manager",
          )}
          onChange={(e) => set("manager_id", e.target.value)}
        />

        <p className="t-micro pp-form__legend">Bank details · read by the payrun</p>

        <div className="pp-form__row">
          <Field
            label="Account number"
            value={draft.bank_account}
            error={fields.bank_account}
            onChange={(e) => set("bank_account", e.target.value)}
          />
          <Field
            label="IFSC"
            value={draft.bank_ifsc}
            error={fields.bank_ifsc}
            help="Four letters, a zero, then six — HDFC0001234."
            style={{ textTransform: "uppercase" }}
            onChange={(e) => set("bank_ifsc", e.target.value)}
          />
        </div>

        {/* Lets Enter submit without a second visible button. */}
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    </Drawer>
  );
}
