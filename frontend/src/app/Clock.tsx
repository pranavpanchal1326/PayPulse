/**
 * THE CLOCK · the one control that says whether you are working right now.
 *
 * Attendance used to be punched from inside the Time screen, which made the
 * single most frequent action in the product something you had to *navigate*
 * to. It now lives in the shell, next to the wordmark's own heartbeat, because
 * it is not a page — it is a state the whole application is in.
 *
 * **The light is the state, and it is the only light.** A jade dot that beats
 * means there is an open check-in; a hollow vermilion ring means the day is
 * closed. The sidebar's `Live` pulse is driven from the same value, so the
 * product never shows a running heartbeat for somebody who has gone home.
 *
 * **Every time this control writes is the time it actually happened.** The
 * client sends no timestamps at all — `check-in` and `check-out` are posted
 * empty and the server stamps them, which is the only arrangement in which a
 * timesheet can be trusted.
 *
 * That is a correction. The first version of half day *invented* a check-out:
 * it punched in at the real time and immediately closed the day at
 * `check_in + daily_hours / 2`, so somebody starting a half day at 01:47 got a
 * row reading `01:47 → 06:47` — five hours that had not happened yet, written
 * down as fact. It computed the right *number* and told a lie to get there,
 * and a payroll system that back-fills a plausible time is worse than one that
 * cannot do half days at all.
 *
 * **So half day is an intention here, not a record.** Choosing it checks you
 * in for real and remembers, *in this browser only*, that today is meant to be
 * a half day. The clock then shows the mark — the real wall-clock time at
 * which half your schedule will have elapsed — and counts toward it. You leave
 * when you leave, check out at that real moment, and the register marks the
 * row `HALF` because the hours you actually worked say so (§3.4 computes them
 * from the times and takes nothing from the client). The intent shapes what
 * the *screen* says; only the punches shape what payroll reads.
 *
 * A time that genuinely is not now — a forgotten punch, a shift corrected
 * after the fact — goes through the correction drawer, which is `HR_MANAGER+`
 * and demands a written reason. That is the sanctioned path for writing a past
 * time, and it is the only one.
 */
import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from "react";
import { useNavigate } from "react-router-dom";
import { CalendarDays, ChevronDown, LogIn, LogOut, TimerReset } from "lucide-react";
import type { Attendance } from "@/api/contract";
import { ApiError } from "@/api/errors";
import { useAuth } from "@/auth/AuthContext";
import { Menu, Tooltip, cx, useToast } from "@/components/system";
import { checkIn, checkOut, listAttendance } from "@/features/time/api";
import { getEmployee, listSchedules } from "@/features/people/api";
import { today } from "@/lib/clock";
import { minutesOf } from "@/lib/date";
import { sound } from "@/sound/useSound";

interface ClockValue {
  /** The open row, when there is one. `null` is "not on the clock". */
  open: Attendance | null;
  /** Minutes elapsed since the check-in, or `null` when closed. */
  elapsed: number | null;
  /** The schedule's contracted day, in hours. Eight until it is known. */
  dailyHours: number;
  /** Today is *meant* to be a half day. A note to this browser, not a record. */
  halfDay: boolean;
  /**
   * The wall-clock time the current day reaches its mark — half the schedule
   * when a half day was declared, the whole of it otherwise. `null` off the
   * clock. `over` once the mark has passed.
   */
  target: { at: string; minutesAway: number; over: boolean } | null;
  busy: boolean;
  punchIn: () => Promise<void>;
  punchOut: () => Promise<void>;
  /** Check in for real, and note that today is meant to be a half day. */
  startHalfDay: () => Promise<void>;
  /** Drop the half-day note. Touches nothing on the server. */
  clearHalfDay: () => void;
  /** Something changed on the server; screens showing today should reload. */
  version: number;
}

const Ctx = createContext<ClockValue | null>(null);

