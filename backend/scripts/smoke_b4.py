"""B4 smoke test: time off over HTTP.

The duration calculation needs the schedule and holiday tables, so this is
where it is actually proven: a Fri-Mon request is 2 days, not 4, and 1 if
the Monday is a public holiday.

It also drives the brief's second demo scenario end to end -- allocate,
approve, request, approve, watch the balance drop -- and the consequence
PRD v1 lacked: approval past the balance is refused.

Run against a seeded stack:
    docker compose exec api python -m scripts.smoke_b4

Creates one throwaway employee. Clear between runs with:
    docker compose exec db psql -U peoplepay -d peoplepay360 -c \
      "delete from employee where work_email='b4.smoke@paypulse.app';"
"""
from __future__ import annotations

import sys
from datetime import date, timedelta

from scripts._smoke import call, check, finish, login


def balance_of(token, employee_id, code):
    for b in call("GET", f"/time-off/balances?employee_id={employee_id}", token):
        if b["type_code"] == code:
            return b
    return None


print("B4 smoke test\n")
hr = login("hr.manager@paypulse.app")
emp = login("employee@paypulse.app")

print("\nseeded leave types")
types = call("GET", "/time-off/types", hr)
by_code = {t["code"]: t for t in types}
check(len(types) == 5, f"5 types seeded ({len(types)})")
check(
    by_code["LWP"]["is_paid"] is False,
    "LWP is the unpaid type -> becomes an LWP line",
)
check(by_code["AL"]["is_paid"] is True, "Annual Leave is paid")
check(by_code["COMP"]["unit"] == "HOURS", "Compensatory Off is measured in hours")

