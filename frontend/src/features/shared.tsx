/**
 * THE PIECES EVERY FEATURE NEEDS, AND THE DESIGN SYSTEM SHOULD NOT OWN.
 *
 * These are domain shapes, not primitives. `Avatar` derives its initials from
 * a full name; `formatDate` refuses a locale-dependent numeric date because
 * `03/04` is two different days on two sides of a border; `LoadFailure` is the
 * one answer to "the read failed" so that seven screens cannot each invent a
 * different one. None of them belongs in `components/system`, and all of them
 * are needed by more than one feature — which is the whole reason this file
 * exists rather than a cross-feature import of somebody else's `parts.tsx`.
 */
import { useCallback } from "react";
import { NavLink, useSearchParams } from "react-router-dom";
import { WarningCard, Button, cx } from "@/components/system";
import { messageFor } from "@/api/errors";
import type { Employee } from "@/api/contract";

/** Two initials, from the first and last word of the name. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
}

export function Avatar({
  name,
  size = 36,
  inactive,
}: {
  name: string;
  size?: number;
  inactive?: boolean;
}) {
  return (
    <span
      className={cx("pp-avatar", inactive && "pp-avatar--inactive")}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
      aria-hidden="true"
    >
      {initialsOf(name)}
    </span>
  );
}

/** `FULL_TIME` → `Full time`. The enums are the contract; this is the label. */
export const humanise = (value: string): string =>
  value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, " ");

/** `2024-03-09` → `9 Mar 2024`. Never a locale-dependent numeric date. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export const jobLineOf = (e: Employee): string =>
  [e.job_title, e.department_name].filter(Boolean).join(" · ") || "Unassigned";

/**
 * The error state, once. A failed read is not a toast — the screen has no
 * content to sit behind one — so it renders as the warning card §09.9 defines,
 * including what it blocks.
 */
export function LoadFailure({
  what,
  error,
  onRetry,
}: {
  what: string;
  error: unknown;
  onRetry: () => void;
}) {
  return (
    <WarningCard
      severity="error"
      code="load_failed"
      detail={`${what} — ${messageFor(error)}`}
      blocks="Nothing on this screen can be trusted until it loads."
      action={
        <Button size="sm" variant="quiet" onClick={onRetry}>
          Try again
        </Button>
      }
    />
  );
}

/** Label / value, the read-only counterpart to `<Field>`. */
export function Pair({ k, v }: { k: string; v: React.ReactNode }) {
  const absent = v === null || v === undefined || v === "" || v === "—";
  return (
    <div className="pp-pair">
      <p className="t-micro pp-pair__k">{k}</p>
      <p className={cx("t-ui pp-pair__v", absent && "pp-pair__v--absent")}>
        {absent ? "Not recorded" : v}
      </p>
    </div>
  );
}

/* ── Sub-navigation ───────────────────────────────────────────────────── */

/**
 * A section with more than one screen needs a way between them, and the shell
 * deliberately has only six nav items (§11) — adding a seventh for
 * "allocations" would put a leaf of Leave at the same rank as Payroll.
 *
 * So sections navigate themselves, in the same material as the sidebar: flush
 * links, and the current one is a raised clay key. Same idea, one level down.
 */
export function SectionNav({
  items,
}: {
  items: Array<{ to: string; label: string; end?: boolean; count?: number }>;
}) {
  return (
    <nav className="pp-subnav" aria-label="Section">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) => cx("pp-subnav__item", isActive && "pp-subnav__item--active")}
        >
          {item.label}
          {item.count !== undefined && (
            <span className="pp-subnav__count t-micro">{item.count}</span>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

/* ── Numbers that are not money ───────────────────────────────────────── */

/**
 * The API sends day and hour counts as two-decimal strings for the same
 * reason it sends money that way. `"2.00"` is two days and should read as
 * `2`; `"2.50"` is a half day and must keep its half. Trailing zeros are
 * noise, a dropped `.5` is a wrong number.
 */
export function decimalLabel(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return n % 1 === 0 ? String(n) : n.toFixed(2).replace(/0$/, "");
}

export const daysLabel = (value: string | number, unit: "DAYS" | "HOURS" = "DAYS"): string => {
  const text = decimalLabel(value);
  const one = Number(value) === 1;
  return `${text} ${unit === "HOURS" ? (one ? "hour" : "hours") : one ? "day" : "days"}`;
};

/** `2026-08-14T09:12:00+05:30` → `09:12`. The date is the row; this is the clock. */
export function clockOf(timestamp: string | null | undefined): string {
  if (!timestamp) return "—";
  const m = /T(\d{2}:\d{2})/.exec(timestamp);
  return m ? m[1] : "—";
}

/** `09:00:00` → `09:00`. Schedule times carry seconds the UI never needs. */
export const hhmm = (time: string): string => time.slice(0, 5);

/* ── URL as filter state ──────────────────────────────────────────────── */

/**
 * Filters live in the URL on every list screen in this product. A filtered
 * list is a thing people send each other, and it survives a reload and the
 * back button for free — P5 established this on S2 and it is worth exactly
 * one shared writer rather than seven copies of the same twelve lines.
 */
export function useFilterParams() {
  const [params, setParams] = useSearchParams();

  const set = useCallback(
    (key: string, value: string | number | undefined) => {
      const next = new URLSearchParams(params);
      if (value === undefined || value === "") next.delete(key);
      else next.set(key, String(value));
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  const clear = useCallback(() => setParams({}, { replace: true }), [setParams]);

  const num = useCallback(
    (key: string): number | undefined => {
      const raw = params.get(key);
      if (!raw) return undefined;
      const n = Number(raw);
      return Number.isFinite(n) ? n : undefined;
    },
    [params],
  );

  return { params, set, clear, num, get: (k: string) => params.get(k) ?? undefined };
}
