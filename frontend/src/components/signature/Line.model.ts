/**
 * BUILDING THE LINE'S MODEL
 *
 * `Line.tsx` draws; this decides what there is to draw. The split matters
 * because the line appears in four places (the hero, the employee page, the
 * payrun header, the landing page) over four different slices of data, and
 * the drawing must not know which one it is looking at.
 *
 * The rule this file exists to enforce: **a day with no attendance row
 * produces no tick.** Not a grey tick, not a zero-height tick — nothing.
 * §10.1 renders leave as a gap because the PRD models absence as the absence
 * of a row (§3.4), and the moment this function starts emitting a mark for
 * "nothing happened", the picture stops agreeing with the database.
 */
import type { Attendance, Contract, PublicHoliday } from "@/api/contract";
import { monthEnd, monthLabel, monthOf, type ISODate } from "@/lib/date";
import type { LineBand, LineBoundary, LineModel, LineTick } from "./Line";

export interface LineSources {
  from: ISODate;
  to: ISODate;
  /** The date the bead sits on — decides which band reads as active. */
  activeOn: ISODate;
  contracts: Contract[];
  attendances: Attendance[];
  holidays: PublicHoliday[];
  /**
   * Period ends. Passed in rather than derived, because "the period" is a
   * payrun's business decision — most are calendar months, and one day one
   * will not be.
   */
  periodEnds?: ISODate[];
}

const within = (date: ISODate, from: ISODate, to: ISODate) => date >= from && date <= to;

export function buildLineModel({
  from,
  to,
  activeOn,
  contracts,
  attendances,
  holidays,
  periodEnds,
}: LineSources): LineModel {
  const bands: LineBand[] = contracts
    // A cancelled contract is not a period of employment; it is a mistake that
    // was withdrawn, and drawing it would put a band on the line for a job
    // nobody ever held.
    .filter((c) => c.state !== "CANCELLED")
    .filter((c) => c.date_start <= to && (c.date_end === null || c.date_end >= from))
    .map((c) => ({
      id: c.id,
      from: c.date_start < from ? from : c.date_start,
      to: c.date_end === null || c.date_end > to ? to : c.date_end,
      label: c.name,
      active:
        c.state === "RUNNING" &&
        c.date_start <= activeOn &&
        (c.date_end === null || c.date_end >= activeOn),
    }));

  const ticks: LineTick[] = [];

  for (const row of attendances) {
    if (!within(row.work_date, from, to)) continue;

    // Every day with a row gets its tick below the line.
    ticks.push({
      date: row.work_date,
      kind: row.status === "MISSING_CHECKOUT" ? "missing" : "present",
    });

    /**
     * Overtime is an **additional** mark extending above the track, not a
     * different colour for the day tick. §10.1: *"tick extends above the
     * line — excess hours."* A day with overtime is still a day worked, and
     * replacing its tick would lose that: the line would show fewer worked
     * days than the payslip counted.
     */
    if (Number(row.overtime_hours) > 0) {
      ticks.push({ date: row.work_date, kind: "overtime" });
    }
  }

  /**
   * Holidays are drawn even though they are not worked days, because the gap
   * they leave in the ticks would otherwise be indistinguishable from leave —
   * and "you were off because the office was shut" is a different fact from
   * "you took a day".
   */
  const dated = new Set(ticks.map((t) => t.date));
  for (const holiday of holidays) {
    if (!within(holiday.date, from, to)) continue;
    if (dated.has(holiday.date)) continue; // someone worked it; that tick wins
    ticks.push({ date: holiday.date, kind: "holiday" });
  }

  const ends = periodEnds ?? monthEndsBetween(from, to);
  const boundaries: LineBoundary[] = ends
    .filter((d) => within(d, from, to))
    .map((d) => ({ date: d, label: monthLabel(monthOf(d)).slice(0, 3) }));

  return { from, to, bands, ticks, boundaries };
}

/** Every calendar month end inside the window, oldest first. */
function monthEndsBetween(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  let month = monthOf(from);
  for (let guard = 0; guard < 240; guard++) {
    const end = monthEnd(month);
    if (end > to) break;
    if (end >= from) out.push(end);
    const [y, m] = month.split("-").map(Number);
    month = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  }
  return out;
}
