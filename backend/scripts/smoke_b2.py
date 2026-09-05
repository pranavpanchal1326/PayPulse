"""B2 smoke test: contracts, the exclusion constraint, and the resolver.

The unit tests cover the resolver's decision logic without a database. This
covers the half that only real Postgres can prove: that concurrent active
contracts are actually impossible (spec A2).

Run against a seeded stack:
    docker compose exec api python -m scripts.smoke_b2

Creates one throwaway employee and its contracts. Clear between runs with:
    docker compose exec db psql -U peoplepay -d peoplepay360 -c \
      "delete from employee where work_email='b2.smoke@paypulse.app';"
"""
from __future__ import annotations

import sys


from scripts._smoke import call, check, finish, login


print("B2 smoke test\n")
hr = login("hr.manager@paypulse.app")
emp = login("employee@paypulse.app")

print("\nseeded contracts")
page = call("GET", "/contracts", hr)
check(page["total"] == 7, f"7 seeded contracts, got {page['total']}")

running = call("GET", "/contracts?state=RUNNING", hr)
check(running["total"] == 6, f"6 running, got {running['total']}")

print("\nspec A2: the active contract is identifiable")
active_flags = [c for c in page["items"] if c["is_active_now"]]
check(len(active_flags) == 5, f"{len(active_flags)} contracts active today")

print("\nsetup: a throwaway employee to mutate")
who = call(
    "POST",
    "/employees",
    hr,
    {
        "first_name": "B2",
        "last_name": "Smoke",
        "work_email": "b2.smoke@paypulse.app",
        "date_of_joining": "2025-01-01",
    },
    expect=201,
)
eid = who["id"]

first = call(
    "POST",
    "/contracts",
    hr,
    {
        "employee_id": eid,
        "wage": "50000.00",
        "date_start": "2025-01-01",
        "date_end": "2026-06-30",
        "state": "RUNNING",
    },
    expect=201,
)
check(first["name"].startswith("Contract - B2 Smoke"), f"auto-named: {first['name']}")
check(first["currency"] == "INR", "currency defaulted to INR")

print("\nspec A2: concurrent active contracts are impossible")
clash = call(
    "POST",
    "/contracts",
    hr,
    {
        "employee_id": eid,
        "wage": "60000.00",
        "date_start": "2026-01-01",  # inside the first contract's term
        "state": "RUNNING",
    },
    expect=409,
)
check(
    clash.get("code") == "overlapping_contracts",
    f"rejected by the DB constraint, code={clash.get('code')}",
)
check(
    "#" in clash.get("message", ""),
    "the 409 names the conflicting contract instead of leaking a driver error",
)

# A DRAFT contract over the same dates is fine: the constraint is partial.
draft = call(
    "POST",
    "/contracts",
    hr,
    {
        "employee_id": eid,
        "wage": "60000.00",
        "date_start": "2026-01-01",
        "state": "DRAFT",
    },
    expect=201,
)
check(True, "a DRAFT contract over the same dates is allowed")
call("PATCH", f"/contracts/{draft['id']}", hr, {"state": "RUNNING"}, expect=409)
check(True, "promoting that draft to RUNNING is refused")

print("\nadjacent contracts are legal: the mid-month raise")
second = call(
    "POST",
    "/contracts",
    hr,
    {
        "employee_id": eid,
        "wage": "65000.00",
        "date_start": "2026-07-01",  # the day after the first ends
        "state": "RUNNING",
    },
    expect=201,
)
check(second["id"] is not None, "adjacent RUNNING contract accepted")

print("\nresolver: one contract per period, with reasons")
res = call(
    "GET",
    f"/contracts/resolve?employee_id={eid}&period_start=2026-03-01&period_end=2026-03-31",
    hr,
)
check(res["contract"]["id"] == first["id"], "March resolves to the first contract")
check(res["warnings"] == [], "a clean single-contract period warns about nothing")

res = call(
    "GET",
    f"/contracts/resolve?employee_id={eid}&period_start=2026-06-01&period_end=2026-07-31",
    hr,
)
codes = [w["code"] for w in res["warnings"]]
check(res["contract"]["id"] == second["id"], "spanning period uses the later contract")
check("MULTI_CONTRACT_PERIOD" in codes, f"warns MULTI_CONTRACT_PERIOD, got {codes}")
check(not res["blocking"], "and does NOT block -- the v1 defect")
check(len(res["candidates"]) == 2, "both candidates reported")

print("\nresolver: the seeded mid-month raise (Sneha, Sep 2026)")
res = call(
    "GET",
    "/contracts/resolve?employee_id=5&period_start=2026-07-01&period_end=2026-07-31",
    hr,
)
codes = [w["code"] for w in res["warnings"]]
check(
    res["contract"]["wage"] == "55000.00",
    f"uses the new wage: {res['contract']['wage']}",
)
check("MULTI_CONTRACT_PERIOD" in codes, f"warns, got {codes}")
check(not res["blocking"], "Sneha is payable")

print("\nresolver: no contract at all")
res = call(
    "GET",
    f"/contracts/resolve?employee_id={eid}&period_start=2020-01-01&period_end=2020-01-31",
    hr,
)
check(res["contract"] is None, "no contract resolved")
check([w["code"] for w in res["warnings"]] == ["NO_ACTIVE_CONTRACT"], "blocks")
check(res["blocking"], "flagged blocking")

print("\n/contracts/active")
act = call("GET", f"/contracts/active?employee_id={eid}&on=2026-03-15", hr)
check(act["id"] == first["id"], "March 15 -> first contract")
act = call("GET", f"/contracts/active?employee_id={eid}&on=2026-07-15", hr)
check(act["id"] == second["id"], "July 15 -> second contract")

print("\nvalidation")
call(
    "POST",
    "/contracts",
    hr,
    {"employee_id": eid, "wage": "0", "date_start": "2026-01-01"},
    expect=422,
)  # wage must be positive
call(
    "POST",
    "/contracts",
    hr,
    {
        "employee_id": eid,
        "wage": "1000",
        "date_start": "2026-05-01",
        "date_end": "2026-04-01",
    },
    expect=422,
)  # end before start
before_joining = call(
    "POST",
    "/contracts",
    hr,
    {"employee_id": eid, "wage": "1000", "date_start": "2024-01-01"},
    expect=409,
)
check(
    before_joining.get("code") == "contract_before_joining",
    "contract cannot start before the employee joined",
)
call(
    "POST",
    "/contracts",
    hr,
    {"employee_id": 99999, "wage": "1000", "date_start": "2026-01-01"},
    expect=404,
)

print("\nB1 integration: smart-button count is live")
summary = call("GET", "/employees/5/summary", hr)
check(summary["contracts"] == 2, f"Sneha has {summary['contracts']} contracts")

print("\nRBAC")
own = call("GET", "/contracts", emp)
check(
    all(c["employee_id"] == 5 for c in own["items"]),
    f"EMPLOYEE sees only their own ({own['total']} rows)",
)
call("GET", f"/contracts?employee_id={eid}", emp, expect=403)
call("POST", "/contracts", emp, {}, expect=403)
call("GET", "/contracts", None, expect=401)

sys.exit(finish("B2"))
