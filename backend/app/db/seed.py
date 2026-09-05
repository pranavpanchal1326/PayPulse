"""Seed script.

B0 seeded one user per role. B1 adds the master data those users operate on:
departments, job positions, working schedules, and an employee record for
each login.

The employee records are not decoration. `require()` refuses an own-scoped
role whose account has no employee link, so without them the EMPLOYEE demo
account gets a 403 on every request it is supposed to be able to make.

The full 30-employee dataset with contracts, attendance, leave and historical
payruns is B10 (PRD section 9).

Idempotent: re-running updates existing rows rather than duplicating them.
Run with:  docker compose exec api python -m app.db.seed
"""
from __future__ import annotations

import logging
import random
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.enums import ContractState, EmployeeType, LeaveUnit, RequestState, Role
from app.core.errors import BusinessRuleError
from app.core.security import hash_password
from app.models.attendance import Attendance
from app.models.contract import Contract
from app.models.employee import Employee
from app.models.holiday import PublicHoliday
from app.models.organization import Department, JobPosition
from app.models.schedule import WorkingSchedule, WorkingScheduleLine
from app.models.timeoff import LeaveAllocation, TimeOffRequest, TimeOffType
from app.models.user import User
from app.services import (
    attendance_service,
    employee_service,
    leave_engine,
    schedule_calc,
)
from app.services import (
    calendar as calendar_service,
)

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger("seed")

DEMO_PASSWORD = "paypulse"  # nosec - local demo credentials only

SEED_USERS: list[tuple[str, str, Role]] = [
    ("admin@paypulse.app", "Asha Menon", Role.ADMIN),
    ("payroll.manager@paypulse.app", "Ravi Deshmukh", Role.HR_PAYROLL_MANAGER),
    ("payroll.user@paypulse.app", "Neha Kulkarni", Role.HR_PAYROLL_USER),
    ("hr.manager@paypulse.app", "Imran Shaikh", Role.HR_MANAGER),
    ("employee@paypulse.app", "Sneha Patil", Role.EMPLOYEE),
]

DEPARTMENTS: list[tuple[str, str]] = [
    ("Engineering", "Product development and platform"),
    ("Human Resources", "People operations, hiring and payroll"),
    ("Sales", "Revenue, accounts and partnerships"),
    ("Operations", "Delivery, support and internal systems"),
]

JOB_POSITIONS: list[tuple[str, str]] = [
    ("Software Engineer", "Engineering"),
    ("Senior Software Engineer", "Engineering"),
    ("Engineering Manager", "Engineering"),
    ("QA Engineer", "Engineering"),
    ("HR Executive", "Human Resources"),
    ("HR Manager", "Human Resources"),
    ("Payroll Executive", "Human Resources"),
    ("Payroll Manager", "Human Resources"),
    ("Sales Executive", "Sales"),
    ("Account Manager", "Sales"),
    ("Operations Analyst", "Operations"),
    ("Support Engineer", "Operations"),
]

# (name, [(day_of_week, start, end, break_minutes)])
# Monday is 0. The night shift ends before it starts on purpose: that is how
# a midnight-crossing pattern is expressed, and it is the fixture that proves
# schedule_calc handles it (22:00-06:00 less a 60 min break = 7h, not -16).
SCHEDULES: list[tuple[str, list[tuple[int, time, time, int]]]] = [
    (
        "Standard 40h",
        [(d, time(9, 0), time(18, 0), 60) for d in range(5)],
    ),
    (
        "Part-time 20h",
        [(d, time(9, 0), time(13, 0), 0) for d in range(5)],
    ),
    (
        "Night Shift 35h",
        [(d, time(22, 0), time(6, 0), 60) for d in range(5)],
    ),
]

# (user email, first, last, department, position, schedule, type, joined)
SEED_EMPLOYEES: list[tuple[str, str, str, str, str, str, EmployeeType, date]] = [
    (
        "admin@paypulse.app", "Asha", "Menon", "Operations",
        "Operations Analyst", "Standard 40h", EmployeeType.FULL_TIME,
        date(2021, 4, 1),
    ),
    (
        "payroll.manager@paypulse.app", "Ravi", "Deshmukh", "Human Resources",
        "Payroll Manager", "Standard 40h", EmployeeType.FULL_TIME,
        date(2021, 7, 12),
    ),
    (
        "payroll.user@paypulse.app", "Neha", "Kulkarni", "Human Resources",
        "Payroll Executive", "Standard 40h", EmployeeType.FULL_TIME,
        date(2022, 2, 1),
    ),
    (
        "hr.manager@paypulse.app", "Imran", "Shaikh", "Human Resources",
        "HR Manager", "Standard 40h", EmployeeType.FULL_TIME,
        date(2020, 9, 15),
    ),
    (
        "employee@paypulse.app", "Sneha", "Patil", "Engineering",
        "Software Engineer", "Standard 40h", EmployeeType.FULL_TIME,
        date(2023, 6, 5),
    ),
]

