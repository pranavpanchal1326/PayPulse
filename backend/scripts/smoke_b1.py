"""B1 smoke test: exercises the endpoints a judge would click through.

Run against a seeded stack:
    docker compose exec api python -m scripts.smoke_b1

It creates one throwaway employee and one throwaway schedule. There is no
DELETE endpoint yet, so clear them between runs with:
    docker compose exec db psql -U peoplepay -d peoplepay360 -c \
      "delete from employee where work_email='smoke.test@paypulse.app'; \
       delete from working_schedule where name='Smoke Test 12h';"
"""
from __future__ import annotations

import sys


from scripts._smoke import call, check, finish, login


print("B1 smoke test\n")

hr = login("hr.manager@paypulse.app")
emp = login("employee@paypulse.app")

print("\nmaster data")
departments = call("GET", "/departments", hr)
positions = call("GET", "/job-positions", hr)
schedules = call("GET", "/working-schedules", hr)
assert len(departments) == 4, departments
assert len(positions) == 12, len(positions)

print("\nspec A3: weekly hours are computed, not entered")
by_name = {s["name"]: s for s in schedules}
for name, hours, daily in [
    ("Standard 40h", "40.00", "8.00"),
    ("Part-time 20h", "20.00", "4.00"),
    ("Night Shift 35h", "35.00", "7.00"),
]:
    got = by_name[name]
    ok = got["hours_per_week"] == hours and got["daily_hours"] == daily
    check(ok, f"{name:18} {got['hours_per_week']}h/wk, {got['daily_hours']}h/day")

night = by_name["Night Shift 35h"]
crosses = all(line["crosses_midnight"] for line in night["lines"])
check(crosses, "night lines flagged as crossing midnight")

# A client cannot set hours_per_week: it is recomputed from the lines.
created = call(
    "POST",
    "/working-schedules",
    hr,
    {
        "name": "Smoke Test 12h",
        "hours_per_week": 999,
        "lines": [
            {
                "day_of_week": 0,
                "start_time": "09:00:00",
                "end_time": "15:00:00",
                "break_minutes": 0,
            },
            {
                "day_of_week": 2,
                "start_time": "09:00:00",
                "end_time": "15:00:00",
                "break_minutes": 0,
            },
        ],
    },
    expect=201,
)
ignored = created["hours_per_week"] == "12.00"
check(ignored, f"client-supplied hours_per_week ignored (got {created['hours_per_week']}, sent 999)")

print("\nschedule validation")
call(
    "POST",
    "/working-schedules",
    hr,
    {
        "name": "Duplicate Day",
        "lines": [
            {"day_of_week": 0, "start_time": "09:00:00", "end_time": "13:00:00"},
            {"day_of_week": 0, "start_time": "14:00:00", "end_time": "18:00:00"},
        ],
    },
    expect=422,
)

print("\nemployees")
page = call("GET", "/employees", hr)
assert page["total"] == 5, page["total"]
call("GET", "/employees?q=sneha", hr)
call("GET", "/employees?status=ACTIVE", hr)
call("GET", "/employees/1/summary", hr)

print("\nspec B2: smart-button counts in one call")
summary = call("GET", "/employees/5/summary", hr)
shape = set(summary) == {
    "employee_id",
    "contracts",
    "attendances",
    "time_off_requests",
    "allocations",
    "payslips",
}
check(shape, f"summary shape final: {sorted(summary)}")

print("\nmanager hierarchy (brief A1/B2)")
team = call("GET", "/employees?scope=my_team", hr)
names = sorted(e["full_name"] for e in team["items"])
ok = names == ["Ravi Deshmukh", "Sneha Patil"]
check(ok, f"hr.manager's direct reports: {names}")

print("\nemployee creation and validation")
new = call(
    "POST",
    "/employees",
    hr,
    {
        "first_name": "Smoke",
        "last_name": "Test",
        "work_email": "smoke.test@paypulse.app",
        "date_of_joining": "2026-01-15",
        "employee_type": "CONTRACT",
        "bank_ifsc": "hdfc0009999",
    },
    expect=201,
)
normalised = new["bank_ifsc"] == "HDFC0009999"
check(normalised, f"IFSC upper-cased: {new['bank_ifsc']}")

call("POST", "/employees", hr, {**new, "id": None}, expect=409)  # duplicate email
call(
    "PATCH",
    f"/employees/{new['id']}",
    hr,
    {"bank_ifsc": "NOPE1"},
    expect=422,
)
call(
    "PATCH",
    f"/employees/{new['id']}",
    hr,
    {"manager_id": new["id"]},
    expect=422,
)  # self-management

print("\nstatus derives from date_of_exit")
left = call(
    "PATCH", f"/employees/{new['id']}", hr, {"date_of_exit": "2026-02-01"}
)
ok = left["status"] == "INACTIVE"
check(ok, f"past exit -> {left['status']}")

future = call(
    "PATCH", f"/employees/{new['id']}", hr, {"date_of_exit": "2099-01-01"}
)
ok = future["status"] == "ACTIVE"
check(ok, f"future exit stays {future['status']}")

call(
    "PATCH",
    f"/employees/{new['id']}",
    hr,
    {"date_of_exit": "2020-01-01"},
    expect=409,
)  # before joining

print("\nRBAC: EMPLOYEE is scoped to their own record")
own = call("GET", "/employees", emp)
scoped = own["total"] == 1 and own["items"][0]["work_email"] == "employee@paypulse.app"
check(scoped, f"sees {own['total']} employee(s)")

call("GET", "/employees/4", emp, expect=404)  # another employee: invisible
call("POST", "/employees", emp, {}, expect=403)
call("POST", "/departments", emp, {"name": "Nope"}, expect=403)
call("GET", "/employees", None, expect=401)

print("\ncleanup")
call("PATCH", f"/employees/{new['id']}", hr, {"date_of_exit": None})

sys.exit(finish("B1"))
