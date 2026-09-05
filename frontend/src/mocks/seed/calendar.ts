/**
 * DATES AND DAY COUNTING — a mirror of PRD §4.2.
 *
 * The backend's `services/calendar.py` is the single source of truth; this is
 * the fixture-side copy, and it exists so the seeded payslips carry day counts
 * that actually satisfy the §4.2 invariant rather than plausible-looking
 * numbers. A payslip whose `contract_days != payable_days + unpaid_days` would
 * make the "Why this number?" panel (P4) impossible to design honestly.
 *
 * Everything here works on `YYYY-MM-DD` strings and UTC-noon `Date` objects.
 * Noon, not midnight: a date built at midnight and formatted through a
 * local-time getter lands on the previous day for anyone west of UTC, which is
 * the classic off-by-one that makes a payroll period 30 days on one machine
 * and 31 on another.
 */

/** `YYYY-MM-DD`. */
export type ISODate = string;

const DAY_MS = 86_400_000;

export function parseDate(iso: ISODate): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

export function formatDate(date: Date): ISODate {
  return date.toISOString().slice(0, 10);
}

export const addDays = (iso: ISODate, n: number): ISODate =>
  formatDate(new Date(parseDate(iso).getTime() + n * DAY_MS));

/** Monday is 0, to match `working_schedule_line.day_of_week` (PRD §3.1). */
export const dayOfWeek = (iso: ISODate): number => (parseDate(iso).getUTCDay() + 6) % 7;

export const daysBetween = (from: ISODate, to: ISODate): number =>
  Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / DAY_MS);

/** Inclusive at both ends, like every period in this product. */
export function eachDay(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export const isBetween = (iso: ISODate, from: ISODate, to: ISODate): boolean =>
  iso >= from && iso <= to;

/* ── Months ──────────────────────────────────────────────────────────── */

/** `YYYY-MM`. */
export type ISOMonth = string;

export const monthOf = (iso: ISODate): ISOMonth => iso.slice(0, 7);

export function monthStart(month: ISOMonth): ISODate {
  return `${month}-01`;
}

export function monthEnd(month: ISOMonth): ISODate {
  const [y, m] = month.split("-").map(Number);
  return formatDate(new Date(Date.UTC(y, m, 0, 12)));
}

/** `addMonths("2026-08", -6)` → `"2026-02"`. */
export function addMonths(month: ISOMonth, n: number): ISOMonth {
  const [y, m] = month.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${String(Math.floor(total / 12)).padStart(4, "0")}-${String((total % 12) + 1).padStart(2, "0")}`;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function monthLabel(month: ISOMonth): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

/* ── Timestamps ──────────────────────────────────────────────────────── */

/**
 * `Asia/Kolkata` is UTC+05:30 year-round — India has no daylight saving — so
 * the offset can be a literal. Fixtures carry the offset explicitly because
 * the client renders in IST (PRD §5) and a naive timestamp would be read as
 * UTC and drawn five and a half hours early.
 */
export const IST_OFFSET = "+05:30";

/** `at("2026-08-03", "09:15")` → `"2026-08-03T09:15:00+05:30"`. */
export function at(date: ISODate, time: string, plusDays = 0): string {
  const d = plusDays ? addDays(date, plusDays) : date;
  const [h, m] = time.split(":");
  return `${d}T${h.padStart(2, "0")}:${m.padStart(2, "0")}:00${IST_OFFSET}`;
}

/** Minutes since midnight — the unit all shift arithmetic happens in. */
export const minutesOf = (time: string): number => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};

export const timeOf = (minutes: number): string => {
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(wrapped / 60)).padStart(2, "0")}:${String(wrapped % 60).padStart(2, "0")}`;
};

/**
 * Shift length in minutes, midnight-crossing included.
 *
 * PRD §3.4(2): a 22:00 → 06:00 shift is eight hours, not minus sixteen. This
 * is the single line that proves it, and the night schedule exists in the
 * fixtures purely so the UI has to face it.
 */
export function shiftMinutes(start: string, end: string, breakMinutes = 0): number {
  const s = minutesOf(start);
  const e = minutesOf(end);
  return (e > s ? e - s : e + 1440 - s) - breakMinutes;
}

export const crossesMidnight = (start: string, end: string): boolean =>
  minutesOf(end) <= minutesOf(start);

/** Two decimals, as a string — the wire format for `NUMERIC(5,2)`. */
export const decimal = (n: number): string => n.toFixed(2);