# Who reports to whom, by user email. Gives ?scope=my_team something to show.
REPORTING_LINES: list[tuple[str, str]] = [
    ("payroll.user@paypulse.app", "payroll.manager@paypulse.app"),
    ("payroll.manager@paypulse.app", "hr.manager@paypulse.app"),
    ("employee@paypulse.app", "hr.manager@paypulse.app"),
]

# Deliberately left without bank details so MISSING_BANK_DETAILS has
# something to fire on once B7 lands.
WITHOUT_BANK_DETAILS = {"employee@paypulse.app"}


# (user email, wage, start, end, state) - several employees carry history so
# period-based selection has something to select between.
#
# Sneha's pair is the demo beat: a raise on 16 Jul 2026 leaves two adjacent
# RUNNING contracts. They do not overlap, so the exclusion constraint allows
# both, and the resolver picks the later one and warns. The date sits in a
# completed month so the payrun has real attendance to work from. PRD v1
# would have
# refused to pay her at all.
SEED_CONTRACTS: list[tuple[str, str, date, date | None, ContractState]] = [
    ("admin@paypulse.app", "95000.00", date(2021, 4, 1), None, ContractState.RUNNING),
    (
        "payroll.manager@paypulse.app", "68000.00",
        date(2021, 7, 12), date(2024, 3, 31), ContractState.EXPIRED,
    ),
    (
        "payroll.manager@paypulse.app", "82000.00",
        date(2024, 4, 1), None, ContractState.RUNNING,
    ),
    (
        "payroll.user@paypulse.app", "54000.00",
        date(2022, 2, 1), None, ContractState.RUNNING,
    ),
    (
        "hr.manager@paypulse.app", "76000.00",
        date(2020, 9, 15), None, ContractState.RUNNING,
    ),
    (
        "employee@paypulse.app", "40000.00",
        date(2023, 6, 5), date(2026, 7, 15), ContractState.RUNNING,
    ),
    (
        "employee@paypulse.app", "55000.00",
        date(2026, 7, 16), None, ContractState.RUNNING,
    ),
]


# Indian public holidays. Fixed-date national holidays (Republic Day,
# Independence Day, Gandhi Jayanti, Christmas) are exact; the lunar-calendar
# festivals are APPROXIMATE - this is demo data, not an authoritative
# calendar. Confirm against a real almanac before anyone is paid from it.
#
# Two of these deliberately fall on a weekend (Independence Day 2026 is a
# Saturday, Diwali a Sunday). A holiday on a non-working day must not change
# period_days, and the seed carries the case so that stays visible.
SEED_HOLIDAYS: list[tuple[date, str, bool]] = [
    (date(2026, 1, 1), "New Year's Day", True),      # optional/restricted
    (date(2026, 1, 26), "Republic Day", False),      # Monday
    (date(2026, 3, 4), "Holi (approx)", False),      # Wednesday
    (date(2026, 3, 21), "Eid al-Fitr (approx)", False),   # Saturday
    (date(2026, 4, 14), "Ambedkar Jayanti", False),  # Tuesday
    (date(2026, 5, 1), "Maharashtra Day", False),    # Friday
    (date(2026, 8, 15), "Independence Day", False),  # Saturday
    (date(2026, 10, 2), "Gandhi Jayanti", False),    # Friday
    (date(2026, 10, 20), "Dussehra (approx)", False),     # Tuesday
    (date(2026, 11, 8), "Diwali (approx)", False),   # Sunday
    (date(2026, 11, 24), "Guru Nanak Jayanti (approx)", False),
    (date(2026, 12, 25), "Christmas Day", False),    # Friday
]


# Attendance is seeded over a ROLLING window ending yesterday rather than
# fixed dates: attendance dated in the future is invalid (the API rejects
# it), so a hardcoded window would rot within days. The exception pattern is
# seeded from a fixed RNG seed, so the *shape* of the data - which days are
# late, absent, or missing a check-out - is identical on every run.
# Must cover the historical payrun window (6 months): a month with no
# attendance reads as 100% absent, which charges a full month of LWP and
# produces a negative net the engine correctly refuses to validate.

