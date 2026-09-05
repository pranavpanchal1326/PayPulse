/**
 * THE REAL CLOCK.
 *
 * These used to come from `mocks/seed/anchor`, where `ANCHOR_TODAY` is a fixed
 * string. That is correct for fixtures — a generated dataset has to be
 * reproducible — and wrong for the running product, where it silently freezes
 * the app at a date in the past: "today" on the attendance form, the default
 * payroll period, and the year an allocation belongs to all stop moving.
 *
 * **Computed in the company timezone, not the browser's.** The backend buckets
 * every date in `APP_TIMEZONE` (Asia/Kolkata) — a 20:30 UTC check-in is the
 * next calendar day there. A browser in another zone that used its own local
 * date would disagree with the server about which day it is, which is a bug
 * you only see near midnight and never reproduce.
 */
import { addMonths, monthOf, type ISODate, type ISOMonth } from "./date";

/** The company's operating timezone. Must match the backend's APP_TIMEZONE. */
export const COMPANY_TIMEZONE = "Asia/Kolkata";

/** Today, as the company reckons it. */
export function today(): ISODate {
  // "en-CA" formats as YYYY-MM-DD, which is exactly the ISODate shape.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: COMPANY_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** The calendar month we are currently in. */
export const currentMonth = (): ISOMonth => monthOf(today());

/**
 * The period payroll is working on.
 *
 * Payroll runs in arrears: in September you are paying August. So the open
 * period is the month that has just closed, not the one in progress.
 */
export const openPeriod = (): ISOMonth => addMonths(currentMonth(), -1);

/** First and last day of the calendar year containing `on` (default today). */
export const yearStart = (on: ISODate = today()): ISODate => `${on.slice(0, 4)}-01-01`;
export const yearEnd = (on: ISODate = today()): ISODate => `${on.slice(0, 4)}-12-31`;
