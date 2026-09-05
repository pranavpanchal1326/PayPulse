/**
 * THE MONTH STRIP — §12 S6: *"a month strip above the table mirrors THE LINE's
 * tick language."*
 *
 * Same vocabulary, laid out as a month. A day with rows is filled; a day with
 * none is a gap, because absence in this product is the absence of a row (PRD
 * §3.4) and the hole is the information. Clicking a day narrows the table to
 * it, which is the question people arrive with: *what happened on the 14th?*
 *
 * **The problem mark is proportional, and that is a correction.** The first
 * version coloured each day by its worst status — the rule THE LINE uses,
 * which is right there because the line draws one employee. Across
 * twenty-nine people it made every working day vermilion: with that many rows,
 * *somebody* is always late. A strip where every day is an alarm is a strip
 * nobody reads.
 *
 * So the fill says "this day has rows" and a bar along the bottom edge says
 * *what share of them have a problem* — a sliver for one late arrival out of
 * twenty-nine, a full bar when the whole day is broken. The shape is the data,
 * the same way the balance meter and the stack are.
 *
 * Overtime stays an **extra** mark rather than a replacement colour (P4's own
 * finding 5): a day with overtime is still a day worked.
 *
 * **The calendar does not get the whole width, because it does not need it.**
 * Seven columns cap at 420px and the strip is a full-content-width panel, so
 * roughly two thirds of it was empty ground with a legend floated into the
 * corner — the largest unused surface in the product, sitting directly above
 * the densest table in it. The space now carries the reading: what the month
 * amounts to when nothing is selected, and what happened on the day when one
 * is. It is the same rows the grid is drawn from, counted rather than
 * re-fetched, so the panel cannot disagree with the squares beside it.
 */
import { useMemo } from "react";
import type { Attendance } from "@/api/contract";
import { Button, cx } from "@/components/system";
import { eachDay, monthEnd, monthLabel, monthStart } from "@/lib/date";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

interface DayCell {
  date: string;
  count: number;
  missing: number;
  late: number;
  overtime: boolean;
}

export function MonthStrip({
  month,
  rows,
  selected,
  onSelect,
}: {
  /** `YYYY-MM`. */
  month: string;
  rows: Attendance[];
  selected?: string;
  onSelect: (date: string | undefined) => void;
}) {
  const days = useMemo<DayCell[]>(() => {
    const byDate = new Map<string, Attendance[]>();
    for (const row of rows) {
      const bucket = byDate.get(row.work_date);
      if (bucket) bucket.push(row);
      else byDate.set(row.work_date, [row]);
    }

    return eachDay(monthStart(month), monthEnd(month)).map((date) => {
      const found = byDate.get(date) ?? [];
      return {
        date,
        count: found.length,
        missing: found.filter((r) => r.status === "MISSING_CHECKOUT").length,
        late: found.filter((r) => r.status === "LATE").length,
        overtime: found.some((r) => Number(r.overtime_hours) > 0),
      };
    });
  }, [month, rows]);

  // Monday-first offset, so the columns line up with the weekday header.
  const lead = (new Date(`${monthStart(month)}T00:00:00Z`).getUTCDay() + 6) % 7;

  return (
    <section className="pp-strip" aria-label={`Attendance across ${monthLabel(month)}`}>
      <header className="pp-strip__head">
        <span className="t-micro">{monthLabel(month).toUpperCase()}</span>
        <span className="pp-strip__legend t-micro" aria-hidden="true">
          <span><i className="pp-strip__key pp-strip__key--present" /> recorded</span>
          <span><i className="pp-strip__key pp-strip__key--late" /> late</span>
          <span><i className="pp-strip__key pp-strip__key--missing" /> missing check-out</span>
          <span><i className="pp-strip__key pp-strip__key--overtime" /> overtime</span>
          <span><i className="pp-strip__key pp-strip__key--gap" /> no row</span>
        </span>
      </header>

      <div className="pp-strip__body">
      <div className="pp-strip__grid" role="group">
        {WEEKDAYS.map((label, i) => (
          <span key={i} className="t-micro pp-strip__weekday" aria-hidden="true">{label}</span>
        ))}
        {Array.from({ length: lead }).map((_, i) => (
          <span key={`lead${i}`} aria-hidden="true" />
        ))}
        {days.map((day) => {
          const isSelected = day.date === selected;
          const share = (n: number) => (day.count === 0 ? 0 : (n / day.count) * 100);
          return (
            <button
              key={day.date}
              type="button"
              className={cx(
                "pp-strip__day",
                day.count > 0 ? "pp-strip__day--recorded" : "pp-strip__day--none",
                day.overtime && "pp-strip__day--overtime",
                isSelected && "pp-strip__day--selected",
              )}
              aria-pressed={isSelected}
              onClick={() => onSelect(isSelected ? undefined : day.date)}
              title={describe(day)}
            >
              <span className="pp-strip__num">{Number(day.date.slice(8))}</span>

              {/* The problem bar. Missing check-outs first, because they are
                  the ones a payrun refuses to ignore. */}
              {day.count > 0 && (day.missing > 0 || day.late > 0) && (
                <span className="pp-strip__bar" aria-hidden="true">
                  <i
                    className="pp-strip__bar--missing"
                    style={{ width: `${share(day.missing)}%` }}
                  />
                  <i className="pp-strip__bar--late" style={{ width: `${share(day.late)}%` }} />
                </span>
              )}

              <span className="sr-only">{describe(day)}</span>
            </button>
          );
        })}
      </div>

      <Readout
        month={month}
        days={days}
        rows={rows}
        selected={selected}
        onClear={() => onSelect(undefined)}
      />
      </div>
    </section>
  );
}