# ---------------------------------------------------------------------------
# The rest of the company.
#
# The five above own the demo logins and every scripted beat - the mid-month
# raise, the missing bank details, the reporting lines - so they are written
# out by hand and never generated. A five-person payroll, though, makes the
# department chart, the low-balance panel and the salary-cost breakdown look
# like placeholder art, so the remaining headcount is generated here.
#
# Deterministic: one fixed seed, so a re-seed produces the same company and a
# screenshot taken today still matches the data next week.
# ---------------------------------------------------------------------------

GENERATED_HEADCOUNT = 35
COMPANY_RNG_SEED = 20260901

_FIRST_NAMES = [
    "Aarav", "Ananya", "Rohan", "Priya", "Vikram", "Meera", "Arjun", "Divya",
    "Karthik", "Shreya", "Nikhil", "Pooja", "Siddharth", "Anjali", "Rahul",
    "Kavya", "Manish", "Ishita", "Aditya", "Tanvi", "Harsh", "Sanjana",
    "Varun", "Nisha", "Gaurav", "Ritika", "Sameer", "Aditi", "Yash", "Swara",
    "Abhishek", "Lakshmi", "Pranav", "Deepa", "Rohit", "Sneha", "Kunal",
]
_LAST_NAMES = [
    "Sharma", "Iyer", "Reddy", "Nair", "Gupta", "Joshi", "Rao", "Bhat",
    "Chowdhury", "Malhotra", "Pillai", "Sinha", "Kaur", "Verma", "Das",
    "Kulkarni", "Mehta", "Banerjee", "Agarwal", "Naidu", "Fernandes", "Bose",
]

# position -> (monthly wage floor, ceiling). Bands, not random numbers: a QA
# engineer earning more than the engineering manager makes every chart on the
# dashboard nonsense.
_WAGE_BANDS: dict[str, tuple[int, int]] = {
    "Software Engineer": (45_000, 70_000),
    "Senior Software Engineer": (80_000, 120_000),
    "Engineering Manager": (130_000, 170_000),
    "QA Engineer": (38_000, 58_000),
    "HR Executive": (32_000, 46_000),
    "HR Manager": (70_000, 95_000),
    "Payroll Executive": (38_000, 55_000),
    "Payroll Manager": (75_000, 100_000),
    "Sales Executive": (35_000, 55_000),
    "Account Manager": (60_000, 85_000),
    "Operations Analyst": (42_000, 62_000),
    "Support Engineer": (34_000, 50_000),
}

# Headcount per department, and which positions it draws from.
_DEPARTMENT_PLAN: list[tuple[str, int, list[str]]] = [
    ("Engineering", 13, [
        "Software Engineer", "Software Engineer", "Senior Software Engineer",
        "QA Engineer", "Engineering Manager",
    ]),
    ("Sales", 9, ["Sales Executive", "Sales Executive", "Account Manager"]),
    ("Operations", 8, ["Operations Analyst", "Support Engineer"]),
    ("Human Resources", 5, ["HR Executive", "Payroll Executive", "HR Manager"]),
]


