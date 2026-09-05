/**
 * TIME OFF — five types, ~40 allocations, ~60 requests across every state.
 *
 * Two behaviours in PRD §3.6 are invisible unless the fixtures force them:
 *
 *   1. **`duration_days` is schedule- and holiday-aware.** A Friday-to-Monday
 *      request on a five-day week is two days, not four. Requests here are
 *      measured with the same day counter the payslips use, so a UI that
 *      naively subtracts two dates will disagree with the data and be caught.
 *   2. **Unpaid leave reaches payroll through the *type*, not a policy flag.**
 *      One type has `is_paid: false`; its approved requests are what push
 *      `unpaid_days` above zero and make the `LWP` line non-zero.
 *
 * One request deliberately spans Ganesh Chaturthi (PRD §9) — the holiday sits
 * inside the range and must not be charged to the balance.
 */
import type {
  LeaveAllocation, LeaveBalance, RequestState, TimeOffRequest, TimeOffType,
} from "@/api/contract";
import { ALL_PERIODS, OPEN_PERIOD } from "./anchor";
import { addDays, dayOfWeek, decimal, eachDay, monthEnd, monthStart, type ISODate } from "@/lib/date";
import { blockingHolidays, employeeById, employees, scheduleWorkingDays } from "./people";
import { SEEDS, rng } from "./random";

export const timeOffTypes: TimeOffType[] = [
  { id: 1, name: "Annual leave",   code: "AL",   unit: "DAYS",  requires_allocation: true,  is_paid: true,  color: "jade",      is_active: true },
  { id: 2, name: "Sick leave",     code: "SL",   unit: "DAYS",  requires_allocation: true,  is_paid: true,  color: "cobalt",    is_active: true },
  { id: 3, name: "Casual leave",   code: "CL",   unit: "DAYS",  requires_allocation: true,  is_paid: true,  color: "orange",    is_active: true },
  // The one that reaches payroll. No allocation to check — §3.6 keeps only
  // BLOCK, and unpaid time needs no balance arithmetic at all.
  { id: 4, name: "Unpaid leave",   code: "LWP",  unit: "DAYS",  requires_allocation: false, is_paid: false, color: "vermilion", is_active: true },
  // The hours-unit type spec A4 requires. Converts on approval:
  // `duration_days = hours / contract_daily_hours`.
  { id: 5, name: "Compensatory off", code: "COMP", unit: "HOURS", requires_allocation: true, is_paid: true, color: "cobalt",   is_active: true },
];

export const timeOffTypeById = new Map(timeOffTypes.map((t) => [t.id, t]));

/**
 * The §4.2 day counter, applied to a leave range: working days on the
 * employee's schedule, minus non-optional public holidays. This is the *same*
 * definition `period_days` uses, which is the point — one rule, one answer.
 */
export function leaveDays(employeeId: number, from: ISODate, to: ISODate): number {
  const e = employeeById.get(employeeId);
  const working = scheduleWorkingDays.get(e?.working_schedule_id ?? 1) ?? new Set<number>();
  return eachDay(from, to).filter(
    (d) => working.has(dayOfWeek(d)) && !blockingHolidays.has(d),
  ).length;
}

/* ── Allocations ─────────────────────────────────────────────────────── */

const VALIDITY_FROM = monthStart(ALL_PERIODS[0]);
const VALIDITY_TO = monthEnd(OPEN_PERIOD);

const ALLOCATED_TYPES = timeOffTypes.filter((t) => t.requires_allocation);

const ra = rng(SEEDS.timeOff);

export const leaveAllocations: LeaveAllocation[] = [];
{
  let id = 1;
  // Roughly forty: every active employee gets annual leave, and a rotating
  // subset gets the other allocated types.
  for (const e of employees) {
    if (e.status === "INACTIVE") continue;
    for (const type of ALLOCATED_TYPES) {
      const give =
        type.code === "AL" ||
        (type.code === "SL" && e.id % 3 === 0) ||
        (type.code === "CL" && e.id % 4 === 1) ||
        (type.code === "COMP" && e.id % 7 === 2);
      if (!give) continue;

      leaveAllocations.push({
        id: id++,
        employee_id: e.id,
        employee_name: e.full_name,
        time_off_type_id: type.id,
        time_off_type_name: type.name,
        // COMP is an hours-unit type, so its allocation is hours.
        days: decimal(type.unit === "HOURS" ? ra.int(8, 24) : ra.int(6, 15)),
        validity_from: VALIDITY_FROM,
        validity_to: VALIDITY_TO,
        // A couple sit unapproved so the approve/refuse path has a subject.
        state: e.id % 11 === 5 ? "TO_APPROVE" : "APPROVED",
        notes: null,
      });
    }
  }
}

/* ── Requests ────────────────────────────────────────────────────────── */

/** Every state appears, weighted the way a real ledger is. */
const STATE_MIX: RequestState[] = [
  "APPROVED", "APPROVED", "APPROVED", "APPROVED", "APPROVED", "APPROVED",
  "TO_APPROVE", "TO_APPROVE",
  "REFUSED", "CANCELLED", "DRAFT",
];

const REASONS = [
  "Family function", "Medical appointment", "Personal work", "Travel",
  "Wedding in the family", "Recovering from fever", "Moving house",
];

export const timeOffRequests: TimeOffRequest[] = [];

/** `date → employee ids on approved leave` — attendance and payroll both read it. */
export const approvedLeaveDays = new Map<ISODate, Set<number>>();
/** `employeeId → { date → is_paid }`, the shape §4.2 actually needs. */
export const approvedLeaveByEmployee = new Map<number, Map<ISODate, boolean>>();

