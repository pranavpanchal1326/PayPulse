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

/**
 * `on` is the punch state, not a connection state. When the clock is closed
 * the light does not beat and it does not stay green — a dead light is the
 * honest drawing of "you are not working right now", and green that never
 * changes is decoration.
 */
export function Pulse({ on = true }: { on?: boolean }) {
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
        on
          ? left === 0
            ? "On the clock · period ends today"
            : `On the clock · ${left} ${left === 1 ? "day" : "days"} left in the period`
          : "Not on the clock — check in from the top bar"
      }
    >
      <span
        className={on ? "pp-pulse" : "pp-pulse pp-pulse--off"}
        style={on ? { animationDuration: `${period.toFixed(2)}s` } : undefined}
        aria-hidden="true"
      />
    </Tooltip>
  );
}
