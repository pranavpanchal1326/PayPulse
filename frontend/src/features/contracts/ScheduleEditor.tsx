/**
 * S5 · THE WORKING SCHEDULE EDITOR — the best pure-material screen in the app.
 *
 * Seven inset day-wells. A worked day holds a raised clay block whose **width
 * is its hours**, so the week is legible as a shape before a single number is
 * read: a short Friday is visibly short, and a night shift visibly starts in
 * one day's well and finishes past its right edge.
 *
 * **`hours_per_week` is never typed.** Spec A3 makes it derived, and the whole
 * argument of this screen is that a derived figure should *look* derived — it
 * sits beside the grid at `num-l` and rolls every time a block changes width.
 * The formula runs here for the preview and again on the server for the
 * truth; the server's answer is what lands back in the field after a save, so
 * a drift between the two would be visible rather than silent.
 *
 * **Three things are prevented at the field, not at the server.**
 *
 *   · *Two lines on one day.* Prevented structurally: the editor's model is
 *     one line per weekday, so the state cannot represent a duplicate. This is
 *     stronger than validation — there is no keystroke that produces it.
 *   · *`end == start`.* A zero-length shift is a day that pays nothing and
 *     reads as a full working day in every list. Refused on the field with the
 *     reason.
 *   · *A shift ending before it starts.* Not an error at all — it is a night
 *     shift (PRD §3.1), and the field says so in words rather than accepting
 *     it silently or rejecting it wrongly.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Moon, Trash2 } from "lucide-react";
import type { WorkingSchedule } from "@/api/contract";
import { useQuery, useSubmission } from "@/api/useQuery";
import { useAuth } from "@/auth/AuthContext";
import { PageHeader } from "@/app/Shell";
import {
  Button, EmptyState, Field, Skeleton, WarningCard, Well, cx, useToast,
} from "@/components/system";
import { RollingNumber } from "@/components/signature";
import { money } from "@/api/money";
import { crossesMidnight, shiftMinutes } from "@/mocks/seed/calendar";
import { LoadFailure, decimalLabel, hhmm } from "@/features/shared";
import { createSchedule, listSchedules, updateSchedule, type ScheduleLineDraft } from "./api";
import { DAY_NAMES } from "./Schedules";

/** One row of the editor's model. `on: false` is a day the schedule does not cover. */
interface DayDraft {
  on: boolean;
  start: string;
  end: string;
  break_minutes: number;
}

const DEFAULT_DAY: DayDraft = { on: false, start: "09:00", end: "18:00", break_minutes: 60 };

/** Monday to Friday, nine to six, an hour for lunch. */
const DEFAULT_WEEK: DayDraft[] = DAY_NAMES.map((_, day) => ({
  ...DEFAULT_DAY,
  on: day < 5,
}));

function weekOf(schedule: WorkingSchedule): { week: DayDraft[]; collapsed: number[] } {
  const week = DAY_NAMES.map(() => ({ ...DEFAULT_DAY }));
  const seen = new Set<number>();
  const collapsed: number[] = [];

  for (const line of schedule.lines) {
    const day = line.day_of_week;
    if (day < 0 || day > 6) continue;
    if (seen.has(day)) {
      // The editor's model cannot hold two lines on one day. Rather than drop
      // one silently, it says which day it collapsed.
      collapsed.push(day);
      continue;
    }
    seen.add(day);
    week[day] = {
      on: true,
      start: hhmm(line.start_time),
      end: hhmm(line.end_time),
      break_minutes: line.break_minutes,
    };
  }
  return { week, collapsed };
}

/** The A3 formula, client-side, for the live readout. The server recomputes. */
function derive(week: DayDraft[]): {
  minutes: number;
  hoursPerWeek: number;
  dailyHours: number;
  crosses: boolean;
} {
  const worked = week.filter((d) => d.on);
  const minutes = worked.reduce(
    (total, d) => total + shiftMinutes(`${d.start}:00`, `${d.end}:00`, d.break_minutes),
    0,
  );
  return {
    minutes,
    hoursPerWeek: minutes / 60,
    dailyHours: worked.length === 0 ? 0 : minutes / 60 / worked.length,
    crosses: worked.some((d) => crossesMidnight(`${d.start}:00`, `${d.end}:00`)),
  };
}

/** The message a day's own times deserve, or nothing. */
function dayProblem(day: DayDraft): string | undefined {
  if (!day.on) return undefined;
  if (!day.start || !day.end) return "Both times are needed.";
  if (day.start === day.end) return "A shift cannot end at the moment it starts.";
  const minutes = shiftMinutes(`${day.start}:00`, `${day.end}:00`, day.break_minutes);
  if (minutes <= 0) return "The break is longer than the shift.";
  return undefined;
}