def _generate_company() -> tuple[list, list, dict, set, list]:
    """Build the generated half of the company.

    Returns (employees, contracts, exits, without_bank, allocations) in the
    same shapes the hand-written SEED_* lists use, so every seeding function
    below treats both halves identically.
    """
    rng = random.Random(COMPANY_RNG_SEED)
    employees: list = []
    contracts: list = []
    exits: dict[str, date] = {}
    without_bank: set[str] = set()
    allocations: list = []

    used_names: set[tuple[str, str]] = set()
    made = 0

    for department, headcount, positions in _DEPARTMENT_PLAN:
        for _ in range(headcount):
            if made >= GENERATED_HEADCOUNT:
                break

            while True:
                first = rng.choice(_FIRST_NAMES)
                last = rng.choice(_LAST_NAMES)
                if (first, last) not in used_names:
                    used_names.add((first, last))
                    break
            email = f"{first.lower()}.{last.lower()}@paypulse.app"
            position = rng.choice(positions)

            # Mostly full time on the standard week. The other shapes exist
            # because payroll has to prove it prorates them, not for variety.
            roll = rng.random()
            if roll < 0.76:
                emp_type, schedule = EmployeeType.FULL_TIME, "Standard 40h"
            elif roll < 0.86:
                emp_type, schedule = EmployeeType.PART_TIME, "Part-time 20h"
            elif roll < 0.94:
                emp_type, schedule = EmployeeType.CONTRACT, "Standard 40h"
            else:
                emp_type, schedule = EmployeeType.INTERN, "Part-time 20h"
            if department == "Operations" and rng.random() < 0.25:
                schedule = "Night Shift 35h"   # support runs a night rota

            joined = date(2019, 1, 1) + timedelta(days=rng.randrange(0, 2400))
            employees.append(
                (email, first, last, department, position, schedule,
                 emp_type, joined)
            )

            low, high = _WAGE_BANDS[position]
            wage = f"{rng.randrange(low, high, 500)}.00"

            # A tenth of the company left at some point: the roster needs
            # INACTIVE rows, and payroll needs to prove it does not pay them.
            if rng.random() < 0.10:
                left = joined + timedelta(days=rng.randrange(400, 1800))
                if left < date.today():
                    exits[email] = left
                    contracts.append(
                        (email, wage, joined, left, ContractState.EXPIRED)
                    )
                    made += 1
                    continue

            contracts.append((email, wage, joined, None, ContractState.RUNNING))

            # Some genuinely have no bank details on file. That is what
            # MISSING_BANK_DETAILS is for, and it should fire on more than one
            # person or the warning looks like a fixture.
            if rng.random() < 0.09:
                without_bank.add(email)

            allocations.append(
                (email, "AL", str(rng.choice([12, 15, 18, 21])),
                 date(2026, 1, 1), date(2026, 12, 31))
            )
            if rng.random() < 0.55:
                allocations.append(
                    (email, "SL", str(rng.choice([6, 8, 10])),
                     date(2026, 1, 1), date(2026, 12, 31))
                )
            made += 1

    return employees, contracts, exits, without_bank, allocations


(
    _GEN_EMPLOYEES,
    _GEN_CONTRACTS,
    EMPLOYEE_EXITS,
    _GEN_WITHOUT_BANK,
    _GEN_ALLOCATIONS,
) = _generate_company()

SEED_EMPLOYEES += _GEN_EMPLOYEES
SEED_CONTRACTS += _GEN_CONTRACTS
WITHOUT_BANK_DETAILS |= _GEN_WITHOUT_BANK


def _generate_leave_plan() -> list[tuple[str, str, int, int, "RequestState"]]:
    """Leave for the generated half of the company.

    Windows are drawn from fixed, non-overlapping slots rather than at random:
    two spans that touched would be a double claim on the same day, which the
    overlap guard exists to reject, and seeding data the API would refuse is a
    good way to ship a fixture nobody can reproduce.

    A few people are deliberately taken close to the bottom of their annual
    allocation, so the dashboard's low-balance panel has something true to say.
    """
    rng = random.Random(COMPANY_RNG_SEED + 1)
    # (start days ago, end days ago) - ordered, disjoint, all in the past.
    slots = [(165, 161), (140, 136), (118, 116), (96, 93), (74, 72),
             (52, 50), (33, 31)]
    plan: list[tuple[str, str, int, int, RequestState]] = []

    for email, *_ in _GEN_EMPLOYEES:
        if email in EMPLOYEE_EXITS:
            continue                      # nobody books leave after leaving
        if rng.random() < 0.35:
            continue                      # not everyone takes leave

        # A tenth of the company is near the end of its allowance.
        heavy = rng.random() < 0.12
        picks = rng.sample(slots, rng.randrange(4, 7) if heavy else rng.randrange(1, 3))
        for start_ago, end_ago in picks:
            code = rng.choice(["AL", "AL", "AL", "SL", "CL"])
            plan.append((email, code, start_ago, end_ago, RequestState.APPROVED))

        # A couple of live requests each, so the approvals queue is not empty.
        if rng.random() < 0.20:
            plan.append((email, "AL", -14, -12, RequestState.TO_APPROVE))
        if rng.random() < 0.08:
            plan.append((email, "CL", -25, -25, RequestState.REFUSED))

    return plan


GENERATED_LEAVE_PLAN = _generate_leave_plan()

ATTENDANCE_DAYS = 200
ATTENDANCE_RNG_SEED = 20260101

# Deliberate exception rates, so the dashboard has something to report and
# absent_days is non-zero (PRD section 9).
P_ABSENT = 0.06
P_LATE = 0.10
P_MISSING_CHECKOUT = 0.04
P_OVERTIME = 0.12
P_MANUAL_EDIT = 0.03


