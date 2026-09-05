"""B2.5 smoke test: day counting against the real database.

The unit tests cover the arithmetic with fake objects. This covers the
wiring they cannot: holidays actually loading from Postgres, the schedule
resolving off real ORM relationships, and the resolver handing the calendar
a real contract.

There is no HTTP surface here - holidays are seed-only and day counts reach
the API through the payslip (B5). So this drives the services directly.

Run against a seeded stack:
    docker compose exec api python -m scripts.smoke_b25
"""
from __future__ import annotations

import sys
from datetime import date

from sqlalchemy import select

from scripts._smoke import check, finish

from app.db.session import SessionLocal
from app.models.employee import Employee
from app.services import calendar, contract_resolver


print("B2.5 smoke test\n")

with SessionLocal() as db:
    sneha = db.scalar(
        select(Employee).where(Employee.work_email == "employee@paypulse.app")
    )
    imran = db.scalar(
        select(Employee).where(Employee.work_email == "hr.manager@paypulse.app")
    )
    check(sneha is not None and imran is not None, "seeded employees found")

    print("\nholidays load from the database")
    sep = calendar.holiday_dates(db, date(2026, 7, 1), date(2026, 7, 31))
    check(len(sep) == 0, f"September 2026 has no seeded holidays ({len(sep)})")

    oct_ = calendar.holiday_dates(db, date(2026, 10, 1), date(2026, 10, 31))
    check(
        oct_ == {date(2026, 10, 2), date(2026, 10, 20)},
        "October 2026 loads Gandhi Jayanti and Dussehra",
        ", ".join(str(d) for d in sorted(oct_)),
    )

    print("\noptional holidays do not reduce the denominator")
    jan_all = calendar.holiday_dates(
        db, date(2026, 1, 1), date(2026, 1, 31), include_optional=True
    )
    jan_counted = calendar.holiday_dates(db, date(2026, 1, 1), date(2026, 1, 31))
    check(len(jan_all) == 2, f"January has 2 holidays in total ({len(jan_all)})")
    check(
        jan_counted == {date(2026, 1, 26)},
        "only Republic Day counts; New Year's Day is optional",
    )

    print("\nperiod_days: the denominator")
    basis = calendar.basis_for(
        db,
        imran,
        contract_resolver.active_on(db, imran.id, date(2026, 9, 30)),
        date(2026, 9, 1),
        date(2026, 9, 30),
    )
    check(basis.period_days == 22, "Sep 2026 = 22 working days", str(basis.period_days))
    check(basis.contract_days == 22, "Imran worked the whole month")
    check(not basis.is_prorated, "not prorated")

    oct_basis = calendar.basis_for(
        db,
        imran,
        contract_resolver.active_on(db, imran.id, date(2026, 10, 31)),
        date(2026, 10, 1),
        date(2026, 10, 31),
    )
    check(
        oct_basis.period_days == 20,
        "Oct 2026 = 22 weekdays minus 2 holidays = 20",
        str(oct_basis.period_days),
    )
    check(oct_basis.holidays_in_period == 2, "both holidays reported")

    jan_basis = calendar.basis_for(
        db,
        imran,
        contract_resolver.active_on(db, imran.id, date(2026, 1, 31)),
        date(2026, 1, 1),
        date(2026, 1, 31),
    )
    check(
        jan_basis.period_days == 21,
        "Jan 2026 = 22 weekdays minus Republic Day = 21",
        str(jan_basis.period_days),
    )

    nov_basis = calendar.basis_for(
        db,
        imran,
        contract_resolver.active_on(db, imran.id, date(2026, 11, 30)),
        date(2026, 11, 1),
        date(2026, 11, 30),
    )
    check(
        nov_basis.period_days == 20,
        "Nov 2026 = 21 weekdays minus Guru Nanak Jayanti (Diwali is a Sunday) = 20",
        str(nov_basis.period_days),
    )

    print("\ncontract_days: proration off the resolved contract")
    resolution = contract_resolver.resolve(
        db, sneha.id, date(2026, 7, 1), date(2026, 7, 31)
    )
    check(
        str(resolution.contract.wage) == "55000.00",
        "Sneha's July payrun resolves to the post-raise contract",
    )

    sneha_basis = calendar.basis_for(
        db, sneha, resolution.contract, date(2026, 7, 1), date(2026, 7, 31)
    )
    check(
        sneha_basis.period_days == 23,
        "denominator is still the full month (Jul 2026 = 23)",
    )
    check(
        sneha_basis.contract_days == 12,
        "the new contract covers 16-31 Jul",
        str(sneha_basis.contract_days),
    )
    check(sneha_basis.is_prorated, "flagged as prorated")
    check(
        sneha_basis.contract_window_start == date(2026, 7, 16),
        "window starts the day of the raise",
    )
    check(
        sneha_basis.contract_days <= sneha_basis.period_days,
        "invariant: contract_days <= period_days",
    )

    print("\nthe old contract prorates to the other half of the month")
    old = next(c for c in resolution.candidates if str(c.wage) == "40000.00")
    old_basis = calendar.basis_for(
        db, sneha, old, date(2026, 7, 1), date(2026, 7, 31)
    )
    check(
        old_basis.contract_days == 11,
        "1-15 Jul",
        str(old_basis.contract_days),
    )
    check(
        old_basis.contract_days + sneha_basis.contract_days
        == sneha_basis.period_days,
        "the two halves of the raise sum to the full month",
    )

    print("\nschedule selection")
    schedule = calendar.schedule_for(sneha, resolution.contract)
    check(schedule is not None, f"resolved to {schedule.name if schedule else None}")
    check(
        len(calendar.scheduled_weekdays(schedule.lines)) == 5,
        "Standard 40h covers 5 weekdays",
    )

    print("\nemployee with no contract")
    empty = calendar.basis_for(db, sneha, None, date(2020, 1, 1), date(2020, 1, 31))
    check(empty.contract_days == 0, "no contract means no contract days")
    check(empty.period_days > 0, "but the denominator still exists")

sys.exit(finish("B2.5"))
