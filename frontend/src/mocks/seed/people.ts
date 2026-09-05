/**
 * PEOPLE, PLACES AND THE CALENDAR THEY WORK TO
 *
 * Departments, job positions, working schedules, public holidays, the five
 * demo logins and the thirty employees — PRD §9's first four bullets.
 *
 * **The employee table is written out by hand rather than generated.** Faker
 * would be shorter, but every edge case in PRD §9 is a *specific person*: the
 * three with no bank details, the joiner, the leaver, the two on nights. Those
 * have to be placed deliberately and be findable by name when a payslip looks
 * wrong at hour 40. Generated noise fills the gaps around them, not the middle.
 */
import type {
  Department, Employee, EmployeeType, JobPosition, PublicHoliday, WorkingSchedule,
} from "@/api/contract";
import type { Role } from "@/auth/rbac";
import { OPEN_PERIOD } from "./anchor";
import { crossesMidnight, decimal, monthStart, shiftMinutes } from "@/lib/date";

/* ── Departments and positions ───────────────────────────────────────── */

const DEPARTMENT_ROWS = [
  { id: 1, name: "Engineering", code: "ENG" },
  { id: 2, name: "Operations", code: "OPS" },
  { id: 3, name: "Finance", code: "FIN" },
  { id: 4, name: "People & Culture", code: "PPL" },
] as const;

const POSITION_ROWS = [
  { id: 1, title: "Engineering Manager", department_id: 1 },
  { id: 2, title: "Senior Software Engineer", department_id: 1 },
  { id: 3, title: "Software Engineer", department_id: 1 },
  { id: 4, title: "QA Engineer", department_id: 1 },
  { id: 5, title: "Operations Manager", department_id: 2 },
  { id: 6, title: "Shift Supervisor", department_id: 2 },
  { id: 7, title: "Operations Associate", department_id: 2 },
  { id: 8, title: "Logistics Coordinator", department_id: 2 },
  { id: 9, title: "Payroll Manager", department_id: 3 },
  { id: 10, title: "Payroll Executive", department_id: 3 },
  { id: 11, title: "Head of People", department_id: 4 },
  { id: 12, title: "HR Manager", department_id: 4 },
] as const;

/* ── Working schedules ───────────────────────────────────────────────── */

interface ScheduleSpec {
  id: number;
  name: string;
  days: number[];
  start: string;
  end: string;
  break_minutes: number;
}

const SCHEDULE_SPECS: ScheduleSpec[] = [
  { id: 1, name: "Standard · 40 hours", days: [0, 1, 2, 3, 4], start: "09:00", end: "18:00", break_minutes: 60 },
  { id: 2, name: "Part-time · 20 hours", days: [0, 1, 2, 3, 4], start: "09:30", end: "13:30", break_minutes: 0 },
  // PRD §9: proves the midnight fix. `end_time < start_time` ⇒ ends next day.
  { id: 3, name: "Night · 22:00–06:00", days: [0, 1, 2, 3, 4], start: "22:00", end: "06:00", break_minutes: 30 },
];

/**
 * `hours_per_week` and `daily_hours` are **computed here, from the lines**,
 * exactly as spec A3 requires of the server — writing them by hand in a
 * fixture is how a mock quietly stops matching the API it stands in for.
 */
export const schedules: WorkingSchedule[] = SCHEDULE_SPECS.map((s) => {
  const perDay = shiftMinutes(s.start, s.end, s.break_minutes) / 60;
  return {
    id: s.id,
    name: s.name,
    timezone: "Asia/Kolkata",
    hours_per_week: decimal(perDay * s.days.length),
    daily_hours: decimal(perDay),
    crosses_midnight: crossesMidnight(s.start, s.end),
    lines: s.days.map((day, i) => ({
      id: s.id * 10 + i,
      day_of_week: day,
      start_time: `${s.start}:00`,
      end_time: `${s.end}:00`,
      break_minutes: s.break_minutes,
    })),
  };
});

export const scheduleById = new Map(schedules.map((s) => [s.id, s]));

/** Working days per schedule, as a Monday-indexed set — used all over §4.2. */
export const scheduleWorkingDays = new Map<number, Set<number>>(
  SCHEDULE_SPECS.map((s) => [s.id, new Set(s.days)]),
);