# (code, name, unit, is_paid, requires_allocation, colour)
# The unpaid type is how leave reaches payroll as an LWP deduction: v3
# blocks approval past a balance rather than reclassifying the excess, so
# unpaid leave is a *type* choice, not a balance overflow (PRD section 3.6).
SEED_LEAVE_TYPES: list[tuple[str, str, LeaveUnit, bool, bool, str]] = [
    ("AL", "Annual Leave", LeaveUnit.DAYS, True, True, "#2563eb"),
    ("SL", "Sick Leave", LeaveUnit.DAYS, True, True, "#dc2626"),
    ("CL", "Casual Leave", LeaveUnit.DAYS, True, True, "#16a34a"),
    ("LWP", "Unpaid Leave", LeaveUnit.DAYS, False, False, "#78716c"),
    ("COMP", "Compensatory Off", LeaveUnit.HOURS, True, True, "#a855f7"),
]

# (user email, type code, days, validity_from, validity_to)
SEED_ALLOCATIONS: list[tuple[str, str, str, date, date]] = [
    ("admin@paypulse.app", "AL", "18", date(2026, 1, 1), date(2026, 12, 31)),
    ("payroll.manager@paypulse.app", "AL", "18", date(2026, 1, 1), date(2026, 12, 31)),
    ("payroll.user@paypulse.app", "AL", "15", date(2026, 1, 1), date(2026, 12, 31)),
    ("hr.manager@paypulse.app", "AL", "18", date(2026, 1, 1), date(2026, 12, 31)),
    ("employee@paypulse.app", "AL", "12", date(2026, 1, 1), date(2026, 12, 31)),
    ("employee@paypulse.app", "SL", "8", date(2026, 1, 1), date(2026, 12, 31)),
    ("payroll.user@paypulse.app", "SL", "8", date(2026, 1, 1), date(2026, 12, 31)),
]

# Leave for the generated half of the company.
SEED_ALLOCATIONS += _GEN_ALLOCATIONS

# Compensatory Off granted to every employee, so the hour-unit leave path
# has a balance to spend and to refuse against. Applied in seed_leave().
COMP_OFF_HOURS = Decimal("12")
COMP_VALID_FROM = date(2026, 1, 1)
COMP_VALID_TO = date(2026, 12, 31)


def seed_users(db: Session) -> None:
    for email, full_name, role in SEED_USERS:
        user = db.scalar(select(User).where(User.email == email))
        if user is None:
            user = User(email=email)
            db.add(user)
            action = "created"
        else:
            action = "updated"
        user.full_name = full_name
        user.role = role
        user.password_hash = hash_password(DEMO_PASSWORD)
        user.is_active = True
        logger.info("  user     %-8s %-32s %s", action, email, role)
    db.flush()


def seed_departments(db: Session) -> dict[str, Department]:
    result: dict[str, Department] = {}
    for name, description in DEPARTMENTS:
        row = db.scalar(select(Department).where(Department.name == name))
        if row is None:
            row = Department(name=name)
            db.add(row)
        row.description = description
        result[name] = row
    db.flush()
    logger.info("  departments        %d", len(result))
    return result


def seed_positions(
    db: Session, departments: dict[str, Department]
) -> dict[str, JobPosition]:
    result: dict[str, JobPosition] = {}
    for name, department_name in JOB_POSITIONS:
        row = db.scalar(select(JobPosition).where(JobPosition.name == name))
        if row is None:
            row = JobPosition(name=name)
            db.add(row)
        row.department_id = departments[department_name].id
        result[name] = row
    db.flush()
    logger.info("  job positions      %d", len(result))
    return result


def seed_schedules(db: Session) -> dict[str, WorkingSchedule]:
    result: dict[str, WorkingSchedule] = {}
    for name, lines in SCHEDULES:
        row = db.scalar(select(WorkingSchedule).where(WorkingSchedule.name == name))
        if row is None:
            row = WorkingSchedule(name=name)
            db.add(row)
        row.lines.clear()
        # Flush the orphan DELETEs before the new INSERTs. Without this
        # SQLAlchemy emits the inserts first within the same flush and
        # uq_schedule_line_day fires on the second run of the seed.
        db.flush()
        for day, start, end, break_minutes in lines:
            row.lines.append(
                WorkingScheduleLine(
                    day_of_week=day,
                    start_time=start,
                    end_time=end,
                    break_minutes=break_minutes,
                )
            )
        # Never hardcoded: computed exactly as the API computes it (spec A3).
        schedule_calc.recompute(row)
        result[name] = row
        logger.info("  schedule           %-18s %sh/week", name, row.hours_per_week)
    db.flush()
    return result


