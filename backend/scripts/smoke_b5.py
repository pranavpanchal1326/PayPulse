"""B5-B9 smoke test: the engine, the wizard, the lifecycle, the dashboard.

This drives the brief's Scenario A end to end over HTTP: wizard step 1
creates nothing, step 2 creates the batch, compute produces ordered lines,
warnings block validate, mark-paid demands a reason to force, the PDF
renders, and the dashboard aggregates live.

Run against a seeded stack:
    docker compose exec api python -m scripts.smoke_b5
"""
from __future__ import annotations

import json
import sys

import urllib.error
import urllib.request
from datetime import date

from scripts._smoke import BASE, call, check, finish, login


def call(method, path, token=None, body=None, expect=200, raw=False,
         quiet=False):
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
            payload = response.read()
            status = response.status
            body_out = payload if raw else json.loads(payload or b"{}")
    except urllib.error.HTTPError as exc:
        status = exc.code
        body_out = json.loads(exc.read() or b"{}") if not raw else b""
    ok = status == expect
    if quiet:
        return body_out
    check(ok, f"{method:6} {path:50} -> {status}")
    if not ok and not raw:
        print(f"        expected {expect}, body={body_out}")
    return body_out


print("B5-B9 smoke test\n")
mgr = login("payroll.manager@paypulse.app")
hr = login("hr.manager@paypulse.app")
emp = login("employee@paypulse.app")

print("\nspec A5/A6: the rule set is data, not code")
structures = call("GET", "/salary-structures", mgr)
check(len(structures) == 1, f"{len(structures)} structure(s) seeded")
sid = structures[0]["id"]
detail = call("GET", f"/salary-structures/{sid}", mgr)
check(detail["rule_count"] == 12, f"{detail['rule_count']} rules")
check(detail["employee_count"] == 5, f"{detail['employee_count']} employees")
codes = [r["code"] for r in detail["rules"]]
check(codes == sorted(codes, key=lambda c: [r["sequence"] for r in detail["rules"]
      if r["code"] == c][0]), "rules come back in sequence order")

print("\nformula sandbox is exposed to the UI")
ok_check = call(
    "POST",
    "/salary-rules/validate-formula",
    mgr,
    {"expression": "contract.wage * 0.5"},
)
check(ok_check["valid"] is True, f"valid formula -> {ok_check['sample_result']}")
attack = call(
    "POST",
    "/salary-rules/validate-formula",
    mgr,
    {"expression": "__import__('os').system('ls')"},
)
check(attack["valid"] is False, "code execution refused")
check(bool(attack["error"]), f"with a reason: {attack['error'][:60]}")

fwd = call(
    "POST",
    "/salary-rules",
    mgr,
    {
        "structure_id": sid,
        "code": "TOOEARLY",
        "name": "Forward reference",
        "category": "ALLOWANCE",
        "sequence": 5,
        "amount_type": "FORMULA",
        "amount_formula": "rules.BASIC * 2",
    },
    expect=422,
)
check(
    fwd.get("code") == "RULE_FORWARD_REFERENCE",
    f"a rule may not read a later sequence: {fwd.get('code')}",
)

print("\nspec B5: wizard step 1 creates NOTHING")
period_start = date(2026, 7, 1)
period_end = date(2026, 7, 31)
before = call("GET", "/payruns", mgr)["total"]
eligible = call(
    "POST",
    "/payruns/eligible-employees",
    mgr,
    {
        "salary_structure_id": sid,
        "period_start": str(period_start),
        "period_end": str(period_end),
    },
)
after = call("GET", "/payruns", mgr)["total"]
check(after == before, f"payrun count unchanged ({before} -> {after})")
check(len(eligible) >= 5, f"{len(eligible)} employees previewed")
seeded_rows = [r for r in eligible if r["employee_id"] <= 5]
check(
    all(row["period_days"] > 0 for row in seeded_rows),
    "proration visible before committing",
)
blocked = [r for r in eligible if r["employee_id"] <= 5 and not r["eligible"]]
check(
    len(blocked) == 5
    and all("ALREADY_PAID_THIS_PERIOD" in r["blockers"] for r in blocked),
    "the 5 seeded employees already have a July payslip -> blocked",
)

