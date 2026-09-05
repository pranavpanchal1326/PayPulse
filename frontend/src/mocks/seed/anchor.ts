/**
 * THE ANCHOR — the one knob the whole dataset hangs from.
 *
 * Payroll runs in arrears: on the fifth of September you are paying August.
 * So the *open* payrun is the month before the anchor, six closed ones sit
 * behind it, and the trend chart has six real points on first load (PRD §9).
 *
 * **Why a constant and not `new Date()`.** Deriving from the wall clock would
 * make the fixtures drift under the developer, and PRD §9's promise is that
 * every run is byte-identical — a payslip screenshotted in P11 has to still be
 * that payslip in P15. Re-basing the whole dataset is a one-line edit here.
 */
import { addMonths, monthEnd, monthStart, type ISODate, type ISOMonth } from "./calendar";

/** Change this and every date in the fixtures moves with it. */
export const ANCHOR_TODAY: ISODate = "2026-09-05";

/** The period being worked on: the month that has just closed. */
export const OPEN_PERIOD: ISOMonth = addMonths(ANCHOR_TODAY.slice(0, 7), -1);

/** Six closed periods behind the open one, oldest first. */
export const CLOSED_PERIODS: ISOMonth[] = Array.from({ length: 6 }, (_, i) =>
  addMonths(OPEN_PERIOD, i - 6),
);

/** All seven, oldest first — the months payruns exist for. */
export const ALL_PERIODS: ISOMonth[] = [...CLOSED_PERIODS, OPEN_PERIOD];

/**
 * Attendance spans every seeded period, so no payrun is computed against a
 * month with no attendance at all — that would make the oldest point on the
 * trend chart an outlier for a reason no screen could explain.
 */
export const ATTENDANCE_FROM: ISODate = monthStart(ALL_PERIODS[0]);
export const ATTENDANCE_TO: ISODate = monthEnd(OPEN_PERIOD);

/** Everything money-bearing in the fixtures. PRD §3.2 defaults to INR. */
export const CURRENCY = "INR";
