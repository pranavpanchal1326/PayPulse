/**
 * S7 · THE CORRECTION DIALOG
 *
 * A modal, and one of only three in the product. §09.6 reserves modals for
 * irreversible actions requiring a typed reason, and this is exactly that: an
 * attendance row is what a payslip's `worked_days` is made of, so editing one
 * quietly moves somebody's pay. PRD §3.4 makes `edit_reason` mandatory and
 * `is_manual_edit` permanent.
 *
 * **Before and after, side by side.** Two inset wells, and only the values
 * that actually differ are drawn in orange. Showing everything in orange —
 * the easy version — would make the diff useless: the whole point is that the
 * eye lands on the one field that moved.
 *
 * The derived figures are shown *as they will be*, computed the way the server
 * computes them, because "check-out moved by 40 minutes" is not what anybody
 * needs to know. What they need to know is that worked hours drop from 8.5 to
 * 7.83 and the row stops being overtime.
 */
import { useEffect, useMemo, useState } from "react";
import type { Attendance } from "@/api/contract";
import { useSubmission } from "@/api/useQuery";
import { Button, Field, Modal, Textarea, cx, useToast } from "@/components/system";
import { clockOf, decimalLabel } from "@/features/shared";
import { editAttendance } from "./api";

/** PRD §3.4's own threshold — the server asks for "a few words". */
const MIN_REASON = 8;

interface Draft {
  check_in: string;
  check_out: string;
  break_minutes: number;
}

const draftOf = (row: Attendance): Draft => ({
  check_in: clockOf(row.check_in),
  check_out: row.check_out ? clockOf(row.check_out) : "",
  break_minutes: row.break_minutes,
});

/** Replace the clock inside an ISO timestamp, keeping its date and offset. */
function withClock(timestamp: string, hhmm: string): string {
  return timestamp.replace(/T\d{2}:\d{2}/, `T${hhmm}`);
}

/**
 * The server's arithmetic, mirrored for the preview only. A night shift ends
 * the next morning, so a check-out earlier on the clock than the check-in is
 * a wrap rather than a negative day.
 */
function workedHours(draft: Draft): number | null {
  if (!draft.check_out) return null;
  const [h1, m1] = draft.check_in.split(":").map(Number);
  const [h2, m2] = draft.check_out.split(":").map(Number);
  if ([h1, m1, h2, m2].some((n) => !Number.isFinite(n))) return null;
  const start = h1 * 60 + m1;
  const end = h2 * 60 + m2;
  const span = (end >= start ? end - start : 1440 - start + end) - draft.break_minutes;
  return Math.max(0, span) / 60;
}

