"""B3 smoke test: attendance over HTTP.

The unit tests cover the arithmetic. This covers what only the running API
can show: that computed fields really are ignored on input, that the
duplicate-day constraint fires, that corrections are restricted and always
attributed, and that absence comes out derived rather than stored.

Run against a seeded stack:
    docker compose exec api python scripts/smoke_b3.py

Creates one throwaway employee. Clear between runs with:
    docker compose exec db psql -U peoplepay -d peoplepay360 -c \
      "delete from employee where work_email='b3.smoke@paypulse.app';"
"""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from datetime import UTC, date, datetime, timedelta, timezone

BASE = "http://localhost:8000/api/v1"
PASSWORD = "paypulse"
IST = timezone(timedelta(hours=5, minutes=30))

passed = failed = 0


def check(ok, label, detail=""):
    global passed, failed
    passed, failed = passed + bool(ok), failed + (not ok)
    print(f"  {'PASS' if ok else 'FAIL'}  {label}{f'  [{detail}]' if detail else ''}")


def call(method, path, token=None, body=None, expect=200):
    request = urllib.request.Request(
        f"{BASE}{path}",
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={
            "Content-Type": "application/json",
            **({"Authorization": f"Bearer {token}"} if token else {}),
        },
    )
    try:
        with urllib.request.urlopen(request) as response:
            status, payload = response.status, json.loads(response.read() or b"{}")
    except urllib.error.HTTPError as exc:
        status, payload = exc.code, json.loads(exc.read() or b"{}")
    ok = status == expect
    check(ok, f"{method:6} {path:46} -> {status}")
    if not ok:
        print(f"        expected {expect}, body={payload}")
    return payload


def login(email):
    return call("POST", "/auth/login", body={"email": email, "password": PASSWORD})[
        "access_token"
    ]


def ist(d: date, hh: int, mm: int = 0) -> str:
    return datetime(d.year, d.month, d.day, hh, mm, tzinfo=IST).isoformat()


print("B3 smoke test\n")
hr = login("hr.manager@paypulse.app")
emp = login("employee@paypulse.app")

# A Monday well in the past, so nothing is future-dated.
monday = date.today() - timedelta(days=date.today().weekday() + 14)

print("\nsetup: throwaway employee with a contract")
who = call(
    "POST",
    "/employees",
    hr,
    {
        "first_name": "B3",
        "last_name": "Smoke",
        "work_email": "b3.smoke@paypulse.app",
        "date_of_joining": "2025-01-01",
        "working_schedule_id": 1,
    },
    expect=201,
)
eid = who["id"]
call(
    "POST",
    "/contracts",
    hr,
    {
        "employee_id": eid,
        "wage": "60000.00",
        "date_start": "2025-01-01",
        "state": "RUNNING",
    },
    expect=201,
)

print("\nspec B3: worked hours are computed, never accepted")
row = call(
    "POST",
    "/attendances",
    hr,
    {
        "employee_id": eid,
        "check_in": ist(monday, 9),
        "check_out": ist(monday, 18),
        "break_minutes": 60,
        "worked_hours": "99.99",
        "overtime_hours": "99.99",
        "status": "OVERTIME",
    },
    expect=201,
)
check(
    row["worked_hours"] == "8.00", "9-18 less a 60m break = 8.00", row["worked_hours"]
)
check(row["overtime_hours"] == "0.00", "no overtime on a standard day")
check(row["status"] == "PRESENT", f"status derived, not taken: {row['status']}")
check(row["work_date"] == monday.isoformat(), f"work_date = {row['work_date']}")

print("\none row per employee per day")
dup = call(
    "POST",
    "/attendances",
    hr,
    {"employee_id": eid, "check_in": ist(monday, 10)},
    expect=409,
)
check(dup.get("code") == "duplicate_attendance_day", "duplicate day rejected")

print("\nmidnight crossing: the night shift")
tuesday = monday + timedelta(days=1)
night = call(
    "POST",
    "/attendances",
    hr,
    {
        "employee_id": eid,
        "check_in": ist(tuesday, 22),
        "check_out": ist(tuesday + timedelta(days=1), 6),
        "break_minutes": 60,
    },
    expect=201,
)
check(
    night["worked_hours"] == "7.00",
    "22:00-06:00 less 60m = 7.00",
    night["worked_hours"],
)
check(
    night["work_date"] == tuesday.isoformat(),
    "attributed to the day it started, not the day it ended",
)
check(night["overtime_hours"] == "0.00", "7h against an 8h schedule is not overtime")
# This employee is on Standard 40h, which starts at 09:00, so a 22:00
# check-in really is late. Someone on the Night Shift schedule (22:00 start)
# would read PRESENT for the same row -- status is relative to the schedule.
check(night["status"] == "LATE", "late against a 09:00 schedule, as it should be")

print("\novertime")
wednesday = monday + timedelta(days=2)
ot = call(
    "POST",
    "/attendances",
    hr,
    {
        "employee_id": eid,
        "check_in": ist(wednesday, 9),
        "check_out": ist(wednesday, 21),
        "break_minutes": 60,
    },
    expect=201,
)
check(ot["worked_hours"] == "11.00", "9-21 less 60m = 11.00", ot["worked_hours"])
check(ot["overtime_hours"] == "3.00", "3h beyond the 8h schedule", ot["overtime_hours"])
check(ot["status"] == "OVERTIME", "status is OVERTIME")

print("\nlate arrival")
thursday = monday + timedelta(days=3)
late = call(
    "POST",
    "/attendances",
    hr,
    {
        "employee_id": eid,
        "check_in": ist(thursday, 9, 45),
        "check_out": ist(thursday, 18),
        "break_minutes": 60,
    },
    expect=201,
)
check(late["status"] == "LATE", f"45m past a 15m grace: {late['status']}")