/* ── Public holidays ─────────────────────────────────────────────────── */

/**
 * Fourteen across the seeded months (PRD §9). The brief never mentions
 * holidays; §3.5 explains why they are here anyway — without them `period_days`
 * counts Diwali as a working day and mis-prorates every joiner and leaver.
 *
 * Optional holidays are seeded because they must *not* reduce `period_days`,
 * and a rule with no counter-example in the fixtures is a rule nobody tests.
 * Ganesh Chaturthi falls inside a seeded leave request, on purpose (PRD §9) —
 * the request spans it and must not consume balance for it.
 */
export const holidays: PublicHoliday[] = [
  { id: 1, name: "Shivaji Jayanti", date: "2026-02-19", is_optional: false },
  { id: 2, name: "Holi", date: "2026-03-03", is_optional: false },
  { id: 3, name: "Dhulivandan", date: "2026-03-04", is_optional: true },
  { id: 4, name: "Gudi Padwa", date: "2026-03-19", is_optional: false },
  { id: 5, name: "Ram Navami", date: "2026-03-26", is_optional: false },
  { id: 6, name: "Annual bank closing", date: "2026-04-01", is_optional: false },
  { id: 7, name: "Dr. Ambedkar Jayanti", date: "2026-04-14", is_optional: false },
  { id: 8, name: "Mahavir Jayanti", date: "2026-04-30", is_optional: true },
  { id: 9, name: "Maharashtra Day", date: "2026-05-01", is_optional: false },
  { id: 10, name: "Buddha Purnima", date: "2026-05-29", is_optional: false },
  { id: 11, name: "Bakri Id", date: "2026-06-26", is_optional: false },
  { id: 12, name: "Muharram", date: "2026-07-27", is_optional: false },
  // Falls on a Saturday in 2026 — a real holiday that reduces `period_days`
  // by nothing at all on a Mon–Fri schedule. Worth having in the data.
  { id: 13, name: "Independence Day", date: "2026-08-15", is_optional: false },
  { id: 14, name: "Ganesh Chaturthi", date: "2026-08-26", is_optional: false },
];

/** Non-optional only — the set §4.2 subtracts from `period_days`. */
export const blockingHolidays = new Set(
  holidays.filter((h) => !h.is_optional).map((h) => h.date),
);

/* ── The thirty ──────────────────────────────────────────────────────── */

const OPEN = OPEN_PERIOD; // the month currently being paid

interface PersonSpec {
  id: number;
  name: string;
  department_id: number;
  job_position_id: number;
  manager_id: number | null;
  schedule_id: number;
  type: EmployeeType;
  joined: string;
  exit?: string;
  /** Omitted on the three PRD §9 requires without bank details. */
  bank?: false;
  /** Monthly contract wage, in whole rupees. */
  wage: number;
}