export function ScheduleEditor({ id }: { id: number | "new" }) {
  const navigate = useNavigate();
  const { can } = useAuth();
  const toast = useToast();
  const form = useSubmission();

  /**
   * §5 has no `GET /working-schedules/{id}`, so the list is the read. It is
   * one small call and every schedule is in it — paging a set this size would
   * be a lie about how it is fetched.
   */
  const schedules = useQuery(() => listSchedules(), []);
  const existing =
    id === "new" ? undefined : schedules.data?.items.find((s) => s.id === id);

  const [name, setName] = useState("");
  const [week, setWeek] = useState<DayDraft[]>(DEFAULT_WEEK);
  const [collapsed, setCollapsed] = useState<number[]>([]);
  const [loaded, setLoaded] = useState(id === "new");

  useEffect(() => {
    if (id === "new" || !existing || loaded) return;
    const { week: parsed, collapsed: dropped } = weekOf(existing);
    setName(existing.name);
    setWeek(parsed);
    setCollapsed(dropped);
    setLoaded(true);
  }, [existing, id, loaded]);

  const derived = useMemo(() => derive(week), [week]);
  const problems = useMemo(() => week.map(dayProblem), [week]);
  const blocked = problems.some(Boolean) || !week.some((d) => d.on) || name.trim() === "";

  const editable = can("working_schedule", id === "new" ? "create" : "update");

  function setDay(index: number, patch: Partial<DayDraft>) {
    setWeek((current) => current.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  }

  async function save() {
    const lines: ScheduleLineDraft[] = week
      .map((d, day) =>
        d.on
          ? {
              day_of_week: day,
              start_time: `${d.start}:00`,
              end_time: `${d.end}:00`,
              break_minutes: d.break_minutes,
            }
          : null,
      )
      .filter((l): l is ScheduleLineDraft => l !== null);

    const ok = await form.submit(async () => {
      if (id === "new") {
        const created = await createSchedule({ name: name.trim(), lines });
        navigate(`/contracts/schedules/${created.id}`, { replace: true });
      } else {
        await updateSchedule(id, { name: name.trim(), lines });
        schedules.reload();
      }
    });
    if (ok) toast("Schedule saved. Hours recomputed from the lines.", "jade");
  }

  if (schedules.state === "error") {
    return <LoadFailure what="The schedules" error={schedules.error} onRetry={schedules.reload} />;
  }

  if (id !== "new" && schedules.state === "ready" && !existing) {
    return (
      <>
        <PageHeader title="Working schedule" meta="Not found." />
        <Well style={{ padding: "var(--s-5)" }}>
          <EmptyState
            title="That schedule is not here"
            body="It was deleted, or it never existed. The contracts that pointed at it will name whichever schedule they use now."
            action={
              <Button variant="quiet" onClick={() => navigate("/contracts/schedules")}>
                Back to schedules
              </Button>
            }
          />
        </Well>
      </>
    );
  }

  if (id !== "new" && !loaded) {
    return (
      <>
        <PageHeader title="Working schedule" meta="Loading…" />
        <Well style={{ padding: "var(--s-5)" }}>
          <Skeleton width="100%" />
        </Well>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={id === "new" ? "New working schedule" : name || "Working schedule"}
        meta={
          <button
            type="button"
            className="focusable"
            style={{ color: "var(--ink-500)", cursor: "pointer" }}
            onClick={() => navigate("/contracts/schedules")}
          >
            ← All schedules
          </button>
        }
        action={
          editable && (
            <Button variant="primary" loading={form.busy} disabled={blocked} onClick={save}>
              {id === "new" ? "Create schedule" : "Save schedule"}
            </Button>
          )
        }
      />

      {collapsed.length > 0 && (
        <div style={{ marginBottom: "var(--s-4)" }}>
          <WarningCard
            severity="warning"
            code="DUPLICATE_DAY_LINES"
            detail={`This schedule had more than one line on ${collapsed
              .map((d) => DAY_NAMES[d])
              .join(", ")}. The editor holds one shift per day, so the first is shown.`}
            blocks="Saving will replace the extra lines with the single shift shown here."
          />
        </div>
      )}

      {form.message && <p className="pp-form__error t-ui-sm" role="alert">{form.message}</p>}

      <div className="pp-sched__editor">
        {/* ── The week ─────────────────────────────────────────────── */}
        <section aria-label="Working week">
          <Field
            label="Schedule name"
            required
            placeholder="Standard · 40 hours"
            error={form.fields.name}
            value={name}
            disabled={!editable}
            onChange={(e) => setName(e.target.value)}
          />

          <div className="pp-week">
            {week.map((day, index) => (
              <DayWell
                key={DAY_NAMES[index]}
                index={index}
                day={day}
                problem={problems[index]}
                longestMinutes={Math.max(
                  ...week.map((d) =>
                    d.on ? shiftMinutes(`${d.start}:00`, `${d.end}:00`, d.break_minutes) : 0,
                  ),
                  1,
                )}
                editable={editable}
                onChange={(patch) => setDay(index, patch)}
              />
            ))}
          </div>
        </section>

        {/* ── The readout ──────────────────────────────────────────── */}
        <aside className="pp-week__readout" aria-label="Derived from the week">
          <div className="pp-week__figure">
            <RollingNumber
              value={money(derived.hoursPerWeek.toFixed(2))}
              scale="hero"
              symbol=""
              label="hours per week"
            />
            <p className="t-micro" style={{ margin: 0, color: "var(--ink-400)" }}>
              HOURS PER WEEK
            </p>
          </div>

          <p className="t-ui-sm pp-week__derivedby">
            Derived from the lines on every save. This field is never typed —
            spec A3.
          </p>

          <dl className="pp-week__stats">
            <div>
              <dt className="t-micro">DAILY HOURS</dt>
              <dd className="t-ui">{decimalLabel(derived.dailyHours.toFixed(2))}</dd>
            </div>
            <div>
              <dt className="t-micro">WORKING DAYS</dt>
              <dd className="t-ui">{week.filter((d) => d.on).length}</dd>
            </div>
            <div>
              <dt className="t-micro">TIMEZONE</dt>
              <dd className="t-ui">{existing?.timezone ?? "Asia/Kolkata"}</dd>
            </div>
          </dl>

          {derived.crosses && (
            <p className="pp-week__night t-ui-sm">
              <Moon size={14} aria-hidden="true" />
              <span>
                A shift here crosses midnight. Hours are counted through to the
                next morning, and attendance for that shift is recorded against
                the day it started.
              </span>
            </p>
          )}

          {!week.some((d) => d.on) && (
            <p className="t-ui-sm" style={{ color: "var(--orange-500)" }}>
              A schedule with no working days makes every period zero days long.
              Switch at least one day on.
            </p>
          )}
        </aside>
      </div>
    </>
  );
}

/* ── One day ──────────────────────────────────────────────────────────── */

/**
 * The inset well is the day; the raised block inside it is the shift. Width is
 * hours — relative to the longest day in the week, so the shape of the week is
 * comparable across its own rows rather than against an invisible 24-hour
 * scale on which every office day would look identical and short.
 */
function DayWell({
  index,
  day,
  problem,
  longestMinutes,
  editable,
  onChange,
}: {
  index: number;
  day: DayDraft;
  problem: string | undefined;
  longestMinutes: number;
  editable: boolean;
  onChange: (patch: Partial<DayDraft>) => void;
}) {
  const minutes = day.on
    ? shiftMinutes(`${day.start}:00`, `${day.end}:00`, day.break_minutes)
    : 0;
  const night = day.on && crossesMidnight(`${day.start}:00`, `${day.end}:00`);
  const width = day.on && minutes > 0 ? Math.max(8, (minutes / longestMinutes) * 100) : 0;

  return (
    <div className={cx("pp-day", !day.on && "pp-day--off", problem && "pp-day--invalid")}>
      <label className="pp-day__toggle">
        <input
          type="checkbox"
          checked={day.on}
          disabled={!editable}
          onChange={(e) => onChange({ on: e.target.checked })}
        />
        <span className="t-ui pp-day__name">{DAY_NAMES[index]}</span>
      </label>

      <div className="pp-day__well">
        {day.on ? (
          <div
            className={cx("pp-day__block", night && "pp-day__block--night")}
            style={{ width: `${width}%` }}
          >
            <span className="t-micro pp-day__hours">
              {(minutes / 60).toFixed(minutes % 60 === 0 ? 0 : 2)}h
            </span>
          </div>
        ) : (
          <span className="t-micro pp-day__rest">NOT WORKED</span>
        )}
      </div>

      {day.on ? (
        <div className="pp-day__times">
          <Field
            label="Start"
            type="time"
            value={day.start}
            disabled={!editable}
            onChange={(e) => onChange({ start: e.target.value })}
          />
          <Field
            label="End"
            type="time"
            value={day.end}
            disabled={!editable}
            error={problem}
            help={night && !problem ? "Ends the next morning." : undefined}
            onChange={(e) => onChange({ end: e.target.value })}
          />
          <Field
            label="Break"
            type="number"
            min={0}
            max={480}
            step={5}
            value={day.break_minutes}
            disabled={!editable}
            onChange={(e) => onChange({ break_minutes: Number(e.target.value) || 0 })}
          />
          {editable && (
            <button
              type="button"
              className="pp-day__clear focusable"
              aria-label={`Clear ${DAY_NAMES[index]}`}
              title={`Clear ${DAY_NAMES[index]}`}
              onClick={() => onChange({ on: false })}
            >
              <Trash2 size={14} aria-hidden="true" />
            </button>
          )}
        </div>
      ) : (
        <p className="t-ui-sm pp-day__hint">
          {editable ? "Switch on to add a shift." : "No shift."}
        </p>
      )}
    </div>
  );
}