print("\nmissing check-out")
friday = monday + timedelta(days=4)
open_row = call(
    "POST",
    "/attendances",
    hr,
    {"employee_id": eid, "check_in": ist(friday, 9)},
    expect=201,
)
check(open_row["status"] == "MISSING_CHECKOUT", "flagged MISSING_CHECKOUT")
check(open_row["worked_hours"] == "0.00", "hours are not knowable yet, so zero")

print("\nvalidation")
future = call(
    "POST",
    "/attendances",
    hr,
    {
        "employee_id": eid,
        "check_in": (datetime.now(UTC) + timedelta(days=2)).isoformat(),
    },
    expect=422,
)
check(future.get("code") == "future_attendance", "future-dated attendance refused")

next_monday = monday + timedelta(days=7)
too_long = call(
    "POST",
    "/attendances",
    hr,
    {
        "employee_id": eid,
        "check_in": ist(next_monday, 5),
        "check_out": ist(next_monday, 23),
    },
    expect=422,
)
check(too_long.get("code") == "shift_too_long", "an 18h shift is refused")

print("\nspec B3: corrections restricted to authorised users, always attributed")
call(
    "PATCH",
    f"/attendances/{open_row['id']}",
    emp,
    {"check_out": ist(friday, 18), "edit_reason": "trying it as an employee"},
    expect=403,
)
check(True, "EMPLOYEE cannot correct attendance")

call(
    "PATCH",
    f"/attendances/{open_row['id']}",
    hr,
    {"check_out": ist(friday, 18)},
    expect=422,
)
check(True, "a correction without a reason is refused")

fixed = call(
    "PATCH",
    f"/attendances/{open_row['id']}",
    hr,
    {
        "check_out": ist(friday, 18),
        "break_minutes": 60,
        "edit_reason": "Employee reported a missed swipe on the way out",
    },
)
check(fixed["worked_hours"] == "8.00", "recomputed after the correction")
check(fixed["status"] == "PRESENT", "status recomputed too")
check(fixed["is_manual_edit"] is True, "flagged as a manual edit")
check(
    fixed["edited_by_name"] == "Imran Shaikh",
    f"attributed to {fixed['edited_by_name']}",
)
check(bool(fixed["edit_reason"]), "reason retained")

print("\ncheck-in / check-out round trip (as the employee)")
call("POST", "/attendances/check-out", emp, {}, expect=404)
check(True, "checking out with no check-in is refused")

print("\nderived absence (spec B9 'Absent', PRD 3.4)")
overview = call(
    "GET",
    f"/attendances/overview?employee_id={eid}"
    f"&period_start={monday}&period_end={monday + timedelta(days=6)}",
    hr,
)
check(
    overview["period_days"] == 5,
    f"5 working days that week ({overview['period_days']})",
)
check(overview["days_with_records"] == 5, "5 records created")
check(overview["absent_days"] == 0, "nothing absent when every day has a record")
check(
    overview["late"] == 2,
    f"2 late: Thursday, plus the night shift ({overview['late']})",
)
check(overview["overtime_days"] == 1, f"1 overtime day ({overview['overtime_days']})")
check(
    overview["manual_edits"] == 1, f"1 manual edit ({overview['manual_edits']})"
)
check(overview["coverage_pct"] == 100.0, f"coverage {overview['coverage_pct']}%")

gap_week = monday - timedelta(days=7)
gap = call(
    "GET",
    f"/attendances/overview?employee_id={eid}"
    f"&period_start={gap_week}&period_end={gap_week + timedelta(days=6)}",
    hr,
)
check(
    gap["absent_days"] == gap["contract_days"] == 5,
    "a week with no records at all is fully absent -- the v1 defect",
    f"absent={gap['absent_days']} of {gap['contract_days']}",
)
check(gap["coverage_pct"] == 0.0, "coverage 0%")
check(gap["absence_policy"] == "TREAT_AS_UNPAID", "policy reported")

print("\nseeded data has realistic exceptions")
window_start = date.today() - timedelta(days=59)
window_end = date.today() - timedelta(days=1)
seeded = call(
    "GET",
    f"/attendances/overview?employee_id=5"
    f"&period_start={window_start}&period_end={window_end}",
    hr,
)
check(seeded["days_with_records"] > 20, f"{seeded['days_with_records']} records")
check(seeded["absent_days"] > 0, f"{seeded['absent_days']} derived absences")
check(
    seeded["missing_checkouts"] > 0,
    f"{seeded['missing_checkouts']} missing check-outs",
)

print("\nfilters")
call("GET", f"/attendances?employee_id={eid}&status=LATE", hr)
call("GET", f"/attendances?employee_id={eid}&manual_only=true", hr)
call("GET", f"/attendances?date_from={monday}&date_to={monday}", hr)

print("\nB1 integration: smart-button count is live")
summary = call("GET", "/employees/5/summary", hr)
check(summary["attendances"] > 0, f"Sneha has {summary['attendances']} records")

print("\nRBAC")
own = call("GET", "/attendances", emp)
check(
    all(r["employee_id"] == 5 for r in own["items"]),
    f"EMPLOYEE sees only their own ({own['total']} rows)",
)
call(
    "POST",
    "/attendances",
    emp,
    {"employee_id": eid, "check_in": ist(monday, 9)},
    expect=403,
)
check(True, "EMPLOYEE cannot record attendance for someone else")
call("GET", "/attendances", None, expect=401)

print(f"\n{passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