/* ── What the grid adds up to ────────────────────────────────────────────── */

/**
 * The panel beside the calendar. With a day selected it describes that day;
 * with none, the month. Every figure is counted from the rows the grid itself
 * was built from — nothing here issues a request, so the panel and the squares
 * are two readings of one array rather than two sources that can drift.
 */
function Readout({
  month,
  days,
  rows,
  selected,
  onClear,
}: {
  month: string;
  days: DayCell[];
  rows: Attendance[];
  selected?: string;
  onClear: () => void;
}) {
  const day = selected ? days.find((d) => d.date === selected) : undefined;

  if (day) {
    const onDay = rows.filter((r) => r.work_date === day.date);
    const worked = onDay.reduce((sum, r) => sum + Number(r.worked_hours), 0);
    const overtime = onDay.reduce((sum, r) => sum + Number(r.overtime_hours), 0);
    return (
      <div className="pp-strip__read">
        <p className="t-micro pp-strip__read-kicker">
          {new Date(`${day.date}T00:00:00Z`).toLocaleDateString(undefined, {
            weekday: "long", day: "numeric", month: "long", timeZone: "UTC",
          })}
        </p>

        {day.count === 0 ? (
          <>
            <p className="t-h3 pp-strip__read-figure">No row</p>
            <p className="t-ui-sm pp-strip__read-note">
              A day with no row is an absent day: payroll counts it unpaid rather than assuming it
              was worked.
            </p>
          </>
        ) : (
          <>
            <p className="t-h3 pp-strip__read-figure">
              {day.count} {day.count === 1 ? "row" : "rows"}
            </p>
            <dl className="pp-strip__facts">
              <Fact label="Worked" value={`${worked.toFixed(2)} h`} />
              {overtime > 0 && <Fact label="Overtime" value={`+${overtime.toFixed(2)} h`} tone="cobalt" />}
              {day.missing > 0 && (
                <Fact label="Missing out" value={String(day.missing)} tone="vermilion" />
              )}
              {day.late > 0 && <Fact label="Late" value={String(day.late)} tone="orange" />}
            </dl>
          </>
        )}

        <Button size="sm" variant="quiet" onClick={onClear}>
          Show the whole month
        </Button>
      </div>
    );
  }

  const recorded = days.filter((d) => d.count > 0).length;
  const missing = days.reduce((n, d) => n + d.missing, 0);
  const late = days.reduce((n, d) => n + d.late, 0);
  const worked = rows.reduce((sum, r) => sum + Number(r.worked_hours), 0);

  return (
    <div className="pp-strip__read">
      <p className="t-micro pp-strip__read-kicker">{monthLabel(month)}</p>
      <p className="t-h3 pp-strip__read-figure">
        {recorded} {recorded === 1 ? "day" : "days"} with rows
      </p>
      <dl className="pp-strip__facts">
        <Fact label="Rows" value={String(rows.length)} />
        <Fact label="Worked" value={`${worked.toFixed(0)} h`} />
        {missing > 0 && <Fact label="Missing out" value={String(missing)} tone="vermilion" />}
        {late > 0 && <Fact label="Late" value={String(late)} tone="orange" />}
      </dl>
      <p className="t-ui-sm pp-strip__read-note">
        Pick a day to narrow the register to it.
      </p>
    </div>
  );
}

function Fact({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "cobalt" | "orange" | "vermilion";
}) {
  return (
    <div className={cx("pp-strip__fact", tone && `pp-strip__fact--${tone}`)}>
      <dt className="t-micro">{label}</dt>
      <dd className="n-table">{value}</dd>
    </div>
  );
}

function describe(day: DayCell): string {
  if (day.count === 0) return `${day.date} — no attendance recorded`;
  const parts = [`${day.count} ${day.count === 1 ? "row" : "rows"}`];
  if (day.missing > 0) parts.push(`${day.missing} missing a check-out`);
  if (day.late > 0) parts.push(`${day.late} late`);
  if (day.overtime) parts.push("overtime worked");
  if (parts.length === 1) parts.push("all clear");
  return `${day.date} — ${parts.join(", ")}`;
}