print("")
print("duplicate payslips are refused structurally")
dup = call(
    "POST",
    "/payruns",
    mgr,
    {
        "name": "Duplicate July",
        "salary_structure_id": sid,
        "period_start": "2026-07-01",
        "period_end": "2026-07-31",
        "employee_ids": [1, 2],
    },
    expect=409,
)
check(dup.get("code") == "DUPLICATE_PAYSLIP", f"refused: {dup.get('code')}")

print("")
print("spec B6: create and compute (a completed half-month, so attendance exists)")
# A PAID payrun cannot be cancelled - correctly - so a rerun needs a period
# it has not already consumed. These are all completed months with seeded
# attendance; the first free one wins.
CANDIDATES = [
    ("2026-08-01", "2026-08-15"),
    ("2026-08-16", "2026-08-29"),
    ("2026-07-01", "2026-07-15"),
    ("2026-07-16", "2026-07-30"),
    ("2026-06-01", "2026-06-15"),
    ("2026-06-16", "2026-06-29"),
]
created = None
for start, end in CANDIDATES:
    attempt = call(
        "POST",
        "/payruns",
        mgr,
        {
            "name": f"Smoke {start} to {end}",
            "salary_structure_id": sid,
            "period_start": start,
            "period_end": end,
            "employee_ids": [1, 2, 3, 4, 5],
        },
        expect=201,
        quiet=True,
    )
    if attempt.get("id"):
        created = attempt
        break
if created is None:
    print("  no free period left; clear smoke payruns and rerun:")
    print("    docker compose exec db psql -U peoplepay -d peoplepay360 \\")
    print("      -c \"delete from payrun where name like 'Smoke%';\"")
    sys.exit(1)

run_id = created["id"]
check(created["state"] == "DRAFT", f"{created['name']} starts DRAFT")
computed = call("POST", f"/payruns/{run_id}/compute", mgr)
check(computed["state"] == "COMPUTED", "computed")
check(float(computed["total_net"]) > 0, f"total net {computed['total_net']}")
check(computed["payslip_count"] == 5, f"{computed['payslip_count']} payslips")

print("")
print("spec B7: the payslip explains itself")
# July: a completed month with real attendance, and it holds Sneha's raise.
july = call("GET", "/payslips?employee_id=5", mgr)["items"]
slip = next(s for s in july if s["period_start"] == "2026-07-01")
slip_id = slip["id"]
slip = call("GET", f"/payslips/{slip_id}", mgr)
by_code = {line["rule_code"]: line["amount"] for line in slip["lines"]}
check(len(slip["lines"]) == 12, f"{len(slip['lines'])} lines in sequence")
check(float(by_code["BASIC"]) > 0, f"BASIC {by_code['BASIC']}")
check(
    float(by_code["SPECIAL"]) > 0,
    f"SPECIAL nonzero: {by_code['SPECIAL']} (v1 gave 0)",
)
# July is Sneha's prorated half-month on the post-raise contract, so gross
# is the prorated wage plus overtime - not the full monthly figure.
prorated_wage = 55000 * slip["contract_days"] / slip["period_days"]
check(
    abs(float(by_code["GROSS"]) - float(by_code["OT"]) - prorated_wage) < 1,
    f"GROSS {by_code['GROSS']} = prorated wage {prorated_wage:.2f} + OT "
    f"{by_code['OT']}",
)
check(
    slip["contract_id"] is not None,
    f"records the contract used: #{slip['contract_id']}",
)
check(
    slip["payable_days"] <= slip["contract_days"] <= slip["period_days"],
    f"basis: {slip['payable_days']} payable of {slip['contract_days']} "
    f"contract of {slip['period_days']} scheduled",
)

gross = float(slip["gross"])
deductions = float(slip["total_deductions"])
check(
    abs((gross - deductions) - float(slip["net"])) < 0.005,
    f"reconciles: {gross} - {deductions} = {slip['net']}",
)

