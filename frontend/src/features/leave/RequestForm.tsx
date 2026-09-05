/**
 * FILING A REQUEST.
 *
 * The form's real job is to stop somebody filing something that will be
 * refused. It reads the balance the moment a person and a type are chosen and
 * says, before the dates are even set, how much is left — and once the dates
 * exist it says whether they fit.
 *
 * **The duration is not computed here.** §3.6 makes it schedule- and
 * holiday-aware, and the client holds neither the schedule nor the calendar.
 * Guessing it would produce a number that disagrees with the one the server
 * writes down — which is worse than showing no number at all, so the form
 * shows the calendar span and says plainly that the working-day count comes
 * back from the server.
 */
import { useEffect, useState } from "react";
import type { Employee, TimeOffRequest, TimeOffType } from "@/api/contract";
import { ApiError } from "@/api/errors";
import { useQuery, useSubmission } from "@/api/useQuery";
import { useAuth } from "@/auth/AuthContext";
import { Button, Drawer, Field, Select, Textarea, WarningCard, Well } from "@/components/system";
import { today } from "@/lib/clock";
import { decimalLabel } from "@/features/shared";
import { createRequest, getBalances } from "./api";
import { BalanceMeter } from "./BalanceMeter";

export function RequestForm({
  open,
  employees,
  types,
  onClose,
  onSaved,
}: {
  open: boolean;
  employees: Employee[];
  types: TimeOffType[];
  onClose: () => void;
  onSaved: (created: TimeOffRequest) => void;
}) {
  const { user } = useAuth();
  const form = useSubmission();

  const [employeeId, setEmployeeId] = useState("");
  const [typeId, setTypeId] = useState("");
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [hours, setHours] = useState("8");
  const [reason, setReason] = useState("");
  const [refusal, setRefusal] = useState<string>();

  /** An employee files for themselves; the field is not even offered. */
  const self = user?.role === "EMPLOYEE";
  const subject = self ? String(user?.employee_id ?? "") : employeeId;

  useEffect(() => {
    if (!open) return;
    setRefusal(undefined);
    form.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const balances = useQuery(
    () => (subject === "" ? Promise.resolve(null) : getBalances(Number(subject))),
    [subject],
  );

  const type = types.find((t) => String(t.id) === typeId);
  const balance = balances.data?.find((b) => String(b.time_off_type_id) === typeId);

  const span =
    from && to && to >= from
      ? Math.round(
          (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000,
        ) + 1
      : 0;

  async function save() {
    setRefusal(undefined);
    let created: TimeOffRequest | undefined;
    const ok = await form.submit(async () => {
      try {
        created = await createRequest({
          employee_id: Number(subject),
          time_off_type_id: Number(typeId),
          date_from: from,
          date_to: to,
          reason: reason.trim() === "" ? null : reason.trim(),
          ...(type?.unit === "HOURS" ? { hours: Number(hours) } : {}),
        });
      } catch (cause) {
        // Overlaps and all-weekend ranges are 422 business rules with their
        // own sentences, not field errors — they concern the request as a
        // whole rather than one input.
        if (cause instanceof ApiError && !cause.isValidation) {
          setRefusal(cause.message);
          return;
        }
        throw cause;
      }
    });
    if (ok && created) onSaved(created);
  }

  const ready = subject !== "" && typeId !== "" && from !== "" && to >= from;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Request time off"
      wide
      footer={
        <div className="pp-form__row" style={{ justifyContent: "flex-end" }}>
          <Button variant="quiet" onClick={onClose} disabled={form.busy}>Cancel</Button>
          <Button variant="primary" loading={form.busy} disabled={!ready} onClick={save}>
            File request
          </Button>
        </div>
      }
    >
      {refusal && (
        <div style={{ marginBottom: "var(--s-4)" }}>
          <WarningCard
            severity="warning"
            code="REQUEST_REFUSED"
            detail={refusal}
            blocks="Nothing was filed."
          />
        </div>
      )}

      {form.message && <p className="pp-form__error t-ui-sm" role="alert">{form.message}</p>}

      <div className="pp-lv__drawer">
        <div className="pp-form">
          {!self && (
            <Select
              label="Employee"
              required
              error={form.fields.employee_id}
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              options={[
                { value: "", label: "Choose a person" },
                ...employees.map((e) => ({ value: String(e.id), label: e.full_name })),
              ]}
            />
          )}

          <Select
            label="Leave type"
            required
            error={form.fields.time_off_type_id}
            value={typeId}
            onChange={(e) => setTypeId(e.target.value)}
            options={[
              { value: "", label: "Choose a type" },
              ...types.map((t) => ({
                value: String(t.id),
                label: `${t.name}${t.is_paid ? "" : " · unpaid"}`,
              })),
            ]}
            help={
              type && !type.is_paid
                ? "Unpaid leave reaches payroll as loss of pay — the payslip's LWP line."
                : undefined
            }
          />

          <div className="pp-form__row">
            <Field
              label="From"
              type="date"
              required
              error={form.fields.date_from}
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                if (to < e.target.value) setTo(e.target.value);
              }}
            />
            <Field
              label="To"
              type="date"
              min={from || undefined}
              error={form.fields.date_to}
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>

          {type?.unit === "HOURS" && (
            <Field
              label="Hours"
              type="number"
              min={0.5}
              step={0.5}
              required
              help="An hours-based type is filed in hours and recorded in days, so one number reaches payroll."
              error={form.fields.hours}
              value={hours}
              onChange={(e) => setHours(e.target.value)}
            />
          )}

          <Textarea
            label="Reason"
            rows={3}
            error={form.fields.reason}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />

          {span > 0 && type?.unit !== "HOURS" && (
            <Well style={{ padding: "var(--s-4)" }}>
              <p className="t-micro" style={{ margin: 0, color: "var(--ink-400)" }}>
                {span} CALENDAR {span === 1 ? "DAY" : "DAYS"}
              </p>
              <p className="t-ui-sm" style={{ margin: "var(--s-2) 0 0", color: "var(--ink-500)" }}>
                Weekends, days this employee's schedule does not cover, and
                public holidays are not deducted — a Friday-to-Monday request
                on a five-day week costs two days, not four. The exact figure
                comes back from the server when the request is filed.
              </p>
            </Well>
          )}
        </div>

        <aside aria-label="Balance">
          {balance ? (
            <>
              <BalanceMeter balance={balance} />
              {span > 0 && Number(balance.remaining) < 1 && (
                <p className="t-ui-sm" style={{ color: "var(--vermilion-500)" }}>
                  There is nothing left in this balance. The request can be
                  filed, but approval will be refused until more is allocated.
                </p>
              )}
            </>
          ) : typeId === "" ? (
            <p className="t-ui-sm" style={{ color: "var(--ink-400)" }}>
              Pick a leave type to see what is left in it.
            </p>
          ) : (
            <p className="t-ui-sm" style={{ color: "var(--ink-400)" }}>
              {type?.requires_allocation
                ? "No allocation on record for this type, so approval will be refused until one exists."
                : "This type needs no allocation — there is no balance to spend."}
            </p>
          )}

          {balance && (
            <p className="t-micro" style={{ color: "var(--ink-400)" }}>
              VALID {decimalLabel(balance.allocated)} DAYS · {balance.validity_from ?? "—"} →{" "}
              {balance.validity_to ?? "—"}
            </p>
          )}
        </aside>
      </div>
    </Drawer>
  );
}