const PEOPLE: PersonSpec[] = [
  // Leadership and the five demo logins.
  { id: 1,  name: "Asha Menon",       department_id: 4, job_position_id: 11, manager_id: null, schedule_id: 1, type: "FULL_TIME", joined: "2019-06-03", wage: 185000 },
  { id: 2,  name: "Ravi Deshmukh",    department_id: 3, job_position_id: 9,  manager_id: 1,    schedule_id: 1, type: "FULL_TIME", joined: "2020-01-13", wage: 142000 },
  { id: 3,  name: "Neha Kulkarni",    department_id: 3, job_position_id: 10, manager_id: 2,    schedule_id: 1, type: "FULL_TIME", joined: "2021-07-05", wage: 78000 },
  { id: 4,  name: "Imran Shaikh",     department_id: 4, job_position_id: 12, manager_id: 1,    schedule_id: 1, type: "FULL_TIME", joined: "2020-09-14", wage: 96000 },
  { id: 5,  name: "Sneha Patil",      department_id: 1, job_position_id: 3,  manager_id: 6,    schedule_id: 1, type: "FULL_TIME", joined: "2022-03-01", wage: 64000 },

  // Engineering.
  { id: 6,  name: "Vikram Rao",       department_id: 1, job_position_id: 1,  manager_id: 1,    schedule_id: 1, type: "FULL_TIME", joined: "2019-11-18", wage: 158000 },
  { id: 7,  name: "Ananya Iyer",      department_id: 1, job_position_id: 2,  manager_id: 6,    schedule_id: 1, type: "FULL_TIME", joined: "2021-02-08", wage: 112000 },
  { id: 8,  name: "Rohit Bhosale",    department_id: 1, job_position_id: 2,  manager_id: 6,    schedule_id: 1, type: "FULL_TIME", joined: "2021-06-21", wage: 105000 },
  // The raise on the 16th — an adjacent contract pair (PRD §3.2, §9).
  { id: 9,  name: "Kavya Reddy",      department_id: 1, job_position_id: 3,  manager_id: 6,    schedule_id: 1, type: "FULL_TIME", joined: "2022-08-16", wage: 72000 },
  { id: 10, name: "Aditya Joshi",     department_id: 1, job_position_id: 3,  manager_id: 6,    schedule_id: 1, type: "FULL_TIME", joined: "2023-01-09", wage: 68000 },
  { id: 11, name: "Farhan Qureshi",   department_id: 1, job_position_id: 4,  manager_id: 6,    schedule_id: 1, type: "CONTRACT",  joined: "2024-04-15", wage: 55000 },
  { id: 12, name: "Meera Ghosh",      department_id: 1, job_position_id: 4,  manager_id: 6,    schedule_id: 1, type: "FULL_TIME", joined: "2023-05-22", bank: false, wage: 61000 },
  { id: 13, name: "Nikhil Save",      department_id: 1, job_position_id: 3,  manager_id: 6,    schedule_id: 2, type: "PART_TIME", joined: "2024-02-05", wage: 34000 },
  { id: 14, name: "Tanvi Kelkar",     department_id: 1, job_position_id: 3,  manager_id: 6,    schedule_id: 1, type: "INTERN",    joined: "2026-01-12", wage: 25000 },

  // Operations.
  { id: 15, name: "Priya Nair",       department_id: 2, job_position_id: 5,  manager_id: 1,    schedule_id: 1, type: "FULL_TIME", joined: "2020-03-02", wage: 134000 },
  { id: 16, name: "Sameer Chavan",    department_id: 2, job_position_id: 6,  manager_id: 15,   schedule_id: 1, type: "FULL_TIME", joined: "2021-10-11", wage: 82000 },
  { id: 17, name: "Divya Menon",      department_id: 2, job_position_id: 7,  manager_id: 15,   schedule_id: 1, type: "FULL_TIME", joined: "2022-06-13", wage: 58000 },
  { id: 18, name: "Arjun Pawar",      department_id: 2, job_position_id: 7,  manager_id: 15,   schedule_id: 1, type: "FULL_TIME", joined: "2022-11-07", wage: 56000 },
  { id: 19, name: "Ishita Banerjee",  department_id: 2, job_position_id: 8,  manager_id: 15,   schedule_id: 1, type: "FULL_TIME", joined: "2023-03-20", wage: 62000 },
  { id: 20, name: "Zaid Ansari",      department_id: 2, job_position_id: 7,  manager_id: 15,   schedule_id: 1, type: "CONTRACT",  joined: "2024-08-05", wage: 48000 },
  { id: 21, name: "Pooja Gaikwad",    department_id: 2, job_position_id: 8,  manager_id: 15,   schedule_id: 1, type: "FULL_TIME", joined: "2023-09-11", bank: false, wage: 59000 },
  // The night shift, 22:00 → 06:00.
  { id: 22, name: "Harshad More",     department_id: 2, job_position_id: 6,  manager_id: 15,   schedule_id: 3, type: "FULL_TIME", joined: "2022-01-17", wage: 74000 },
  { id: 23, name: "Ritika Sharma",    department_id: 2, job_position_id: 7,  manager_id: 15,   schedule_id: 3, type: "FULL_TIME", joined: "2023-07-24", wage: 60000 },
  // The leaver — exits on the 10th of the open period.
  { id: 24, name: "Manoj Tiwari",     department_id: 2, job_position_id: 7,  manager_id: 15,   schedule_id: 1, type: "FULL_TIME", joined: "2021-04-19", exit: `${OPEN}-10`, wage: 57000 },

  // People & Culture.
  { id: 25, name: "Lakshmi Subramanian", department_id: 4, job_position_id: 12, manager_id: 4, schedule_id: 1, type: "FULL_TIME", joined: "2022-05-16", wage: 71000 },
  { id: 26, name: "Gaurav Deshpande", department_id: 4, job_position_id: 12, manager_id: 4,    schedule_id: 2, type: "PART_TIME", joined: "2024-09-02", wage: 38000 },
  { id: 27, name: "Nandini Rane",     department_id: 4, job_position_id: 12, manager_id: 4,    schedule_id: 1, type: "INTERN",    joined: "2026-02-02", bank: false, wage: 26000 },

  // Finance.
  { id: 28, name: "Suresh Kamble",    department_id: 3, job_position_id: 10, manager_id: 2,    schedule_id: 1, type: "FULL_TIME", joined: "2021-12-06", wage: 76000 },
  { id: 29, name: "Ayesha Khan",      department_id: 3, job_position_id: 10, manager_id: 2,    schedule_id: 1, type: "FULL_TIME", joined: "2023-02-13", wage: 69000 },
  // The joiner — starts on the 12th of the open period.
  { id: 30, name: "Rahul Verma",      department_id: 3, job_position_id: 10, manager_id: 2,    schedule_id: 1, type: "FULL_TIME", joined: `${OPEN}-12`, wage: 66000 },
];