def seed_employees(
    db: Session,
    departments: dict[str, Department],
    positions: dict[str, JobPosition],
    schedules: dict[str, WorkingSchedule],
) -> dict[str, Employee]:
    by_email: dict[str, Employee] = {}

    for (
        user_email, first, last, department, position, schedule, emp_type, joined
    ) in SEED_EMPLOYEES:
        employee = db.scalar(
            select(Employee).where(Employee.work_email == user_email)
        )
        if employee is None:
            employee = Employee(work_email=user_email)
            db.add(employee)
        employee.first_name = first
        employee.last_name = last
        employee.department_id = departments[department].id
        employee.job_position_id = positions[position].id
        employee.working_schedule_id = schedules[schedule].id
        employee.employee_type = emp_type
        employee.date_of_joining = joined
        # Status is derived from the exit date, never set directly, so the
        # roster cannot claim someone is ACTIVE the day after they left.
        employee.date_of_exit = EMPLOYEE_EXITS.get(user_email)
        employee.status = employee_service.derive_status(employee.date_of_exit)
        if user_email in WITHOUT_BANK_DETAILS:
            employee.bank_account = None
            employee.bank_ifsc = None
        else:
            employee.bank_account = f"5001{abs(hash(user_email)) % 10**10:010d}"
            employee.bank_ifsc = "HDFC0001234"
        by_email[user_email] = employee
    db.flush()

    for report_email, manager_email in REPORTING_LINES:
        by_email[report_email].manager_id = by_email[manager_email].id

    # Link each login to its HR record. Without this an own-scoped role is
    # refused by require() before it reaches any router.
    for email, employee in by_email.items():
        user = db.scalar(select(User).where(User.email == email))
        if user is not None:
            user.employee_id = employee.id

    db.flush()
    logger.info(
        "  employees          %d (%d with logins, %d inactive)",
        len(by_email),
        len(REPORTING_LINES) + 2,
        len(EMPLOYEE_EXITS),
    )
    return by_email


def seed_contracts(db: Session, employees: dict[str, Employee]) -> None:
    for user_email, wage, start, end, state in SEED_CONTRACTS:
        employee = employees[user_email]
        contract = db.scalar(
            select(Contract).where(
                Contract.employee_id == employee.id, Contract.date_start == start
            )
        )
        if contract is None:
            contract = Contract(employee_id=employee.id, date_start=start)
            db.add(contract)
        contract.name = f"Contract - {employee.full_name} from {start}"
        contract.wage = Decimal(wage)
        contract.currency = "INR"
        contract.date_end = end
        contract.state = state
        contract.department_id = employee.department_id
        contract.job_position_id = employee.job_position_id
        contract.working_schedule_id = employee.working_schedule_id
    db.flush()

    running = sum(1 for c in SEED_CONTRACTS if c[4] is ContractState.RUNNING)
    logger.info(
        "  contracts          %d (%d running, incl. a mid-month raise)",
        len(SEED_CONTRACTS),
        running,
    )


def seed_holidays(db: Session) -> None:
    for day, name, is_optional in SEED_HOLIDAYS:
        row = db.scalar(
            select(PublicHoliday).where(PublicHoliday.date == day)
        )
        if row is None:
            row = PublicHoliday(date=day)
            db.add(row)
        row.name = name
        row.is_optional = is_optional
    db.flush()

    counted = sum(1 for d, _, opt in SEED_HOLIDAYS if not opt and d.weekday() < 5)
    logger.info(
        "  holidays           %d (%d fall on a Mon-Fri working day)",
        len(SEED_HOLIDAYS),
        counted,
    )


