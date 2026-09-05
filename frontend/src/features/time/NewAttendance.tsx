/**
 * ADDING A ROW BY HAND.
 *
 * A drawer, not a modal: this creates a record rather than altering one, so
 * §09.6's rule puts it beside the list rather than on top of it. The audited
 * change is the *correction* (S7), and only that.
 *
 * The duplicate is the interesting failure. One person can have at most one
 * attendance row per day, and the server answers 409 with the date in the
 * sentence — so the form surfaces it where the date field is, rather than as
 * a generic conflict.
 */
import { useEffect, useState } from "react";
import type { Employee } from "@/api/contract";
import { ApiError } from "@/api/errors";
import { useSubmission } from "@/api/useQuery";
import { Button, Drawer, Field, Select, WarningCard, useToast } from "@/components/system";
import { ANCHOR_TODAY } from "@/mocks/seed/anchor";
import { IST_OFFSET } from "@/mocks/seed/calendar";
import { createAttendance } from "./api";

export function NewAttendance({
  open,
  employees,
  onClose,
  onSaved,
}: {
  open: boolean;
  employees: Employee[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const form = useSubmission();
  const [employeeId, setEmployeeId] = useState("");
  const [date, setDate] = useState(ANCHOR_TODAY);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("18:00");
  const [breakMinutes, setBreakMinutes] = useState(60);
  const [conflict, setConflict] = useState<string>();

  useEffect(() => {
    if (!open) return;
    setConflict(undefined);
    form.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /**
   * Times go on the wire as timestamps in the schedule's zone (`Asia/Kolkata`,
   * PRD §5). Building them here rather than sending bare clock strings keeps
   * the client honest about what it is actually asserting: a moment, not a
   * time-of-day floating free of a date.
   */
  const stamp = (clock: string) => `${date}T${clock}:00${IST_OFFSET}`;

  async function save() {
    setConflict(undefined);
    const ok = await form.submit(async () => {
      try {
        await createAttendance({
          employee_id: Number(employeeId),
          work_date: date,
          check_in: stamp(start),
          check_out: end === "" ? null : stamp(end),
          break_minutes: breakMinutes,
        });
      } catch (cause) {
        if (cause instanceof ApiError && cause.status === 409) {
          setConflict(cause.message);
          return;
        }
        throw cause;
      }
    });
    if (ok && !conflict) {
      toast("Attendance recorded.", "jade");
      onSaved();
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Record attendance"
      footer={
        <div className="pp-form__row" style={{ justifyContent: "flex-end" }}>
          <Button variant="quiet" onClick={onClose} disabled={form.busy}>Cancel</Button>
          <Button
            variant="primary"
            loading={form.busy}
            disabled={employeeId === "" || start === ""}
            onClick={save}
          >
            Record
          </Button>
        </div>
      }
    >
      {conflict && (
        <div style={{ marginBottom: "var(--s-4)" }}>
          <WarningCard
            severity="warning"
            code="DUPLICATE_DAY"
            detail={conflict}
            blocks="Nothing was recorded. Correct the existing row instead — that keeps the edit audited."
          />
        </div>
      )}

      {form.message && <p className="pp-form__error t-ui-sm" role="alert">{form.message}</p>}

      <div className="pp-form">
        <Select
          label="Employee"
          required
          error={form.fields.employee_id}
          value={employeeId}
          onChange={(e) => setEmployeeId(e.target.value)}
          options={[
            { value: "", label: "Choose a person" },
            ...employees.map((e) => ({
              value: String(e.id),
              label: `${e.full_name} · ${e.employee_number}`,
            })),
          ]}
        />
        <Field
          label="Date"
          type="date"
          required
          error={form.fields.work_date}
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <div className="pp-form__row">
          <Field
            label="Check in"
            type="time"
            required
            error={form.fields.check_in}
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
          <Field
            label="Check out"
            type="time"
            help="Empty leaves the row open — it will read as a missing check-out."
            error={form.fields.check_out}
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
          <Field
            label="Break (min)"
            type="number"
            min={0}
            max={480}
            step={5}
            value={breakMinutes}
            onChange={(e) => setBreakMinutes(Number(e.target.value) || 0)}
          />
        </div>
        <p className="t-ui-sm" style={{ color: "var(--ink-400)", margin: 0 }}>
          Worked and overtime hours are computed by the server from these times
          and the employee's schedule. They are never entered by hand.
        </p>
      </div>
    </Drawer>
  );
}