/** Monthly wage per employee — the contract generator's input. */
export const WAGE_BY_EMPLOYEE = new Map(PEOPLE.map((p) => [p.id, p.wage]));

const slug = (name: string) => name.toLowerCase().replace(/[^a-z]+/g, ".");

/**
 * IFSC has a validated shape (`^[A-Z]{4}0[A-Z0-9]{6}$`, PRD §3.9), so the
 * fixtures have to satisfy it — a mock that ships invalid data teaches the
 * form the wrong lesson.
 */
const ifscFor = (id: number) => `HDFC0${String(900000 + id * 7).slice(0, 6)}`;
const accountFor = (id: number) => String(50100_000000 + id * 137_911);

/**
 * `as const` on the row tables narrows their ids to literal unions, which then
 * narrows these maps' key type — and a lookup by a plain `number` stops
 * compiling. The tables stay `as const` because the literals are useful
 * elsewhere; the maps are widened here instead.
 */
const nameById = new Map<number, string>(PEOPLE.map((p) => [p.id, p.name]));
const departmentNameById = new Map<number, string>(DEPARTMENT_ROWS.map((d) => [d.id, d.name]));
const positionTitleById = new Map<number, string>(POSITION_ROWS.map((p) => [p.id, p.title]));

export const employees: Employee[] = PEOPLE.map((p) => ({
  id: p.id,
  employee_number: `PP-${String(p.id).padStart(4, "0")}`,
  full_name: p.name,
  email: `${slug(p.name)}@paypulse.app`,
  phone: `+91 9${String(80000000 + p.id * 1_234_567).slice(0, 9)}`,
  department_id: p.department_id,
  department_name: departmentNameById.get(p.department_id) ?? null,
  job_position_id: p.job_position_id,
  job_title: positionTitleById.get(p.job_position_id) ?? null,
  manager_id: p.manager_id,
  manager_name: p.manager_id === null ? null : (nameById.get(p.manager_id) ?? null),
  working_schedule_id: p.schedule_id,
  employee_type: p.type,
  // §3.3: derived from `date_of_exit` on write, stored for cheap filtering.
  status: p.exit ? "INACTIVE" : "ACTIVE",
  date_of_joining: p.joined,
  date_of_exit: p.exit ?? null,
  bank_account: p.bank === false ? null : accountFor(p.id),
  bank_ifsc: p.bank === false ? null : ifscFor(p.id),
  user_id: null, // filled in below, for the five who can sign in
}));

export const employeeById = new Map(employees.map((e) => [e.id, e]));