def seed_attendance(db: Session, employees: dict[str, Employee]) -> None:
    rng = random.Random(ATTENDANCE_RNG_SEED)
    today = date.today()
    window_end = today - timedelta(days=1)
    window_start = window_end - timedelta(days=ATTENDANCE_DAYS - 1)

    holidays = calendar_service.holiday_dates(db, window_start, window_end)
    admin = db.scalar(select(User).where(User.email == "admin@paypulse.app"))

    created = skipped = 0
    counts = {"LATE": 0, "MISSING_CHECKOUT": 0, "OVERTIME": 0, "manual": 0}

    for employee in employees.values():
        schedule = employee.working_schedule
        if schedule is None:
            continue
        daily = schedule_calc.daily_hours(schedule.lines)
        work_days = calendar_service.working_dates(
            schedule.lines, window_start, window_end, holidays
        )

        for day in work_days:
            if day < employee.date_of_joining:
                continue

            # Every draw for this day happens up front, BEFORE any decision
            # to skip. Consuming a different number of values depending on
            # what is already in the database would shift the stream and
            # produce a different shape on each re-run.
            is_absent = rng.random() < P_ABSENT
            late_by = rng.randint(25, 75) if rng.random() < P_LATE else 0
            no_checkout = rng.random() < P_MISSING_CHECKOUT
            extra = rng.randint(60, 180) if rng.random() < P_OVERTIME else 0
            manual = rng.random() < P_MANUAL_EDIT

            if is_absent:
                skipped += 1  # a deliberate gap -> derived absence
                continue

            existing = db.scalar(
                select(Attendance).where(
                    Attendance.employee_id == employee.id,
                    Attendance.work_date == day,
                )
            )
            if existing is not None:
                continue

            start = attendance_service.scheduled_start_for(schedule, day)
            check_in = datetime.combine(
                day, start, tzinfo=attendance_service.app_timezone()
            ) + timedelta(minutes=late_by)

            check_out = (
                None
                if no_checkout
                else check_in + timedelta(hours=float(daily), minutes=60 + extra)
            )

            row = Attendance(
                employee_id=employee.id,
                check_in=check_in.astimezone(UTC),
                check_out=(
                    check_out.astimezone(UTC) if check_out else None
                ),
                break_minutes=60,
            )
            # Same code path the API uses - nothing here is hardcoded.
            attendance_service.recompute(row, schedule, daily)
            row.is_holiday = row.work_date in holidays

            if manual:
                row.is_manual_edit = True
                row.edited_by_id = admin.id if admin else None
                row.edit_reason = "Corrected after employee reported a missed swipe"
                counts["manual"] += 1

            if row.status.value in counts:
                counts[row.status.value] += 1
            db.add(row)
            created += 1

    db.flush()
    logger.info(
        "  attendance         %d rows over %d days (%d gaps -> derived absence)",
        created,
        ATTENDANCE_DAYS,
        skipped,
    )
    logger.info(
        "                     %d late, %d missing check-out, %d overtime, "
        "%d manual edits",
        counts["LATE"],
        counts["MISSING_CHECKOUT"],
        counts["OVERTIME"],
        counts["manual"],
    )