function recordApproved(employeeId: number, from: ISODate, to: ISODate, isPaid: boolean) {
  const e = employeeById.get(employeeId);
  const working = scheduleWorkingDays.get(e?.working_schedule_id ?? 1) ?? new Set<number>();
  let perEmployee = approvedLeaveByEmployee.get(employeeId);
  if (!perEmployee) {
    perEmployee = new Map();
    approvedLeaveByEmployee.set(employeeId, perEmployee);
  }

  for (const d of eachDay(from, to)) {
    if (!working.has(dayOfWeek(d)) || blockingHolidays.has(d)) continue;

    let onLeave = approvedLeaveDays.get(d);
    if (!onLeave) {
      onLeave = new Set();
      approvedLeaveDays.set(d, onLeave);
    }
    onLeave.add(employeeId);
    perEmployee.set(d, isPaid);
  }
}

function addRequest(
  id: number,
  employeeId: number,
  typeId: number,
  from: ISODate,
  to: ISODate,
  state: RequestState,
  reason: string,
) {
  const e = employeeById.get(employeeId);
  const type = timeOffTypeById.get(typeId);
  if (!e || !type) return;

  const days = leaveDays(employeeId, from, to);
  if (days === 0) return; // a request entirely on holidays or weekends is not one

  const approver = e.manager_id ?? 1;
  const decided = state === "APPROVED" || state === "REFUSED";

  timeOffRequests.push({
    id,
    employee_id: employeeId,
    employee_name: e.full_name,
    time_off_type_id: type.id,
    time_off_type_name: type.name,
    is_paid: type.is_paid,
    date_from: from,
    date_to: to,
    duration_days: decimal(days),
    state,
    reason,
    approver_id: decided ? approver : null,
    approver_name: decided ? (employeeById.get(approver)?.full_name ?? null) : null,
    decided_at: decided ? `${addDays(from, -3)}T11:20:00+05:30` : null,
  });

  if (state === "APPROVED") recordApproved(employeeId, from, to, type.is_paid);
}

{
  let id = 1;

  // The named cases first, so they cannot be shuffled away by a later edit.

  // Spans Ganesh Chaturthi (26 Aug, a Wednesday) — five calendar days, but the
  // holiday is not charged, so `duration_days` is 4.
  addRequest(id++, 7, 1, `${OPEN_PERIOD}-24`, `${OPEN_PERIOD}-28`, "APPROVED",
    "Ganpati at home");

  // Unpaid leave inside the open period: this is what makes `LWP` non-zero and
  // `unpaid_days` visible on a payslip in the cockpit.
  addRequest(id++, 17, 4, `${OPEN_PERIOD}-05`, `${OPEN_PERIOD}-06`, "APPROVED",
    "Personal, no balance left");
  addRequest(id++, 10, 4, `${OPEN_PERIOD}-19`, `${OPEN_PERIOD}-19`, "APPROVED",
    "Unpaid day");

  // An hours-unit request, converted on approval (PRD §3.6).
  addRequest(id++, 23, 5, `${OPEN_PERIOD}-11`, `${OPEN_PERIOD}-11`, "APPROVED",
    "Comp off for the weekend deployment");

  // Pending against a thin balance — the `low_balances` panel needs a subject,
  // and the UI has to warn before approval hits the §3.6 block.
  addRequest(id++, 5, 1, `${OPEN_PERIOD}-29`, `${addDays(`${OPEN_PERIOD}-29`, 6)}`, "TO_APPROVE",
    "Trip already booked");

  // The rest, spread across every seeded month and every state.
  for (const period of ALL_PERIODS) {
    const start = monthStart(period);
    const end = monthEnd(period);
    for (const e of ra.sample(employees, 9)) {
      if (e.status === "INACTIVE") continue;
      if (e.date_of_joining > end) continue;

      const type = ra.pick(timeOffTypes);
      const from = addDays(start, ra.int(1, 22));
      const to = addDays(from, ra.int(0, 3));
      if (to > end) continue;

      addRequest(id++, e.id, type.id, from, to, ra.pick(STATE_MIX), ra.pick(REASONS));
    }
  }
}

/* ── Balances ────────────────────────────────────────────────────────── */

/**
 * `pending` exists because approval now blocks past zero (§3.6): the UI has to
 * show the wall coming rather than report it on arrival. `remaining` therefore
 * subtracts both taken and pending, and is clamped at zero — a balance can
 * never go negative.
 */
export function balancesFor(employeeId: number): LeaveBalance[] {
  const mine = leaveAllocations.filter(
    (a) => a.employee_id === employeeId && a.state === "APPROVED",
  );
  const requests = timeOffRequests.filter((r) => r.employee_id === employeeId);

  return timeOffTypes
    .filter((t) => t.requires_allocation)
    .map((type) => {
      const allocated = mine
        .filter((a) => a.time_off_type_id === type.id)
        .reduce((sum, a) => sum + Number(a.days), 0);
      const of = (state: RequestState) =>
        requests
          .filter((r) => r.time_off_type_id === type.id && r.state === state)
          .reduce((sum, r) => sum + Number(r.duration_days), 0);

      const taken = of("APPROVED");
      const pending = of("TO_APPROVE");
      const window = mine.find((a) => a.time_off_type_id === type.id);

      return {
        employee_id: employeeId,
        time_off_type_id: type.id,
        time_off_type_name: type.name,
        unit: type.unit,
        is_paid: type.is_paid,
        allocated: decimal(allocated),
        taken: decimal(taken),
        pending: decimal(pending),
        remaining: decimal(Math.max(0, allocated - taken - pending)),
        validity_from: window?.validity_from ?? null,
        validity_to: window?.validity_to ?? null,
      };
    });
}