export function Correction({
  row,
  dailyHours,
  onClose,
  onSaved,
}: {
  row: Attendance | undefined;
  /** From the employee's schedule — what counts as overtime past. */
  dailyHours: number;
  onClose: () => void;
  onSaved: (updated: Attendance) => void;
}) {
  const toast = useToast();
  const form = useSubmission();
  const [draft, setDraft] = useState<Draft>(() => (row ? draftOf(row) : { check_in: "", check_out: "", break_minutes: 0 }));
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!row) return;
    setDraft(draftOf(row));
    setReason("");
    form.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row?.id]);

  const before = useMemo(() => (row ? draftOf(row) : null), [row]);
  const after = draft;

  const projected = workedHours(after);
  const projectedOvertime = projected === null ? null : Math.max(0, projected - dailyHours);

  /**
   * The key stays disabled until the reason has content — §12 S7 states it,
   * and it is the difference between a required field and a *refusal to
   * proceed without one*. The user should never be able to press the button
   * and be told no.
   */
  const reasonOk = reason.trim().length >= MIN_REASON;
  const timesOk = after.check_in !== "";
  const changed =
    before !== null &&
    (before.check_in !== after.check_in ||
      before.check_out !== after.check_out ||
      before.break_minutes !== after.break_minutes);

  async function save() {
    if (!row) return;
    const ok = await form.submit(async () => {
      const updated = await editAttendance(row.id, {
        check_in: withClock(row.check_in, after.check_in),
        check_out:
          after.check_out === ""
            ? null
            : withClock(row.check_out ?? row.check_in, after.check_out),
        break_minutes: after.break_minutes,
        edit_reason: reason.trim(),
      });
      onSaved(updated);
    });
    if (ok) {
      toast("Attendance corrected. The row is marked as a manual edit.", "jade");
      onClose();
    }
  }

  return (
    <Modal
      open={row !== undefined}
      onClose={onClose}
      title="Correct this attendance row"
      description={
        row
          ? `${row.employee_name} · ${row.work_date}. This edit is permanent, attributed to you, and shown on every screen that reads this row.`
          : undefined
      }
      footer={
        <>
          <Button variant="quiet" onClick={onClose} disabled={form.busy}>Cancel</Button>
          <Button
            variant="primary"
            loading={form.busy}
            disabled={!reasonOk || !timesOk || !changed}
            onClick={save}
          >
            Save correction
          </Button>
        </>
      }
    >
      {row && before && (
        <>
          <div className="pp-diff">
            <section className="pp-diff__side" aria-label="Before">
              <p className="t-micro pp-diff__label">BEFORE</p>
              <DiffRow k="Check in" v={before.check_in} />
              <DiffRow k="Check out" v={before.check_out || "— missing —"} />
              <DiffRow k="Break" v={`${before.break_minutes} min`} />
              <DiffRow k="Worked" v={`${decimalLabel(row.worked_hours)} h`} />
              <DiffRow k="Overtime" v={`${decimalLabel(row.overtime_hours)} h`} />
            </section>

            <section className="pp-diff__side" aria-label="After">
              <p className="t-micro pp-diff__label">AFTER</p>
              <DiffRow k="Check in" v={after.check_in} changed={before.check_in !== after.check_in} />
              <DiffRow
                k="Check out"
                v={after.check_out || "— missing —"}
                changed={before.check_out !== after.check_out}
              />
              <DiffRow
                k="Break"
                v={`${after.break_minutes} min`}
                changed={before.break_minutes !== after.break_minutes}
              />
              <DiffRow
                k="Worked"
                v={projected === null ? "—" : `${projected.toFixed(2)} h`}
                changed={projected !== null && projected.toFixed(2) !== Number(row.worked_hours).toFixed(2)}
              />
              <DiffRow
                k="Overtime"
                v={projectedOvertime === null ? "—" : `${projectedOvertime.toFixed(2)} h`}
                changed={
                  projectedOvertime !== null &&
                  projectedOvertime.toFixed(2) !== Number(row.overtime_hours).toFixed(2)
                }
              />
            </section>
          </div>

          <p className="t-ui-sm pp-diff__note">
            Worked and overtime are computed by the server from the times and
            the schedule. The figures above are this screen's preview of that
            arithmetic — the saved row carries the server's answer.
          </p>

          <div className="pp-form" style={{ marginTop: "var(--s-5)" }}>
            <div className="pp-form__row">
              <Field
                label="Check in"
                type="time"
                required
                error={form.fields.check_in}
                value={after.check_in}
                onChange={(e) => setDraft((d) => ({ ...d, check_in: e.target.value }))}
              />
              <Field
                label="Check out"
                type="time"
                help="Leave empty to keep the row as a missing check-out."
                error={form.fields.check_out}
                value={after.check_out}
                onChange={(e) => setDraft((d) => ({ ...d, check_out: e.target.value }))}
              />
              <Field
                label="Break (min)"
                type="number"
                min={0}
                max={480}
                step={5}
                error={form.fields.break_minutes}
                value={after.break_minutes}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, break_minutes: Number(e.target.value) || 0 }))
                }
              />
            </div>

            <Textarea
              label="Reason for the correction"
              required
              rows={2}
              placeholder="Badge reader was offline; times confirmed with the floor supervisor."
              error={form.fields.edit_reason}
              help={
                reasonOk
                  ? "This is stored with the row and shown wherever it appears."
                  : `A few words, so the change can be accounted for (at least ${MIN_REASON} characters).`
              }
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          {form.message && <p className="pp-form__error t-ui-sm" role="alert">{form.message}</p>}
        </>
      )}
    </Modal>
  );
}

function DiffRow({ k, v, changed }: { k: string; v: string; changed?: boolean }) {
  return (
    <div className="pp-diff__row">
      <span className="t-ui-sm pp-diff__k">{k}</span>
      <span className={cx("t-ui pp-diff__v", changed && "pp-diff__v--changed")}>{v}</span>
    </div>
  );
}