/** Read the clock. Safe outside the provider — it simply reads as closed. */
export function useClock(): ClockValue {
  return (
    useContext(Ctx) ?? {
      open: null,
      elapsed: null,
      dailyHours: 8,
      halfDay: false,
      target: null,
      busy: false,
      punchIn: async () => {},
      punchOut: async () => {},
      startHalfDay: async () => {},
      clearHalfDay: () => {},
      version: 0,
    }
  );
}

/** Minutes since midnight, from the clock part of an ISO timestamp. */
const clockMinutes = (iso: string): number => minutesOf(iso.slice(11, 16));

/** Minutes since midnight → `13:45`, for a mark the reader is walking toward. */
function hhmm(totalMinutes: number): string {
  const wrapped = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(wrapped / 60)).padStart(2, "0")}:${String(wrapped % 60).padStart(2, "0")}`;
}

/**
 * Where the half-day note lives: this browser, keyed by person and date, and
 * nowhere else. It is a reminder about today, so it does not deserve a column
 * on a payroll record and must never be mistaken for one.
 */
const noteKey = (employeeId: number, date: string) => `paypulse.halfday.${employeeId}.${date}`;

function readNote(employeeId: number | null, date: string): boolean {
  if (employeeId === null) return false;
  try {
    return localStorage.getItem(noteKey(employeeId, date)) === "1";
  } catch {
    return false;
  }
}

function writeNote(employeeId: number | null, date: string, on: boolean) {
  if (employeeId === null) return;
  try {
    if (on) localStorage.setItem(noteKey(employeeId, date), "1");
    else localStorage.removeItem(noteKey(employeeId, date));
  } catch {
    /* A private window simply does not get the reminder. */
  }
}

export function ClockProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [open, setOpen] = useState<Attendance | null>(null);
  const [dailyHours, setDailyHours] = useState(8);
  const [halfDay, setHalfDay] = useState(false);
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  const [minute, setMinute] = useState(() => Math.floor(Date.now() / 60_000));

  const employeeId = user?.employee_id ?? null;

  /** The open row for today, if the day was already started elsewhere. */
  useEffect(() => {
    if (employeeId === null) return;
    let live = true;
    const now = today();
    listAttendance({
      employee_id: employeeId,
      date_from: now,
      date_to: now,
    })
      .then((page) => {
        if (!live) return;
        const row = page.items.find((r) => r.check_out === null) ?? null;
        setOpen(row);
        /* The note survives a reload — the whole point of it is that you set
           it in the morning and read it in the afternoon. */
        setHalfDay(row ? readNote(employeeId, row.work_date) : false);
      })
      .catch(() => {
        /* The clock is an affordance, not a screen: it stays closed rather
           than shouting about a list it could not read. */
      });
    return () => {
      live = false;
    };
  }, [employeeId]);

  /** The contracted day, for the half-day arithmetic. */
  useEffect(() => {
    if (employeeId === null) return;
    let live = true;
    Promise.all([getEmployee(employeeId), listSchedules()])
      .then(([person, schedules]) => {
        if (!live) return;
        const schedule = schedules.find((s) => s.id === person.working_schedule_id);
        if (schedule) setDailyHours(Number(schedule.daily_hours) || 8);
      })
      .catch(() => {
        /* Eight is the schedule the fixtures and the mock both default to. */
      });
    return () => {
      live = false;
    };
  }, [employeeId]);

  /** The elapsed label only changes to the minute; so does the timer. */
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setMinute(Math.floor(Date.now() / 60_000)), 30_000);
    return () => clearInterval(id);
  }, [open]);

  /**
   * The clock the reader is looking at, in minutes since midnight. Compared
   * against `check_in`'s own clock part rather than by parsing both to
   * instants: the fixture rows are stamped on the anchor date (PRD §9) while
   * the wall clock is on today's, so `Date.parse` on the pair would measure
   * the distance between two calendars instead of the length of a shift.
   */
  const nowMinutes = useMemo(() => {
    const now = new Date(minute * 60_000);
    return now.getHours() * 60 + now.getMinutes();
  }, [minute]);

  const elapsed = useMemo(
    () => (open ? Math.max(0, nowMinutes - clockMinutes(open.check_in)) : null),
    [open, nowMinutes],
  );

  /**
   * The mark: when this day reaches the hours it is meant to. Break time is
   * included because the schedule's break is unpaid — you are not finished at
   * `in + 4h` on a day with an hour's break, you are finished at `in + 5h`,
   * and a target that forgets that sends people home short.
   */
  const target = useMemo(() => {
    if (!open) return null;
    const hours = halfDay ? dailyHours / 2 : dailyHours;
    const at = clockMinutes(open.check_in) + hours * 60 + open.break_minutes;
    const away = Math.round(at - nowMinutes);
    return { at: hhmm(at), minutesAway: Math.abs(away), over: away < 0 };
  }, [open, halfDay, dailyHours, nowMinutes]);

  const run = useCallback(async (work: () => Promise<void>) => {
    setBusy(true);
    try {
      await work();
      setVersion((v) => v + 1);
    } finally {
      setBusy(false);
    }
  }, []);

  /** No timestamp is sent. The server stamps the moment it happened. */
  const punchIn = useCallback(
    () =>
      run(async () => {
        const row = await checkIn({});
        writeNote(employeeId, row.work_date, false);
        setHalfDay(false);
        setOpen(row);
      }),
    [run, employeeId],
  );

  const punchOut = useCallback(
    () =>
      run(async () => {
        const closing = open;
        await checkOut({});
        if (closing) writeNote(employeeId, closing.work_date, false);
        setHalfDay(false);
        setOpen(null);
      }),
    [run, open, employeeId],
  );

  /**
   * Start the day and note that it is meant to be a short one. The punch is a
   * real punch — identical to `punchIn` — and the note is the only difference,
   * because the only honest difference at 09:00 between a half day and a full
   * one is what you intend to do at lunchtime.
   */
  const startHalfDay = useCallback(
    () =>
      run(async () => {
        const row = open ?? (await checkIn({}));
        writeNote(employeeId, row.work_date, true);
        setHalfDay(true);
        setOpen(row);
      }),
    [run, open, employeeId],
  );

  /**
   * Calling the half day off is a local edit and nothing else — there is no
   * punch to undo, because declaring one never made one. It is deliberately
   * not a `run()`: there is no request to be busy for.
   */
  const clearHalfDay = useCallback(() => {
    if (open) writeNote(employeeId, open.work_date, false);
    setHalfDay(false);
  }, [open, employeeId]);

  const value = useMemo<ClockValue>(
    () => ({
      open, elapsed, dailyHours, halfDay, target, busy,
      punchIn, punchOut, startHalfDay, clearHalfDay, version,
    }),
    [open, elapsed, dailyHours, halfDay, target, busy, punchIn, punchOut, startHalfDay,
     clearHalfDay, version],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/* ── The control ──────────────────────────────────────────────────────── */

/**
 * A round key with a light in it. Pressed, it punches; its menu carries the
 * two things that are not "the obvious next punch".
 */
export function ClockControl() {
  const { user, can } = useAuth();
  const clock = useClock();
  const navigate = useNavigate();
  const toast = useToast();
  const [error, setError] = useState<string>();
  const [menuOpen, setMenuOpen] = useState(false);
  const dismiss = useRef<number>();

  /** A refusal is a state fact and it should leave on its own. */
  const say = (message: string) => {
    setError(message);
    window.clearTimeout(dismiss.current);
    dismiss.current = window.setTimeout(() => setError(undefined), 6000);
  };
  useEffect(() => () => window.clearTimeout(dismiss.current), []);

  if (!user || user.employee_id === null || !can("attendance", "create")) return null;

  const on = clock.open !== null;

  async function attempt(work: () => Promise<void>, done: string) {
    setError(undefined);
    try {
      await work();
      toast(done, "jade");
      sound.play("cleared");
    } catch (cause) {
      say(cause instanceof ApiError ? cause.message : "That did not work.");
    }
  }

  const hours = (n: number) => `${n % 1 === 0 ? n : n.toFixed(1)} hours`;
  const half = hours(clock.dailyHours / 2);
  const since = on ? clock.open!.check_in.slice(11, 16) : null;

  /** `2h 15m`, or `45m` under the hour — a distance, not a duration. */
  const away = (m: number) =>
    m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m` : `${m}m`;

  return (
    <div
      className={cx(
        "pp-clock",
        on && "pp-clock--on",
        on && clock.halfDay && "pp-clock--half",
        clock.target?.over && "pp-clock--over",
      )}
    >
      <Tooltip
        label={
          on
            ? [
                `On the clock since ${since}.`,
                clock.target &&
                  (clock.target.over
                    ? `Past your ${clock.halfDay ? "half day" : "full day"} by ${away(clock.target.minutesAway)}.`
                    : `${clock.halfDay ? "Half day" : "Full day"} at ${clock.target.at} — ${away(clock.target.minutesAway)} to go.`),
                "Press to check out. The time recorded is the time you press it.",
              ]
                .filter(Boolean)
                .join(" ")
            : "Not on the clock. Press to check in — the time recorded is the time you press it."
        }
      >
        <button
          type="button"
          className="pp-clock__key focusable"
          disabled={clock.busy}
          aria-label={on ? "Check out" : "Check in"}
          onClick={() =>
            on
              ? attempt(clock.punchOut, "Checked out.")
              : attempt(clock.punchIn, "Checked in.")
          }
        >
          <span className="pp-clock__light" aria-hidden="true" />
          <span className="pp-clock__glyph" aria-hidden="true">
            {on ? <LogOut size={13} /> : <LogIn size={13} />}
          </span>
        </button>
      </Tooltip>

      {/*
        Two lines: what you are, and how far in. The second line carries the
        *mark* rather than a bare stopwatch — a number counting up says nothing
        about whether you can leave, and "out at 13:47" is the thing somebody
        on a half day actually needs.
      */}
      <div className="pp-clock__read">
        <span className="t-micro pp-clock__state">
          {!on ? "CHECKED OUT" : clock.halfDay ? "HALF DAY" : "ON THE CLOCK"}
        </span>
        {on && clock.elapsed !== null ? (
          <span className="pp-clock__line">
            <span className="n-table pp-clock__elapsed">
              {String(Math.floor(clock.elapsed / 60)).padStart(2, "0")}:
              {String(clock.elapsed % 60).padStart(2, "0")}
            </span>
            {clock.target && (
              <span className="t-micro pp-clock__target">
                {clock.target.over ? `+${away(clock.target.minutesAway)}` : `→ ${clock.target.at}`}
              </span>
            )}
          </span>
        ) : (
          <span className="t-micro pp-clock__target">not recording</span>
        )}
      </div>

      <span className="pp-clock__menu">
        <button
          type="button"
          className="pp-clock__more focusable"
          aria-label="Other ways to record today"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <ChevronDown size={14} aria-hidden="true" />
        </button>
        <Menu
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          items={[
            /*
              Only offered when it can still mean something. Declaring a half
              day at the moment you leave changes nothing — the hours are
              already what they are — so the item is a way to *start* one, and
              once a half day is running it becomes the way to call it off.
            */
            clock.halfDay
              ? {
                  label: `Make it a full day · ${hours(clock.dailyHours)}`,
                  icon: <TimerReset size={14} />,
                  onSelect: () => {
                    /* Not a punch — there is nothing on the server to undo. */
                    clock.clearHalfDay();
                    setMenuOpen(false);
                    toast("Back to a full day.");
                  },
                }
              : {
                  label: on ? `Make today a half day · ${half}` : `Start a half day · ${half}`,
                  icon: <TimerReset size={14} />,
                  onSelect: () =>
                    attempt(
                      clock.startHalfDay,
                      on ? "Marked as a half day." : "Checked in — half day.",
                    ),
                },
            {
              label: "Open my time",
              icon: <CalendarDays size={14} />,
              onSelect: () => navigate("/time"),
            },
          ]}
        />
      </span>

      {error && (
        <p className="t-ui-sm pp-clock__refusal" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