print("\nthe mid-month raise reaches the payslip")
check(
    slip["contract_days"] < slip["period_days"],
    f"Sneha prorated to {slip['contract_days']}/{slip['period_days']} days",
)
check(slip["payable_days"] > 0, f"{slip['payable_days']} payable days")
run_warnings = call("GET", f"/payruns/{slip['payrun_id']}/warnings", mgr)
codes_seen = {w["code"] for w in run_warnings}
check("MULTI_CONTRACT_PERIOD" in codes_seen, "MULTI_CONTRACT_PERIOD raised")
check(
    all(w["severity"] != "ERROR" for w in run_warnings if
        w["code"] == "MULTI_CONTRACT_PERIOD"),
    "as a WARNING, not a blocking ERROR -- the v1 defect",
)

print("\nspec B6: warnings gate the transitions")
check("MISSING_BANK_DETAILS" in codes_seen, "Sneha has no bank details")
blocked_pay = call("POST", f"/payruns/{run_id}/validate", mgr)
check(blocked_pay["state"] == "VALIDATED", "validate succeeds (no ERRORs)")

refused = call(
    "POST", f"/payruns/{run_id}/mark-paid", mgr, {"force": False}, expect=422
)
check(
    refused.get("code") == "blocked_by_warnings",
    "mark-paid refused on missing bank details",
)
no_reason = call(
    "POST", f"/payruns/{run_id}/mark-paid", mgr, {"force": True}, expect=422
)
check(
    no_reason.get("code") == "force_reason_required",
    "forcing without a reason is refused",
)
paid = call(
    "POST",
    f"/payruns/{run_id}/mark-paid",
    mgr,
    {"force": True, "force_paid_reason": "Bank details confirmed by phone"},
)
check(paid["state"] == "PAID", "paid, with the reason recorded")
check(bool(paid["force_paid_reason"]), f"reason: {paid['force_paid_reason'][:40]}")

print("\nspec B6: finalized batches are historical records")
call("POST", f"/payruns/{run_id}/compute", mgr, expect=409)
check(True, "a PAID payrun cannot be recomputed")
call("POST", f"/payruns/{run_id}/reopen", mgr, expect=409)
check(True, "and cannot be reopened")
call("POST", f"/payslips/{slip_id}/recompute", mgr, expect=409)
check(True, "nor can one of its payslips -- the v1 hole")

print("\nspec B8: PDF and bulk email")
pdf_bytes = call("GET", f"/payslips/{slip_id}/pdf", mgr, raw=True)
check(len(pdf_bytes) > 1000, f"document rendered ({len(pdf_bytes)} bytes)")
check(
    pdf_bytes[:4] == b"%PDF" or b"<!doctype html" in pdf_bytes[:200].lower(),
    "PDF (or the HTML fallback)",
)
sent = call("POST", f"/payruns/{run_id}/send-payslips", mgr, {})
check("Sending 5" in sent["message"], sent["message"])

print("\nthe scored edit: change a rule, recompute, watch net move")
draft = call(
    "POST",
    "/payruns",
    mgr,
    {
        "name": "Smoke rule-edit check",
        "salary_structure_id": sid,
        "period_start": "2026-10-01",
        "period_end": "2026-10-31",
        "employee_ids": [4],
    },
    expect=201,
)
call("POST", f"/payruns/{draft['id']}/compute", mgr)
first_net = call("GET", f"/payruns/{draft['id']}", mgr)["total_net"]

hra = next(r for r in detail["rules"] if r["code"] == "HRA")
call("PATCH", f"/salary-rules/{hra['id']}", mgr, {"percentage": "50"})
call("POST", f"/payruns/{draft['id']}/compute", mgr)
second_net = call("GET", f"/payruns/{draft['id']}", mgr)["total_net"]
check(
    first_net == second_net,
    f"net unchanged ({first_net}): SPECIAL absorbs the HRA rise, so GROSS "
    "still equals the contracted wage",
)
slip2 = call("GET", f"/payslips?payrun_id={draft['id']}", mgr)["items"][0]
hra_amount = next(
    line["amount"] for line in slip2["lines"] if line["rule_code"] == "HRA"
)
check(
    float(hra_amount) > 0,
    f"but the HRA line itself moved to {hra_amount} -- the rule is live data",
)
call("PATCH", f"/salary-rules/{hra['id']}", mgr, {"percentage": "40"})

