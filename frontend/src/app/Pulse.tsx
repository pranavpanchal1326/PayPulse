/**
 * THE PULSE · blueprint §08.2
 *
 * The product is called PayPulse, so give it one. The beat is derived from the
 * payroll cycle: slow early in the period, quickening as `period_end`
 * approaches. It is not decoration — it is the cycle made perceptible, and
 * hovering it says how many days are left.
 *
 * Silent, and it stops entirely under prefers-reduced-motion.
 */
import { useEffect, useMemo, useState } from "react";
import { Tooltip } from "@/components/system";

function daysLeftInPeriod(now = new Date()) {
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const total = end.getDate();
  const left = total - now.getDate();
  return { left, total };
}

export function Pulse() {
  const [now, setNow] = useState(() => new Date());

  // The date only matters to the day; re-checking hourly is plenty.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const { left, total } = useMemo(() => daysLeftInPeriod(now), [now]);

  // 2.4s at the start of the period down to 0.8s on the last day.
  const progress = 1 - left / total;
  const period = 2.4 - progress * 1.6;

  return (
    <Tooltip
      label={
        left === 0
          ? "Period ends today"
          : `${left} ${left === 1 ? "day" : "days"} left in the period`
      }
    >
      <span
        className="pp-pulse"
        style={{ animationDuration: `${period.toFixed(2)}s` }}
        aria-hidden="true"
      />
    </Tooltip>
  );
}
