"""Remove everything the smoke scripts create, so they can be rerun.

The API has no DELETE endpoint for employees or payruns-in-progress (by
design: payroll records are not casually destroyed), so test fixtures are
cleared here instead.

    docker compose exec api python -m scripts.reset_smoke
"""
from __future__ import annotations

from sqlalchemy import delete, select

from app.db.session import SessionLocal
from app.models.employee import Employee
from app.models.payroll import Payrun
from app.models.schedule import WorkingSchedule

SMOKE_EMAIL_MARKER = "smoke"
SMOKE_PAYRUN_PREFIXES = ("Smoke ", "Duplicate ")
SMOKE_SCHEDULES = ("Smoke Test 12h",)


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

        db.commit()

    print(
        f"reset: {len(payruns)} payrun(s), {len(employees)} employee(s), "
        f"{schedules} schedule(s)"
    )


if __name__ == "__main__":
    main()