print("\nsetup: throwaway employee, contract, allocation")
who = call(
    "POST",
    "/employees",
    hr,
    {
        "first_name": "B4",
        "last_name": "Smoke",
        "work_email": "b4.smoke@paypulse.app",
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

print("\nspec A4: an allocation is not available until approved")
alloc = call(
    "POST",
    "/time-off/allocations",
    hr,
    {
        "employee_id": eid,
        "time_off_type_id": by_code["AL"]["id"],
        "days": "12",
        "validity_from": "2026-01-01",
        "validity_to": "2026-12-31",
    },
    expect=201,
)
check(alloc["state"] == "DRAFT", "starts DRAFT")
before = balance_of(hr, eid, "AL")
check(before["allocated"] == "0.00", "an unapproved allocation grants nothing")

decided = call(
    "POST",
    f"/time-off/allocations/{alloc['id']}/approve",
    hr,
    {"note": "Annual entitlement for 2026."},
)
after = balance_of(hr, eid, "AL")
check(after["allocated"] == "12.00", f"approved -> allocated {after['allocated']}")
check(after["remaining"] == "12.00", "remaining 12")

# An allocation decision is attributable, the same way a request decision is.
check(decided["approver_id"] is not None, "the approver is recorded")
check(
    decided["decision_note"] == "Annual entitlement for 2026.",
    "the decision note is stored",
    decided.get("decision_note") or "none",
)
read_back = call("GET", "/time-off/allocations?page_size=200", hr)["items"]
stored = next(a for a in read_back if a["id"] == alloc["id"])
check(
    stored["decision_note"] == "Annual entitlement for 2026."
    and stored["approver_name"],
    "and both read back on the list",
    f"{stored.get('approver_name')}",
)

# The body stays optional here: callers written before the note existed
# must keep working.
check(
    call("POST", f"/time-off/allocations/{alloc['id']}/approve", hr, {}, expect=409)
    .get("code")
    == "already_approved",
    "a bodyless decision is still accepted, and re-approval conflicts",
)

print("\nduration is schedule- and holiday-aware")
# A Friday well in the past, so the request spans Fri-Mon over a weekend.
friday = date.today() - timedelta(days=date.today().weekday() + 3)
weekend_span = call(
    "POST",
    "/time-off/requests",
    hr,
    {
        "employee_id": eid,
        "time_off_type_id": by_code["AL"]["id"],
        "date_from": friday.isoformat(),
        "date_to": (friday + timedelta(days=3)).isoformat(),
    },
    expect=201,
)
check(
    weekend_span["calendar_days"] == 4,
    f"spans {weekend_span['calendar_days']} calendar days",
)
check(
    weekend_span["duration_days"] == "2.00",
    "but only 2 working days -- the weekend is not consumed",
    weekend_span["duration_days"],
)

print("\nonly approval consumes the balance")
pending = balance_of(hr, eid, "AL")
check(pending["taken"] == "0.00", "filed but not approved: taken still 0")
check(pending["pending"] == "2.00", f"pending shows {pending['pending']}")
check(pending["projected_remaining"] == "10.00", "projected 10 if it is approved")

call("POST", f"/time-off/requests/{weekend_span['id']}/approve", hr, {})
consumed = balance_of(hr, eid, "AL")
check(consumed["taken"] == "2.00", f"approved -> taken {consumed['taken']}")
check(consumed["remaining"] == "10.00", "remaining 12 -> 10")
check(consumed["pending"] == "0.00", "no longer pending")

print("\nover-balance approval is refused (the v1 defect)")
big = call(
    "POST",
    "/time-off/requests",
    hr,
    {
        "employee_id": eid,
        "time_off_type_id": by_code["AL"]["id"],
        "date_from": (friday - timedelta(days=28)).isoformat(),
        "date_to": (friday - timedelta(days=10)).isoformat(),
    },
    expect=201,
)
check(float(big["duration_days"]) > 10, f"{big['duration_days']} days requested")
refused = call(
    "POST", f"/time-off/requests/{big['id']}/approve", hr, {}, expect=422
)
check(
    refused.get("code") == "LEAVE_EXCEEDS_ALLOCATION",
    f"refused: {refused.get('code')}",
)
still = balance_of(hr, eid, "AL")
check(still["remaining"] == "10.00", "balance did NOT go negative")
call("POST", f"/time-off/requests/{big['id']}/cancel", hr, {})

print("\nunpaid leave needs no balance and reaches payroll")
unpaid_day = friday - timedelta(days=7)
unpaid = call(
    "POST",
    "/time-off/requests",
    hr,
    {
        "employee_id": eid,
        "time_off_type_id": by_code["LWP"]["id"],
        "date_from": unpaid_day.isoformat(),
        "date_to": unpaid_day.isoformat(),
    },
    expect=201,
)
check(unpaid["is_paid"] is False, "flagged unpaid")
call("POST", f"/time-off/requests/{unpaid['id']}/approve", hr, {})
check(True, "approved with no allocation at all")

summary = call(
    "GET",
    f"/time-off/summary?employee_id={eid}"
    f"&period_start={friday - timedelta(days=14)}"
    f"&period_end={friday + timedelta(days=7)}",
    hr,
)
check(summary["paid_leave_days"] == 2, f"{summary['paid_leave_days']} paid leave days")
check(
    summary["unpaid_leave_days"] == 1,
    f"{summary['unpaid_leave_days']} unpaid -> 1 LWP day for payroll",
)

print("\nhour-unit leave converts to days")
comp_alloc = call(
    "POST",
    "/time-off/allocations",
    hr,
    {
        "employee_id": eid,
        "time_off_type_id": by_code["COMP"]["id"],
        "days": "5",
        "validity_from": "2026-01-01",
        "validity_to": "2026-12-31",
    },
    expect=201,
)
call("POST", f"/time-off/allocations/{comp_alloc['id']}/approve", hr, {})
comp_day = friday - timedelta(days=35)
comp = call(
    "POST",
    "/time-off/requests",
    hr,
    {
        "employee_id": eid,
        "time_off_type_id": by_code["COMP"]["id"],
        "date_from": comp_day.isoformat(),
        "date_to": comp_day.isoformat(),
        "duration_hours": "4",
    },
    expect=201,
)
check(
    comp["duration_days"] == "0.50",
    "4h against an 8h day = 0.50 days -- the path v1 had no route for",
    comp["duration_days"],
)
call(
    "POST",
    "/time-off/requests",
    hr,
    {
        "employee_id": eid,
        "time_off_type_id": by_code["COMP"]["id"],
        "date_from": (comp_day - timedelta(days=7)).isoformat(),
        "date_to": (comp_day - timedelta(days=7)).isoformat(),
    },
    expect=422,
)
check(True, "an hour-unit request without duration_hours is refused")

print("\noverlap and validation")
call(
    "POST",
    "/time-off/requests",
    hr,
    {
        "employee_id": eid,
        "time_off_type_id": by_code["SL"]["id"],
        "date_from": friday.isoformat(),
        "date_to": friday.isoformat(),
    },
    expect=409,
)
check(True, "a second live request over the same day is refused")

saturday = friday + timedelta(days=1)
call(
    "POST",
    "/time-off/requests",
    hr,
    {
        "employee_id": eid,
        "time_off_type_id": by_code["AL"]["id"],
        "date_from": saturday.isoformat(),
        "date_to": (saturday + timedelta(days=1)).isoformat(),
    },
    expect=422,
)
check(True, "a weekend-only request has no working days and is refused")

print("\ncancellation restores the balance")
cancelled = call("POST", f"/time-off/requests/{weekend_span['id']}/cancel", hr, {})
check(cancelled["state"] == "CANCELLED", "cancelled")
restored = balance_of(hr, eid, "AL")
check(restored["taken"] == "0.00", "taken back to 0")
check(restored["remaining"] == "12.00", "remaining restored to 12")

print("\nleave is not absence (B3 integration)")
overview = call(
    "GET",
    f"/attendances/overview?employee_id={eid}"
    f"&period_start={unpaid_day}&period_end={unpaid_day}",
    hr,
)
check(overview["contract_days"] == 1, "one scheduled day")
check(overview["days_with_records"] == 0, "no attendance record")
check(
    overview["absent_days"] == 0,
    "but NOT absent -- approved leave excuses it",
    f"absent={overview['absent_days']}",
)
check(overview["unpaid_leave_days"] == 1, "reported as an unpaid leave day")
check(overview["coverage_pct"] == 100.0, "coverage counts excused days")
check(overview["present_pct"] == 0.0, "present_pct does not")

print("\nseeded employee: leave and attendance together")
seeded = call(
    "GET",
    f"/attendances/overview?employee_id=5"
    f"&period_start={date.today() - timedelta(days=30)}"
    f"&period_end={date.today() - timedelta(days=1)}",
    hr,
)
check(
    seeded["paid_leave_days"] + seeded["unpaid_leave_days"] > 0,
    f"{seeded['paid_leave_days']} paid + "
    f"{seeded['unpaid_leave_days']} unpaid leave days",
)

print("\nB1 integration: smart buttons")
summary = call("GET", "/employees/5/summary", hr)
check(summary["time_off_requests"] > 0, f"{summary['time_off_requests']} requests")
check(summary["allocations"] > 0, f"{summary['allocations']} allocations")

print("")
print("hour-unit leave: presented in hours, checked in days")
# Compensatory Off is the only HOURS type. The ledger stores days; the
# endpoint presents hours. Both halves are asserted here because converting
# in the engine instead would hand the over-balance guard hours to compare
# against days, and it would approve past zero.
comp = balance_of(hr, 5, "COMP")
check(comp is not None, "employee 5 has a Compensatory Off balance")
check(
    comp["unit"] == "HOURS" and comp["allocated"] == "12.00",
    "allocation presents as " + comp["allocated"] + " hours, not its 1.50 days",
)

over = call(
    "POST",
    "/time-off/requests",
    emp,
    {
        "time_off_type_id": comp["time_off_type_id"],
        "date_from": "2026-11-09",
        "date_to": "2026-11-09",
        "duration_hours": "20",
        "reason": "b4 over-balance guard",
    },
    expect=201,
)
check(over["duration_hours"] == "20.00", "20 hours requested")
refused = call(
    "POST", "/time-off/requests/" + str(over["id"]) + "/approve", hr, {}, expect=422
)
check(
    refused.get("code") == "LEAVE_EXCEEDS_ALLOCATION",
    "approving 20h against a 12h allocation is refused",
)
# Refused in the unit it was filed in, and pinned to the field the form
# actually renders, so the message lands on the Hours input.
check(
    "20.00 hours requested" in refused["message"]
    and "12.00 hours remaining" in refused["message"],
    "and says so in hours, not the 2.50/1.50 days underneath",
)
check(
    refused["field_errors"][0]["field"] == "hours",
    "against the form's own Hours field",
)
call("POST", "/time-off/requests/" + str(over["id"]) + "/cancel", hr, {})
check(
    balance_of(hr, 5, "COMP")["remaining"] == "12.00",
    "and the balance is untouched at 12.00 hours",
)

print("\nRBAC")
own = call("GET", "/time-off/requests", emp)
check(
    all(r["employee_id"] == 5 for r in own["items"]),
    f"EMPLOYEE sees only their own ({own['total']})",
)
call("GET", f"/time-off/balances?employee_id={eid}", emp, expect=403)
check(True, "and cannot read another employee's balance")
mine = call("GET", "/time-off/balances", emp)
check(len(mine) == 5, f"but can read their own ({len(mine)} types)")

team = call("GET", "/time-off/requests?scope=my_team", hr)
check(team["total"] >= 0, f"manager sees their team's requests ({team['total']})")
call("GET", "/time-off/requests", None, expect=401)

sys.exit(finish("B4"))
