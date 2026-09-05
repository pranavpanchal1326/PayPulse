"""Remove everything the smoke scripts create, so they can be rerun.

Covers the rows they leave on *seeded* records too - an attendance row and a
leave request - which deleting the throwaway employees does not reclaim.

The API has no DELETE endpoint for employees or payruns-in-progress (by
design: payroll records are not casually destroyed), so test fixtures are
cleared here instead.

    docker compose exec api python -m scripts.reset_smoke
"""
from __future__ import annotations

from datetime import date

from sqlalchemy import delete, select

from app.db.session import SessionLocal
from app.models.attendance import Attendance
from app.models.employee import Employee
from app.models.payroll import Payrun
from app.models.schedule import WorkingSchedule
from app.models.timeoff import TimeOffRequest

SMOKE_EMAIL_MARKER = "smoke"
SMOKE_PAYRUN_PREFIXES = ("Smoke ", "Duplicate ")
SMOKE_SCHEDULES = ("Smoke Test 12h",)
SMOKE_REQUEST_REASON = "b4 over-balance guard"


def main() -> None:
    with SessionLocal() as db:
        payruns = [
            p
            for p in db.scalars(select(Payrun))
            if p.name.startswith(SMOKE_PAYRUN_PREFIXES)
        ]
        for payrun in payruns:
            db.delete(payrun)

        employees = list(
            db.scalars(
                select(Employee).where(
                    Employee.work_email.like(f"%{SMOKE_EMAIL_MARKER}%")
                )
            )
        )
        for employee in employees:
            db.delete(employee)

        schedules = db.execute(
            delete(WorkingSchedule).where(
                WorkingSchedule.name.in_(SMOKE_SCHEDULES)
            )
        ).rowcount

        # b4's over-balance check files against a seeded employee, so the
        # cancelled row it leaves outlives the throwaway-employee sweep.
        requests = db.execute(
            delete(TimeOffRequest).where(
                TimeOffRequest.reason == SMOKE_REQUEST_REASON
            )
        ).rowcount

        # b3's check-in/check-out round trip also uses a seeded employee.
        # Its row is dated today and the seeded window always ends before
        # today, so anything from today on is smoke's. Without this, a second
        # b3 run in the same day fails on `already_checked_out`.
        attendance = db.execute(
            delete(Attendance).where(Attendance.work_date >= date.today())
        ).rowcount

        db.commit()

    print(
        f"reset: {len(payruns)} payrun(s), {len(employees)} employee(s), "
        f"{schedules} schedule(s), {attendance} attendance row(s), "
        f"{requests} leave request(s)"
    )


if __name__ == "__main__":
    main()