/** Named references, so the payrun and warning fixtures read as prose. */
export const CAST = {
  /** Two contracts inside the open period — a raise on the 16th. */
  raise: 9,
  /** No bank account or IFSC — `MISSING_BANK_DETAILS` on stage. */
  noBank: [12, 21, 27],
  /** Joins on the 12th; leaves on the 10th. Both make `PRORATED_PERIOD` real. */
  joiner: 30,
  leaver: 24,
  /** 22:00 → 06:00. */
  night: [22, 23],
  /** The HR manager whose `?scope=my_team` returns a non-empty list. */
  teamLead: 15,
} as const;

/* ── Logins ──────────────────────────────────────────────────────────── */

export interface MockUser {
  id: number;
  email: string;
  full_name: string;
  role: Role;
  employee_id: number | null;
  is_active: boolean;
  password: string;
}

/**
 * The same five accounts and the same password as
 * `backend/app/db/seed.py::SEED_USERS`. Deliberately identical: switching
 * `VITE_API_MODE` must not change how you sign in, or the flag stops being a
 * flag and becomes a second product.
 */
/*
 * `paypulse`, and the accounts below are `*@paypulse.app` — because that is
 * what `backend/app/db/seed.py::SEED_USERS` actually seeds. They had drifted
 * to `peoplepay` / `*@paypulse.app`, which made the promise three lines
 * above this false: switching `VITE_API_MODE` meant nobody could sign in,
 * which is precisely the "demo where the thing that breaks is the seam"
 * that `api/mode.ts` exists to prevent. PRD §13 names `*@paypulse.app` and
 * `paypulse` as the canonical pair. Found by the P15 rename pass.
 */
export const DEMO_PASSWORD = "paypulse";

export const users: MockUser[] = [
  { id: 1, email: "admin@paypulse.app",           full_name: "Asha Menon",     role: "ADMIN",              employee_id: 1, is_active: true, password: DEMO_PASSWORD },
  { id: 2, email: "payroll.manager@paypulse.app", full_name: "Ravi Deshmukh",  role: "HR_PAYROLL_MANAGER", employee_id: 2, is_active: true, password: DEMO_PASSWORD },
  { id: 3, email: "payroll.user@paypulse.app",    full_name: "Neha Kulkarni",  role: "HR_PAYROLL_USER",    employee_id: 3, is_active: true, password: DEMO_PASSWORD },
  { id: 4, email: "hr.manager@paypulse.app",      full_name: "Imran Shaikh",   role: "HR_MANAGER",         employee_id: 4, is_active: true, password: DEMO_PASSWORD },
  { id: 5, email: "employee@paypulse.app",        full_name: "Sneha Patil",    role: "EMPLOYEE",           employee_id: 5, is_active: true, password: DEMO_PASSWORD },
];

for (const u of users) {
  const e = u.employee_id === null ? undefined : employeeById.get(u.employee_id);
  if (e) e.user_id = u.id;
}

/**
 * `HR_MANAGER`'s `?scope=my_team` needs a team. Imran manages People & Culture
 * outright; give him the Operations line managers too, so the scoped list is
 * cross-departmental and the filter is visibly doing something.
 */
for (const id of [15, 16] as const) {
  const e = employeeById.get(id);
  if (e && e.id !== 4) {
    e.manager_id = 4;
    e.manager_name = "Imran Shaikh";
  }
}

/* ── Counted collections ─────────────────────────────────────────────── */

const countBy = <T,>(rows: T[], key: (row: T) => number | null) => {
  const counts = new Map<number, number>();
  for (const row of rows) {
    const k = key(row);
    if (k !== null) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts;
};

const employeesPerDepartment = countBy(employees, (e) => e.department_id);
const employeesPerPosition = countBy(employees, (e) => e.job_position_id);

export const departments: Department[] = DEPARTMENT_ROWS.map((d) => ({
  id: d.id,
  name: d.name,
  code: d.code,
  manager_id: employees.find((e) => e.department_id === d.id && e.manager_id === 1)?.id ?? null,
  employee_count: employeesPerDepartment.get(d.id) ?? 0,
}));

export const jobPositions: JobPosition[] = POSITION_ROWS.map((p) => ({
  id: p.id,
  title: p.title,
  department_id: p.department_id,
  employee_count: employeesPerPosition.get(p.id) ?? 0,
}));

/** The first day of the open period — used by several downstream generators. */
export const OPEN_PERIOD_START = monthStart(OPEN);
