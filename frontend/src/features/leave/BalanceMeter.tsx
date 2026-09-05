/**
 * THE BALANCE METER · §S11
 *
 * Four segments — allocated, taken, pending, remaining — sized proportionally,
 * so the shape *is* the data. Its job is a warning, and the warning has to
 * arrive **before** the wall: §3.6 makes approval past `remaining` a hard 422,
 * so a UI that only reports the refusal has already walked somebody into it.
 *
 * Two things follow, and both are the point of the component.
 *
 * **`pending` is drawn.** It closes v1's gap where an employee could stack
 * requests past their balance with no signal at all. A pending segment is
 * leave that is *going* to be taken; leaving it out would make a balance look
 * healthy right up to the moment three approvals land at once.
 *
 * **Remaining turns orange under two days**, per §12 S11 — while there is
 * still time to allocate more, not after the request has been refused.
 */
import type { LeaveBalance } from "@/api/contract";
import { Meter, cx, type MeterSegment } from "@/components/system";
import { RollingCount } from "@/components/signature";
import { decimalLabel } from "@/features/shared";

/** §12 S11's own threshold. */
export const LOW_REMAINING = 2;

/**
 * `allocated` is the *total*, so drawing it as a fourth segment beside its own
 * parts would double the bar. The segments are what the total is made of:
 * taken, pending, and what is left.
 */
export function segmentsOf(balance: LeaveBalance): MeterSegment[] {
  const taken = Number(balance.taken);
  const pending = Number(balance.pending);
  const remaining = Number(balance.remaining);
  const low = remaining < LOW_REMAINING;

  return [
    { value: taken, label: "taken", color: "var(--ink-700)", ink: "var(--bone-50)" },
    { value: pending, label: "pending", color: "var(--cobalt-500)", ink: "var(--on-solid)" },
    {
      value: Math.max(0, remaining),
      label: "remaining",
      color: low ? "var(--orange-500)" : "var(--jade-500)",
      ink: "var(--on-solid)",
    },
  ].filter((s) => s.value > 0);
}

export function BalanceMeter({
  balance,
  compact,
}: {
  balance: LeaveBalance;
  compact?: boolean;
}) {
  const remaining = Number(balance.remaining);
  const low = remaining < LOW_REMAINING;
  const unit = balance.unit === "HOURS" ? "hours" : "days";
  const segments = segmentsOf(balance);

  return (
    <section className={cx("pp-bal", compact && "pp-bal--compact")} aria-label={balance.type_name}>
      <header className="pp-bal__head">
        <span className="t-ui pp-bal__name">
          {balance.type_name}
          {!balance.is_paid && <span className="pp-bal__unpaid t-micro">UNPAID</span>}
        </span>
        <span className={cx("pp-bal__figure", low && "pp-bal__figure--low")}>
          {/* Rolls when an approval lands — the beat §S8 asks for. */}
          <RollingCount
            value={remaining}
            scale={compact ? "m" : "l"}
            label={`${balance.type_name} remaining`}
          />
          <span className="t-micro"> {unit.toUpperCase()} LEFT</span>
        </span>
      </header>

      {segments.length > 0 ? (
        <Meter
          label={`${balance.type_name} balance`}
          segments={segments}
        />
      ) : (
        /* An allocation of zero is not a broken meter — it is a type this
           person has never been given. The well keeps its shape (§14). */
        <p className="pp-bal__none t-micro">NOTHING ALLOCATED</p>
      )}

      <dl className="pp-bal__legend">
        <Leg k="Allocated" v={decimalLabel(balance.allocated)} />
        <Leg k="Taken" v={decimalLabel(balance.taken)} tone="ink" />
        <Leg k="Pending" v={decimalLabel(balance.pending)} tone="cobalt" />
        <Leg k="Remaining" v={decimalLabel(balance.remaining)} tone={low ? "orange" : "jade"} />
      </dl>

      {low && (
        <p className="pp-bal__warn t-ui-sm">
          Under {LOW_REMAINING} {unit} left. A request longer than this will be
          refused at approval — allocate more first.
        </p>
      )}
    </section>
  );
}

function Leg({ k, v, tone }: { k: string; v: string; tone?: "ink" | "cobalt" | "jade" | "orange" }) {
  return (
    <div className="pp-bal__leg">
      <dt className="t-micro">
        {tone && <i className={`pp-bal__swatch pp-bal__swatch--${tone}`} aria-hidden="true" />}
        {k}
      </dt>
      <dd className="t-ui-sm">{v}</dd>
    </div>
  );
}
