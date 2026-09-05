/**
 * WORKING SCHEDULES — the list.
 *
 * A schedule is small enough to summarise completely: a name, the days it
 * covers, and the hours those days come to. So each card *is* the schedule,
 * drawn at a glance — seven day marks, the worked ones filled — rather than a
 * row of fields you have to open to understand.
 *
 * `hours_per_week` is the figure that matters here and it is **derived** (spec
 * A3), so it is rendered the way every derived figure in this product is: as a
 * rolling numeral, never as an input.
 */
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import type { WorkingSchedule } from "@/api/contract";
import { useQuery } from "@/api/useQuery";
import { useAuth } from "@/auth/AuthContext";
import { PageHeader } from "@/app/Shell";
import { Button, Card, EmptyState, Skeleton, Well, cx } from "@/components/system";
import { money } from "@/api/money";
import { RollingNumber } from "@/components/signature";
import { LoadFailure, SectionNav, decimalLabel, hhmm } from "@/features/shared";
import { listSchedules } from "./api";
import { SECTION_NAV } from "./nav";

/** Monday first, matching `day_of_week` 0–6 (PRD §3.1). */
export const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function Schedules() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const schedules = useQuery(() => listSchedules(), []);
  const rows = schedules.data ?? [];

  return (
    <>
      <PageHeader
        title="Working schedules"
        meta={
          schedules.state === "ready"
            ? `${rows.length} ${rows.length === 1 ? "schedule" : "schedules"} · every contract points at one`
            : "Loading schedules…"
        }
        action={
          can("working_schedule", "create") && (
            <Button
              variant="primary"
              icon={<Plus size={16} />}
              onClick={() => navigate("/contracts/schedules/new")}
            >
              New schedule
            </Button>
          )
        }
      />

      <SectionNav items={SECTION_NAV} />

      {schedules.state === "error" ? (
        <LoadFailure what="The schedules" error={schedules.error} onRetry={schedules.reload} />
      ) : schedules.initial ? (
        <div className="pp-sched__grid">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <Skeleton width="60%" />
              <Skeleton width="100%" />
              <Skeleton width="40%" />
            </Card>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Well style={{ padding: "var(--s-5)" }}>
          <EmptyState
            title="No working schedules yet"
            body="A schedule decides how many days are in a period, what counts as overtime, and how long a day off actually is. Everything downstream reads it."
            action={
              can("working_schedule", "create") && (
                <Button variant="primary" onClick={() => navigate("/contracts/schedules/new")}>
                  Build the first schedule
                </Button>
              )
            }
          />
        </Well>
      ) : (
        <div className="pp-sched__grid">
          {rows.map((schedule) => (
            <ScheduleCard
              key={schedule.id}
              schedule={schedule}
              onOpen={() => navigate(`/contracts/schedules/${schedule.id}`)}
            />
          ))}
        </div>
      )}
    </>
  );
}

function ScheduleCard({
  schedule,
  onOpen,
}: {
  schedule: WorkingSchedule;
  onOpen: () => void;
}) {
  const byDay = new Map(schedule.lines.map((l) => [l.day_of_week, l]));

  return (
    <Card interactive onClick={onOpen} onKeyDown={(e) => e.key === "Enter" && onOpen()}>
      <div className="pp-sched__cardhead">
        <h3 className="t-h3" style={{ margin: 0 }}>{schedule.name}</h3>
        {schedule.crosses_midnight && (
          <span className="pp-sched__night t-micro">NIGHT</span>
        )}
      </div>

      {/* The week itself, at glyph scale. Seven marks; the worked ones carry
          their hours as height, so two schedules are comparable by shape. */}
      <div className="pp-sched__glyph" role="img" aria-label={weekLabel(schedule)}>
        {DAY_NAMES.map((name, day) => {
          const line = byDay.get(day);
          return (
            <span key={name} className="pp-sched__glyph-day">
              <span
                className={cx("pp-sched__glyph-bar", line && "pp-sched__glyph-bar--on")}
                style={{ height: `${line ? barHeight(schedule, line.day_of_week) : 6}%` }}
              />
              <span className="t-micro pp-sched__glyph-label">{name[0]}</span>
            </span>
          );
        })}
      </div>

      <div className="pp-sched__cardfoot">
        <span>
          {/* `RollingCount` rounds, and a 37.5-hour week rounded to 38 on the
              card while the editor showed 37.50 — the same derived figure
              disagreeing with itself two clicks apart. Hours are a decimal
              quantity, so they go through the decimal renderer. */}
          <RollingNumber
            value={money(Number(schedule.hours_per_week).toFixed(2))}
            scale="l"
            symbol=""
            label="hours a week"
          />
          <span className="t-micro" style={{ color: "var(--ink-400)" }}> HOURS / WEEK</span>
        </span>
        <span className="t-ui-sm" style={{ color: "var(--ink-500)" }}>
          {decimalLabel(schedule.daily_hours)} a day · {schedule.timezone}
        </span>
      </div>
    </Card>
  );

  /** Height as a share of the longest day, so the tallest bar is always full. */
  function barHeight(s: WorkingSchedule, day: number): number {
    const minutesOf = (d: number) => {
      const l = s.lines.find((x) => x.day_of_week === d);
      if (!l) return 0;
      const start = toMinutes(l.start_time);
      const end = toMinutes(l.end_time);
      return (end >= start ? end - start : 1440 - start + end) - l.break_minutes;
    };
    const longest = Math.max(...s.lines.map((l) => minutesOf(l.day_of_week)), 1);
    return Math.max(14, Math.round((minutesOf(day) / longest) * 100));
  }
}

const toMinutes = (time: string): number => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
};

function weekLabel(schedule: WorkingSchedule): string {
  const worked = schedule.lines
    .slice()
    .sort((a, b) => a.day_of_week - b.day_of_week)
    .map((l) => `${DAY_NAMES[l.day_of_week]} ${hhmm(l.start_time)}–${hhmm(l.end_time)}`);
  return worked.length ? worked.join(", ") : "No working days";
}
