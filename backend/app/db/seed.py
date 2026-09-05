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
from datetime import date, time

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.enums import EmployeeType, Role
from app.core.security import hash_password
from app.models.employee import Employee
from app.models.organization import Department, JobPosition
from app.models.schedule import WorkingSchedule, WorkingScheduleLine
from app.models.user import User
from app.services import employee_service, schedule_calc

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
        employee.date_of_exit = None
        employee.status = employee_service.derive_status(None)
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
    logger.info("  employees          %d (linked to logins)", len(by_email))
    return by_email


def main() -> None:
    # Imported lazily so the module-level fixtures can be introspected by
    # tests without constructing an engine (and therefore needing psycopg).
    from app.db.session import SessionLocal

    logger.info("Seeding PayPulse demo data")
    with SessionLocal() as db:
        seed_users(db)
        departments = seed_departments(db)
        positions = seed_positions(db, departments)
        schedules = seed_schedules(db)
        seed_employees(db, departments, positions, schedules)
        db.commit()
    logger.info("Done. All demo accounts use the password: %s", DEMO_PASSWORD)


if __name__ == "__main__":
    main()