def seed_leave(db: Session, employees: dict[str, Employee]) -> None:
    """Seed leave types, allocations and a spread of requests.

    Idempotent: every row is looked up before it is written, so re-running
    the seed tops the demo data up rather than duplicating it.

    Args:
        db: Open session. Flushed, not committed.
        employees: Seeded employees keyed by work email.
    """
    types: dict[str, TimeOffType] = {}
    for code, name, unit, is_paid, requires_allocation, color in SEED_LEAVE_TYPES:
        row = db.scalar(select(TimeOffType).where(TimeOffType.code == code))
        if row is None:
            row = TimeOffType(code=code)
            db.add(row)
        row.name = name
        row.unit = unit
        row.is_paid = is_paid
        row.requires_allocation = requires_allocation
        row.color = color
        row.is_active = True
        types[code] = row
    db.flush()

    for email, code, days, valid_from, valid_to in SEED_ALLOCATIONS:
        employee = employees[email]
        row = db.scalar(
            select(LeaveAllocation).where(
                LeaveAllocation.employee_id == employee.id,
                LeaveAllocation.time_off_type_id == types[code].id,
                LeaveAllocation.validity_from == valid_from,
            )
        )
        if row is None:
            row = LeaveAllocation(
                employee_id=employee.id,
                time_off_type_id=types[code].id,
                validity_from=valid_from,
            )
            db.add(row)
        row.days = Decimal(days)
        row.validity_to = valid_to
        # Approved, so the balance is actually available (spec A4).
        row.state = RequestState.APPROVED
    db.flush()

    # Compensatory Off for everyone, stored as days like every other
    # allocation - the ledger is in days and the API converts back to hours.
    # The divisor is per employee: 12 hours is 1.5 days on a 40h week but 3
    # days on the 20h part-time one, so a flat day figure would short them.
    for employee in employees.values():
        per_day = leave_engine.daily_hours_for(db, employee, COMP_VALID_FROM)
        if per_day <= 0:
            continue
        row = db.scalar(
            select(LeaveAllocation).where(
                LeaveAllocation.employee_id == employee.id,
                LeaveAllocation.time_off_type_id == types["COMP"].id,
                LeaveAllocation.validity_from == COMP_VALID_FROM,
            )
        )
        if row is None:
            row = LeaveAllocation(
                employee_id=employee.id,
                time_off_type_id=types["COMP"].id,
                validity_from=COMP_VALID_FROM,
            )
            db.add(row)
        row.days = (COMP_OFF_HOURS / per_day).quantize(Decimal("0.01"))
        row.validity_to = COMP_VALID_TO
        row.state = RequestState.APPROVED
    db.flush()

    # A handful of requests across states, all in the recent past so they
    # overlap the seeded attendance window and show up in the pay basis.
    today = date.today()
    plan: list[tuple[str, str, int, int, RequestState]] = [
        # (email, type code, days ago start, days ago end, state)
        ("employee@paypulse.app", "AL", 24, 22, RequestState.APPROVED),
        ("employee@paypulse.app", "LWP", 16, 16, RequestState.APPROVED),
        ("payroll.user@paypulse.app", "SL", 12, 11, RequestState.APPROVED),
        ("payroll.manager@paypulse.app", "AL", 8, 7, RequestState.APPROVED),
        # Future-dated, so they stay pending/refused rather than being
        # swallowed. Negative "days ago" means days ahead.
        ("employee@paypulse.app", "AL", -12, -14, RequestState.TO_APPROVE),
        ("payroll.user@paypulse.app", "CL", -19, -19, RequestState.REFUSED),
        *GENERATED_LEAVE_PLAN,
    ]

    approver = db.scalar(select(User).where(User.email == "hr.manager@paypulse.app"))
    for email, code, start_ago, end_ago, state in plan:
        employee = employees[email]
        date_from = today - timedelta(days=start_ago)
        date_to = today - timedelta(days=end_ago)
        # Nudge onto a weekday: a weekend-only span has no working days and
        # would be refused.
        #
        # Must run *before* the already-seeded check below. The row is stored
        # under the nudged date, so checking the raw one never matched for a
        # weekend request and every re-run seeded another copy.
        while date_from.weekday() >= 5:
            date_from += timedelta(days=1)
        while date_to < date_from or date_to.weekday() >= 5:
            date_to += timedelta(days=1)
        if db.scalar(
            select(TimeOffRequest).where(
                TimeOffRequest.employee_id == employee.id,
                TimeOffRequest.date_from == date_from,
            )
        ):
            continue
        try:
            days, hours = leave_engine.compute_duration(
                db, employee, types[code], date_from, date_to
            )
        except BusinessRuleError as exc:
            logger.warning("  leave request skipped (%s %s): %s", email, code, exc)
            continue
        db.add(
            TimeOffRequest(
                employee_id=employee.id,
                time_off_type_id=types[code].id,
                date_from=date_from,
                date_to=date_to,
                duration_days=days,
                duration_hours=hours,
                state=state,
                reason=f"Seeded {code} request",
                approver_id=(
                    approver.id
                    if approver and state is not RequestState.TO_APPROVE
                    else None
                ),
            )
        )
    db.flush()
    logger.info(
        "  leave              %d types, %d allocations, %d requests",
        len(SEED_LEAVE_TYPES),
        # Counted, not len(SEED_ALLOCATIONS): the Compensatory Off grant is
        # generated per employee, so the static length under-reports it.
        db.scalar(select(func.count()).select_from(LeaveAllocation)),
        db.scalar(select(func.count()).select_from(TimeOffRequest)),
    )


def main() -> None:
    # Imported lazily so the module-level fixtures can be introspected by
    # tests without constructing an engine (and therefore needing psycopg).
    from app.db import seed_payroll
    from app.db.session import SessionLocal

    logger.info("Seeding PayPulse demo data")
    with SessionLocal() as db:
        seed_users(db)
        departments = seed_departments(db)
        positions = seed_positions(db, departments)
        schedules = seed_schedules(db)
        employees = seed_employees(db, departments, positions, schedules)
        seed_contracts(db, employees)
        seed_holidays(db)
        seed_attendance(db, employees)
        seed_leave(db, employees)

        structure = seed_payroll.seed_structure(db)
        seed_payroll.seed_payruns(db, structure)
        db.commit()
    logger.info("Done. All demo accounts use the password: %s", DEMO_PASSWORD)


if __name__ == "__main__":
    main()