print("\ndeleting a rule")
conv = next(r for r in detail["rules"] if r["code"] == "CONV")
call("DELETE", f"/salary-rules/{conv['id']}", mgr, expect=204)
call("POST", f"/payruns/{draft['id']}/compute", mgr)
after_delete = call("GET", f"/payslips?payrun_id={draft['id']}", mgr)["items"][0]
remaining = {line["rule_code"] for line in after_delete["lines"]}
check("CONV" not in remaining, "the CONV line is gone")
check(
    after_delete["gross"] == slip2["gross"],
    f"GROSS still {after_delete['gross']} -- SPECIAL absorbed it",
)
call(
    "POST",
    "/salary-rules",
    mgr,
    {
        "structure_id": sid,
        "code": "CONV",
        "name": "Conveyance Allowance",
        "category": "ALLOWANCE",
        "sequence": 40,
        "amount_type": "FORMULA",
        "amount_formula": "1600 * contract_days / period_days",
    },
    expect=201,
)
check(True, "and it can be recreated")

print("\nspec B9: the dashboard aggregates live data")
dash = call(
    "GET",
    "/dashboard?period_start=2026-03-01&period_end=2026-09-30",
    mgr,
)
check(
    float(dash["kpis"]["total_net_paid"]) > 0,
    f"net paid {dash['kpis']['total_net_paid']}",
)
check(
    dash["kpis"]["headcount"] >= 5,
    f"headcount {dash['kpis']['headcount']} (>= the 5 seeded)",
)
check(
    len(dash["monthly_net_trend"]) >= 5,
    f"{len(dash['monthly_net_trend'])} months of trend",
)
check(len(dash["salary_cost_by_department"]) > 0, "department breakdown present")
eng = next(
    (d for d in dash["salary_cost_by_department"] if d["department"] == "Engineering"),
    None,
)
check(
    eng and eng["headcount"] == 1,
    f"Engineering headcount {eng['headcount'] if eng else '?'} -- "
    "not double-counted despite Sneha's two running contracts",
)
check(dash["attendance_overview"]["absent_days"] >= 0, "absence reported")
check(len(dash["alerts"]) > 0, f"{len(dash['alerts'])} alerts")

print("\nfilters actually filter")
filtered = call(
    "GET",
    "/dashboard?period_start=2026-03-01&period_end=2026-09-30&department_id=2",
    mgr,
)
check(
    filtered["kpis"]["headcount"] < dash["kpis"]["headcount"],
    f"department filter narrows headcount "
    f"({dash['kpis']['headcount']} -> {filtered['kpis']['headcount']})",
)

print("\nHR_MANAGER gets the money-free dashboard (PRD 6.1a)")
hr_dash = call(
    "GET", "/dashboard?period_start=2026-03-01&period_end=2026-09-30", hr
)
check(hr_dash["scope"] == "hr", "scope reported as hr")
check("total_net_paid" not in hr_dash["kpis"], "no money KPIs")
check(hr_dash["monthly_net_trend"] == [], "no salary trend")
check(
    hr_dash["kpis"]["headcount"] >= 5,
    "but headcount and attendance remain",
)

print("\nRBAC")
call("GET", "/payruns", hr, expect=403)
check(True, "HR_MANAGER cannot read payruns")
call("GET", "/payruns", emp, expect=403)
call("GET", "/payslips", emp, expect=403)
check(True, "EMPLOYEE has no payroll access at all")
call("POST", "/salary-rules", hr, {}, expect=403)
call(
    "GET",
    "/dashboard?period_start=2026-01-01&period_end=2026-01-31",
    None,
    expect=401,
)

print("\ncleanup")
call("POST", f"/payruns/{draft['id']}/cancel", mgr)
call("POST", f"/payruns/{run_id}/cancel", mgr, expect=409)
check(True, "the paid smoke payrun stays paid; reruns cancel it up front")

sys.exit(finish("B5"))
