# PayPulse — System Design & PRD

> **PayPulse** is our product name. **PeoplePay360** is the name of the hackathon
> brief we are building against; it appears throughout this document only when
> quoting or citing that brief.

**Version 3.0** · supersedes v2 and v1 (v1 archived at `docs/PRD-v1.md`, git `b618137`)
Team: **Aditya** (backend) · **Pranav** (frontend) · Odoo Hackathon · ~36–48h build window
Status: **B0 through B4 shipped — the whole pay basis now exists.** B0 = scaffold, Compose, JWT, RBAC (`99bfacc`). B1 = org master data, schedules, the Employee hub (`d9bc2d3`). B2 = contracts + exclusion constraint + resolver (`8e38ee0`). B2.5 = `calendar.py` and holidays (`5b6a959`). B3 = attendance, midnight-safe hours, derived absence (`6bf0c05`). B4 = time off types, allocations, requests, schedule-aware durations and the paid/unpaid split. **B5 — the payroll engine — is next, and is the longest pole.**

---

## 0. Version history — what changed and why

**v1 → v2 (correctness).** v1 specified the *configuration* half of payroll well and left the *time* half unwired. An external review raised 30 issues; each was re-verified against the v1 text. Two further defects were found during that verification that the review missed — both would have produced visibly wrong numbers on stage:

| | Defect in v1 | Effect |
|---|---|---|
| **E1** | `BASIC = wage × worked_days / scheduled_days` prorated by unpaid leave, **and** `LWP = wage / scheduled_days × unpaid_leave_days` deducted the same days again | Unpaid leave charged twice; every downstream % rule (HRA, DA, PF) inherited the error |
| **E2** | `BASIC` was the **whole** contract wage, so `SPECIAL = max(0, wage − BASIC − HRA − DA − CONV)` | `SPECIAL` was **0 for every employee** — the one rule meant to prove back-references never produced a line — and `GROSS` came out at ~1.6× the contracted wage (₹81,600 on a ₹50,000 contract) |

**v2 → v3 (simplification).** v2 fixed the engine but grew a second problem: it specified roughly eleven hours of machinery the brief never asks for. v3 is a deliberate scope pass against a full extraction of the 11-page brief. **Every correctness fix is kept. Nine subsystems are cut** and moved to §14, which the brief requires as a "future roadmap" deliverable anyway.

The rule of v3: *the brief's four hard parts, done properly, and nothing built on speculation.*

---

## 1. Context

### 1.1 Why this project exists

The brief asks for an **integrated HR and Payroll platform** — explicitly *not* a set of CRUD screens:

> "Many basic HR tools store employee details, attendance, leave, and salary data as separate records. Real HR and payroll teams need these records to work together."

Scoring pressure is on **business logic and data relationships**, not UI polish. Four hard parts are called out:

1. **Period-based contract handling** — many contracts over time; payroll uses only the one applicable to the period, and concurrent active contracts must be impossible.
2. **Schedule-derived hours** — weekly hours computed from a day/start/end/break pattern, never typed in.
3. **Leave allocation consumption** — approved requests must actually decrement a balance.
4. **Ordered salary rule evaluation** — later rules build on earlier totals.

The brief bans fakes: *"configuration screens must be fully functional and integrated, not static mockups"*; *"The Payroll Dashboard must reflect real-time, live data … instead of relying on static charts."*

**The fifth requirement, implied by the brief's own premise but absent from v1:** time data must reach money. Attendance, leave and contract dates all move the payslip, and the payslip shows how.

### 1.2 What the brief actually says — a keyword audit

Run against a full text extraction of all 11 pages, so scope arguments are settled by evidence rather than memory.

| Term | Hits | Consequence |
|---|---|---|
| `manager` | 5 | **Required** on the employee form (A1, B2) — `manager_id` is in scope |
| `duplicate` | 3 | **Required** — duplicate-payslip warnings (B6, B9) |
| `absent` | 1 | Required as a **dashboard metric** (B9), *not* as an attendance row state |
| `hours` | 6 | Leave types define "units (days/hours)" (A4) — hour-unit leave is in scope |
| `bank` | 1 | Missing-bank-details warning (B6) |
| `overtime` / `coverage` | 2 / 1 | Both are dashboard metrics (B9) |
| `holiday`, `tax`, `TDS`, `YTD`, `audit`, `notification`, `currency`, `reversal`, `cancel`, `rounding`, `proration`, `probation` | **0** | None of these is requested. Anything we build here must justify itself on correctness alone. |

### 1.3 Who this is for

| Persona | Role | A day in the product | What must never happen |
|---|---|---|---|
| **Riya**, employee | `EMPLOYEE` | Checks in, files a 3-day leave request, watches the balance, receives the payslip email | Balance silently goes negative |
| **Sameer**, HR manager | `HR_MANAGER` | Fixes a missed check-out, approves his team's leave, onboards a joiner mid-month | Approves leave the employee doesn't have |
| **Neha**, payroll executive | `HR_PAYROLL_USER` | Runs the monthly payrun, clears warnings, prints payslips | Pays someone with no bank details, or pays a leaver a full month |
| **Arun**, payroll manager | `HR_PAYROLL_MANAGER` | Edits HRA 40%→50%, reorders rules, validates and marks paid | An edit silently rewrites a payslip already paid |
| **Admin** | `ADMIN` | Users and roles | — |

### 1.4 Intended outcome

**Product outcome:** a payroll run whose every number is traceable to a record a human can open — the contract that applied, the days that were scheduled, the leave that was approved, the rule that fired, in order.

**Demo outcome:** two end-to-end flows in 5 minutes (§12.3):
- **Scenario A:** Employee → Schedule → Contract → Attendance → Payrun → Warnings → Payslip → PDF → Email
- **Scenario B:** Time Off Type → Allocation → Request → Approval → Balance consumption → Payroll deduction

### 1.5 Non-goals

Explicitly out of scope, so absence reads as a decision. Everything below appears in the §14 roadmap.

| Not building | Why |
|---|---|
| **Split-period (multi-segment) payslips** | The brief says payroll processes *"only the contract applicable to the selected period"* — singular. One contract per payslip, with a warning when there are several (§3.2). |
| **Year-to-date totals and TDS true-up** | `tax`, `TDS`, `YTD`: zero mentions. The tax rule is our own invented content; a flat, clearly-labelled approximation is honest and sufficient (§4.6). |
| **Generic audit log table** | `audit`: zero mentions. The brief asks only that manual attendance corrections be attributable — met by `is_manual_edit` / `edit_reason` (§3.4) plus `force_paid_reason` (§4.8). |
| **Payrun reversal / off-cycle / arrears runs** | Zero mentions. `cancel` + `reopen` cover in-hackathon correction (§4.8). |
| **Rule snapshots / effective-dated structures** | Superseded by a 3-line state guard: paid payruns cannot be recomputed at all (§4.7). |
| **In-app notifications** | Zero mentions. Email is the brief's only stated channel (B8). |
| **Signed / password-protected payslip PDFs** | The brief asks for "bulk email distribution". A plain attachment also demos better in MailHog. |
| **Leave accrual, carry-forward, expiry; half-days** | Allocations are explicit and period-bounded. Over-balance is simply blocked (§3.6). |
| **Approval delegation, F&F settlement, gratuity, employer PF/ESI/CTC** | Joiner/leaver **proration** is in scope; none of this is. |
| Biometric / device attendance ingestion | Zero occurrences in the brief (§1.7 C). |
| Multi-currency / multi-country payroll | Currency is stored and printed; only INR is exercised. |
| i18n, RTL | Single locale: `en-IN`, `Asia/Kolkata`, INR. |
| Celery/Redis, microservices, event bus, GraphQL | Wrong complexity for 48h. `BackgroundTasks` + Postgres cover it. |

### 1.6 Decisions locked

| Area | Choice |
|---|---|
| Backend | **FastAPI + PostgreSQL 16** (SQLAlchemy 2.0, Alembic, Pydantic v2) |
| Frontend | **React + Vite + TypeScript + shadcn/ui + Tailwind**, TanStack Query, Recharts |
| Locale | `en-IN` · timezone **`Asia/Kolkata`** · currency **INR** |
| Money | `Numeric(12,2)`, `ROUND_HALF_UP`, serialized as strings |
| Timestamps | `timestamptz`, stored UTC, bucketed to dates in `APP_TIMEZONE` |
| Deploy | Docker Compose local (primary demo) · Render + Vercel as stretch |

### 1.7 Resolved ambiguities

**A · Are the seeded salary rules required defaults?** — **Both: seed them as data, make them fully editable.** The brief never prescribes a rule set (`predefined`, `default`, `preconfigured` are absent), but requires a system *"populated with representative … data"* and that *"Salary Rules actively drive Payslip generation"*. So: seeded as DB rows via `seed.py`, and fully user-creatable/editable/deletable/reorderable. Nothing about the rules lives in Python. The scoring line is *"business rules … rather than using hardcoded values"* — a judge will edit HRA 40%→50%, hit Compute, and watch net move. **The seeded set must be deletable**; deleting a rule and recomputing is a demo beat (§4.7 covers how that interacts with history).

**B · Is there an official dataset?** — **No. We generate it.** `dataset`, `sample data`, `CSV`, `upload` are all absent; the only URL in the brief is the Excalidraw link. Use **Faker with a fixed seed** so every run is byte-identical.

**C · Where do check-ins come from?** — **In-app.** `biometric`, `fingerprint`, `RFID`, `device`, `kiosk`, `scanner`, `hardware`: zero occurrences. The brief states it positively — Employee: *"Create attendance entries"*; B3: *"supports manual corrections restricted to authorized users"*. That is exactly why the dashboard tracks *manual edits* and *missing check-outs*: the model assumes human entry with exceptions.

### 1.8 Reference material

- **The PDF is 11 pages and contains no mockups** — 0 embedded images; the only vector drawings are page furniture. (v1 claimed "pages 12+ are the same drawings as Illustrator vector data". There is no page 12. Nobody should go looking for screens that are not in the file.)
- Official mockups: <https://app.excalidraw.com/l/65VNwvy7c4X/17vHpCNFjex> — **this link is the only source of visual layout that exists, and Pranav owns it.** §7 below specifies *behaviour*, written from the brief's text alone; it does not describe layout.

---

## 2. Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  Browser — React SPA (Vite)                    PRANAV            │
│  shadcn/ui · TanStack Query · Recharts · react-hook-form + zod   │
│  Top nav: Employees Contracts Attendance TimeOff Payroll Reports │
└───────────────────────────┬──────────────────────────────────────┘
                            │ REST /api/v1 · JWT Bearer
                            │ TS client generated from openapi.json
┌───────────────────────────▼──────────────────────────────────────┐
│  FastAPI                                        ADITYA           │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ API layer   routers · Pydantic schemas · RBAC dependency   │  │
│  ├────────────────────────────────────────────────────────────┤  │
│  │ Service layer — ALL business logic lives here              │  │
│  │  calendar · contract_resolver · schedule_calc              │  │
│  │  attendance_service · leave_engine · time_basis            │  │
│  │  formula (sandbox) · payroll_engine · warnings             │  │
│  │  pdf · mailer · dashboard                                  │  │
│  ├────────────────────────────────────────────────────────────┤  │
│  │ Data layer  SQLAlchemy 2.0 ORM · Alembic migrations        │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────┬──────────────────────┬──────────────────┬─────────────────┘
       │                      │                  │
  ┌────▼─────┐        ┌───────▼──────┐   ┌───────▼────────┐
  │ Postgres │        │  WeasyPrint  │   │ SMTP → MailHog │
  │    16    │        │ payslip PDF  │   │  :8025 web UI  │
  └──────────┘        └──────────────┘   └────────────────┘
```

**Two services versus v1**, both earning their place on correctness: **`calendar`** (the single source of every day number in the system) and **`time_basis`** (assembles the pay basis from calendar + attendance + leave). `payroll_engine` consumes `time_basis` and never counts days itself. *(v2's `ytd`, `audit` and `notify` services are cut — §1.5.)*

**MailHog in Compose.** Bulk "Send Payslips" is required; demoing against real SMTP is slow and fragile. MailHog captures every message with a browsable inbox — judges *see* 30 emails land, zero deliverability risk. A `.env` switch points at real SMTP later.

**WeasyPrint runs in the Linux container**, not on Windows — it needs GTK, a real time sink on Windows 11. Fallback: `fpdf2` (pure Python, no system deps).

---

## 3. Data Model

**24 tables** — v1's 23 plus `public_holiday`. *(v2 also added `audit_log`, `notification` and `payrun_rule_snapshot`; all three are cut.)* The **Employee is the hub**.

```
                        ┌──────────────┐
                        │     User     │  role, email, password_hash
                        └──────┬───────┘
                               │ 1:1
┌────────────┐          ┌──────▼───────┐          ┌─────────────────┐
│ Department │◄─────────│   EMPLOYEE   │─────────►│ WorkingSchedule │
│ JobPosition│          │   (the hub)  │          │  hours_per_week │
│            │          │  manager_id ─┼──self    │   = COMPUTED    │
└────────────┘          └──────┬───────┘          └────────┬────────┘
                               │                           │ 1:N
     ┌─────────────┬───────────┼───────────┬───────────┐   ▼
     ▼             ▼           ▼           ▼           ▼ ┌──────────────┐
┌─────────┐ ┌───────────┐ ┌─────────┐ ┌──────────┐      │ScheduleLine  │
│Contract │ │Attendance │ │TimeOff  │ │  Leave   │      │ day/start/   │
│ wage    │ │ work_date │ │Request  │ │Allocation│      │ end/break    │
│ period  │ │ check_in  │ │duration │ │          │      └──────────────┘
│ state   │ │ check_out │ │         │ └────┬─────┘
│ currency│ │worked_hrs │ └────┬────┘      │       ┌───────────────┐
└────┬────┘ └───────────┘      └─consumes─►┘       │ PublicHoliday │
     │                                │            │  date, name   │
     │ FK                        ┌────▼──────┐     └───────────────┘
     ▼                           │TimeOffType│ unit, requires_allocation,
┌─────────────────┐              │  is_paid  │
│ SalaryStructure │◄──────┐      └───────────┘
└────────┬────────┘       │
         │ 1:N            │        ┌────────┐      ┌──────────┐
         ▼                └────────│ PAYRUN │─────►│ Payslip  │
┌─────────────────┐                │ period │ 1:N  │  gross   │
│   SalaryRule    │                │ state  │      │   net    │
│ code, category, │                └───┬────┘      └────┬─────┘
│ sequence,       │                    │                │ 1:N
│ amount_type,    │                    ▼                ▼
│ formula         │            ┌──────────────┐  ┌─────────────┐
└─────────────────┘            │PayrollWarning│  │ PayslipLine │
                               └──────────────┘  │ rule, amount│
                                                 └─────────────┘
```

### 3.1 `working_schedule` / `working_schedule_line`

`hours_per_week` is a **read-only computed column**, recalculated from lines on every write — spec A3 is explicit it must not be entered manually. Lines: `(day_of_week 0–6, start_time, end_time, break_minutes)`.

Derived and used downstream:
- `daily_hours(day)` = `end − start − break`
- `contract_daily_hours` = `hours_per_week / count(distinct working days)` — **replaces v1's hardcoded `8`** in the OT formula (§4.5).
- A schedule may cross midnight (`end_time < start_time` ⇒ ends next day) — handled in §3.4.

### 3.2 `contract`

`state ∈ {DRAFT, RUNNING, EXPIRED, CANCELLED}` · `date_end` nullable · `currency CHAR(3) NOT NULL DEFAULT 'INR'` · `wage NUMERIC(12,2) CHECK (wage > 0)` · `CHECK (date_end IS NULL OR date_end >= date_start)`.

Overlap is impossible at the DB level:

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE contract ADD CONSTRAINT no_overlapping_running_contracts
  EXCLUDE USING gist (
    employee_id WITH =,
    daterange(date_start, COALESCE(date_end, 'infinity'::date), '[]') WITH &&
  ) WHERE (state = 'RUNNING');
```

> **v1's fatal bug, fixed the simple way.** The `'[]'` bound is *correct*: a contract ending Jan 15 and one starting Jan 16 are adjacent, not overlapping, and both must be allowed to be `RUNNING` — a mid-month raise is the commonest reason an employee has two. v1's resolver then returned 2 rows and raised `OVERLAPPING_CONTRACTS` as an **ERROR that blocked validate**, making a raise *unpayable*.
>
> **v3 fix: one contract per payslip, and multiplicity is a warning, not an error.** The resolver picks the contract applicable at `period_end` (the latest `date_start <= period_end`), prorates by that contract's days within the period, and raises `MULTI_CONTRACT_PERIOD` (WARNING) naming the contracts it did not use. This matches the brief's own wording — *"only the contract applicable to the selected period"* — and costs ~30 minutes instead of the ~3 hours v2's split-period engine needed. Split-period payslips are §14 roadmap.

### 3.3 `employee`

Over v1: `manager_id` (self-FK, nullable — **the brief requires it**, A1/B2), `date_of_joining` (NOT NULL), `date_of_exit` (nullable), `status ∈ {ACTIVE, INACTIVE}` (derived from `date_of_exit` on write, stored for cheap filtering), `bank_account`, `bank_ifsc`.

`manager_id` also gives `?scope=my_team` for near-zero cost. `date_of_joining` / `date_of_exit` bound `contract_days` (§4.2), which is what makes joiner/leaver proration correct.

### 3.4 `attendance`

```
employee_id, work_date (DATE, NOT NULL), check_in (timestamptz),
check_out (timestamptz, nullable), break_minutes int default 0,
worked_hours NUMERIC(5,2)   ← COMPUTED, never client-supplied
overtime_hours NUMERIC(5,2) ← COMPUTED
status ∈ {PRESENT, LATE, MISSING_CHECKOUT, OVERTIME}
is_manual_edit bool, edited_by_id, edit_reason
UNIQUE (employee_id, work_date)
```

Four v1 gaps closed, all cheap:

1. **`ABSENT` is removed from the row status enum.** Absence is the *absence of a row*; it cannot be a property of one. The brief wants "Absent" as a **dashboard metric** (B9), which §4.2 derives. *(Code change: drop `AttendanceStatus.ABSENT` from `app/core/enums.py`.)*
2. **`worked_hours` is defined** and computed server-side: `(check_out − check_in) − break_minutes`, in hours, 2dp. **Midnight crossing:** if `check_out <= check_in`, `check_out` is the following day; the row is attributed to `work_date = date(check_in AT TIME ZONE 'Asia/Kolkata')`. A 22:00→06:00 shift computes `8.0`, not `−16.0`. **Bound:** `0 < worked_hours <= 16`, else `422`.
3. **`overtime_hours`** = `max(0, worked_hours − daily_hours(work_date))` from the employee's schedule.
4. **Contradiction rules** (v1 had none):

| Situation | Behaviour |
|---|---|
| Second row for the same `work_date` | `409` — `UNIQUE (employee_id, work_date)` |
| `check_in` in the future | `422` |
| `check_out` missing | Row stands, `status = MISSING_CHECKOUT`, `worked_hours = 0`, fires `MISSING_CHECKOUT` warning |
| Attendance on an approved-leave day | Allowed but flagged `ATTENDANCE_ON_LEAVE_DAY`; **leave wins** for pay basis, attendance still counts for OT |
| Attendance on a public holiday | Allowed; all hours count as `overtime_hours` |
| Any `PATCH` | `HR_MANAGER+` only; sets `is_manual_edit`, requires `edit_reason` — this is the brief's *"manual corrections restricted to authorized users"* |

### 3.5 `public_holiday`

```
id, name, date DATE UNIQUE, is_optional bool default false
```

**Seed-only — no CRUD screen** (v2 specified one; cut). The brief never mentions holidays, but without the table `period_days` counts Diwali as a working day: it inflates the pay denominator, mis-prorates every joiner and leaver, and makes leave spanning a holiday consume balance. One three-column table and a set lookup is the cheapest possible fix for three visibly wrong numbers. `is_optional` holidays do **not** reduce `period_days`.

### 3.6 `time_off_type` / `leave_allocation` / `time_off_request`

`time_off_type`: `unit ∈ {DAYS, HOURS}`, `requires_allocation bool`, `is_paid bool`, `color`. *(v2's `over_balance_policy` is cut — see below.)*

```
time_off_request:
  date_from, date_to, duration_days NUMERIC(5,2),  ← schedule- and holiday-aware
  state ∈ {DRAFT, TO_APPROVE, APPROVED, REFUSED, CANCELLED}
```

**`duration_days` is schedule- and holiday-aware:** only days that are working days on the employee's schedule and not public holidays. A Fri–Mon request on a 5-day week is **2 days, not 4**. Hour-unit types convert on approval: `duration_days = hours / contract_daily_hours` — the path v1 was missing, and the brief requires the unit (A4).

**Over-balance simply blocks.** v1's `LEAVE_EXCEEDS_ALLOCATION` was a warning that changed nothing, which broke Scenario B's own premise. v2 answered with a configurable `BLOCK` / `AUTO_LWP` policy plus `paid_days` / `unpaid_days` split columns. **v3 keeps only `BLOCK`:** approval of a request exceeding `remaining` returns `422 LEAVE_EXCEEDS_ALLOCATION`, and a balance can never go negative.

This loses nothing that matters. **Unpaid leave still reaches payroll** — via a leave *type* with `is_paid = false`, which needs no balance arithmetic at all. Scenario B works exactly as before, with one fewer configuration axis and two fewer columns.

**Cancellation:**

| Request state at cancel | Effect |
|---|---|
| `DRAFT` / `TO_APPROVE` | `CANCELLED`; no balance effect (never consumed) |
| `APPROVED`, period not yet `PAID` | `CANCELLED`; balance restored; the payrun is flagged `RECOMPUTE_REQUIRED` (INFO) |
| `APPROVED`, period already `PAID` | **Refused** (`409`). Paid payroll is immutable (§4.8); correcting it is §14 roadmap. |

### 3.7 `salary_structure` / `salary_rule`

```
salary_rule:
  code (unique per structure), name, category ∈ {BASIC, ALLOWANCE, GROSS, DEDUCTION, NET},
  sequence int, structure_id,
  condition_type ∈ {ALWAYS, EXPRESSION},  condition_expr text,
  amount_type   ∈ {FIXED, PERCENTAGE, FORMULA},
  amount_fixed numeric, percentage numeric, percentage_base_code text,
  amount_formula text, appears_on_payslip bool, is_active bool
```

### 3.8 `payrun` / `payslip` / `payslip_line`

```
payrun:  name, salary_structure_id, period_start, period_end, currency,
         state ∈ {DRAFT, COMPUTED, VALIDATED, PAID, CANCELLED},
         computed_at, validated_at, paid_at, paid_by_id, force_paid_reason

payslip: payrun_id, employee_id, contract_id, currency,
         period_start, period_end,
         basic, gross, total_deductions, net,
         period_days, contract_days, payable_days, unpaid_days, absent_days,
         worked_hours, overtime_hours,
         state ∈ {DRAFT, COMPUTED, VALIDATED, PAID, CANCELLED}
         UNIQUE (payrun_id, employee_id)

payslip_line: payslip_id, rule_code, name, category, sequence,
              quantity, rate, amount
```

`payslip.contract_id` (singular) is the contract the payslip was computed against — the brief's *"applicable period contract"* (B7), now recorded on the document rather than inferred.

**State machines** — v1 filtered on `?state` without defining one:

```
payrun:  DRAFT ──compute──► COMPUTED ──validate──► VALIDATED ──mark-paid──► PAID
           ▲                    │                      │
           └────── reopen ──────┴──────── reopen ──────┘        PAID is terminal
         any non-PAID state ──cancel──► CANCELLED

payslip: follows its payrun, except CANCELLED which may be set per-payslip
         to drop one employee from a DRAFT/COMPUTED run.
```

**Duplicate prevention is structural.** v1's `DUPLICATE_PAYSLIP` warning guarded a gap nothing closed — one line does it properly:

```sql
CREATE UNIQUE INDEX payslip_one_per_employee_period
  ON payslip (employee_id, period_start, period_end)
  WHERE state <> 'CANCELLED';
```

The warning is kept as a friendly pre-flight message in the step-1 preview, so the user sees the blocker *before* creating the payrun rather than hitting a 409. The brief requires duplicate detection in two places (B6, B9).

### 3.9 Field-level validation

| Entity | Rule |
|---|---|
| `contract` | `wage > 0`; `date_end >= date_start`; `date_start >= employee.date_of_joining`; structure required when `state = RUNNING` |
| `working_schedule_line` | `end_time <> start_time`; `0 <= break_minutes < daily span`; at most one line per `day_of_week` |
| `attendance` | see §3.4 |
| `time_off_request` | `date_to >= date_from`; `duration_days > 0`; no overlap with another non-refused request |
| `leave_allocation` | `days > 0`; `validity_to >= validity_from` |
| `salary_rule` | `code` matches `^[A-Z][A-Z0-9_]{1,19}$`; `sequence > 0`; formula passes the sandbox parse; `percentage_base_code` must reference a **lower** sequence |
| `payrun` | `period_end >= period_start`; period ≤ 62 days; at least one employee |
| `employee` | `date_of_exit >= date_of_joining`; email unique; IFSC matches `^[A-Z]{4}0[A-Z0-9]{6}$` when present |

---

## 4. The Payroll Engine

Where the hackathon is won or lost. Built **early (hour ~10), with unit tests** — not at hour 30.

### 4.1 Pay-basis policy — stated once, obeyed everywhere

v1 never declared one, which is why attendance never reached pay.

> **PeoplePay360 is schedule-anchored with attendance-derived absence.**
> An employee is paid for the days their **schedule** and **contract** say they should work, minus days on **unpaid leave**, minus days **absent without leave**. Attendance rows do not *earn* pay; their absence *removes* it, and excess hours *add* overtime.

| `PAYROLL_ABSENCE_POLICY` | Effect | Default |
|---|---|---|
| `TREAT_AS_UNPAID` | Scheduled days with no attendance row and no approved leave are unpaid | ✅ |
| `IGNORE` | Absence never reduces pay (schedule-only payroll) | |

One flag, five lines — and `absent_days` has to be computed for the dashboard (B9) regardless, so the marginal cost of letting it affect pay is nearly zero.

### 4.2 Day counting — `services/calendar.py`, the single source of truth

No other module counts days. Every figure below prints on the payslip.

```
period_days    = schedule working days ∩ [period_start, period_end]
                 − public_holiday (non-optional)
                 ── the DENOMINATOR. Same for everyone on that schedule.

contract_days  = period_days ∩ [contract.date_start, contract.date_end]
                 ∩ [employee.date_of_joining, employee.date_of_exit]
                 ── the PRORATION numerator. Makes a joiner on the 20th
                    and a leaver on the 10th correct.

paid_leave_days   = approved requests ∩ contract_days, type.is_paid = true
unpaid_leave_days = approved requests ∩ contract_days, type.is_paid = false

absent_days    = contract_days − days with an attendance row
                 − paid_leave_days − unpaid_leave_days
                 (0 when PAYROLL_ABSENCE_POLICY = IGNORE)

unpaid_days    = unpaid_leave_days + absent_days
payable_days   = contract_days − unpaid_days
worked_days    = payable_days              ← alias exposed to formulas,
                                             and the brief's B7 "Worked Days"
```

**Invariant, asserted in code and tested:** `contract_days == payable_days + unpaid_days` and `contract_days <= period_days`.

### 4.3 Compute pipeline (per employee, per payrun)

```
1. RESOLVE CONTRACT  ──────────────────────────────────────────
   SELECT * FROM contract
   WHERE employee_id = :e AND state = 'RUNNING'
     AND date_start <= :period_end
     AND (date_end IS NULL OR date_end >= :period_start)
   ORDER BY date_start DESC
   → 0 rows  → warning NO_ACTIVE_CONTRACT (ERROR), skip payslip
   → 1 row   → use it
   → n rows  → use the FIRST (applicable at period_end)         ← v3
               warning MULTI_CONTRACT_PERIOD (WARNING) naming the rest
               (true overlap is impossible — §3.2 constraint)

2. COMPUTE TIME BASIS  ──── via services/calendar ─────────────
   period_days, contract_days, paid/unpaid_leave_days, absent_days,
   unpaid_days, payable_days                                    (§4.2)
   attendance aggregates: worked_hours, overtime_hours, missing_checkouts

3. BUILD EVAL CONTEXT  ────────────────────────────────────────
   contract.wage, contract.hours_per_week, contract.daily_hours
   period_days, contract_days, payable_days (= worked_days),
   unpaid_days, unpaid_leave_days, paid_leave_days, absent_days,
   worked_hours, overtime_hours,
   employee.employee_type, employee.department,
   rules.<CODE>       ← amount of an already-computed rule
   categories.<CAT>   ← running total per category
   helpers: min, max, round, abs

4. EVALUATE RULES  ────────── ORDER BY sequence ASC ───────────
   for rule in structure.rules:
       if not eval(rule.condition_expr): continue
       amount = FIXED | PERCENTAGE(of rules[base_code]) | FORMULA(eval)
       amount = ROUND_HALF_UP(amount, 2)                        (§4.6)
       write PayslipLine
       rules[rule.code]          = amount   ← later rules reference it
       categories[rule.category] += amount  ← running totals

5. FINALIZE  ──────────────────────────────────────────────────
   basic = categories.BASIC · gross = categories.GROSS
   deductions = categories.DEDUCTION · net = categories.NET
   assert reconciliation invariants (§4.6)
   run warning checks → persist
```

Step 4's two assignment lines are the whole point of *"rules are processed in a specific sequence to ensure dependencies are respected."*

### 4.4 Formula sandbox — `services/formula.py`

`eval()` on user-entered strings is a real vulnerability, and "we sandboxed it" is a strong judging talking point.

Compile with `ast.parse(expr, mode='eval')`, then **walk the tree and reject any node not on the allowlist**.

- **Allowed:** `Expression, BinOp, UnaryOp, BoolOp, Compare, IfExp, Constant, Name(load), Call(allowlisted funcs only), Attribute(only on: rules, categories, contract, employee)`
- **Rejected:** `Import`, `Attribute` on anything else, dunder access, `Lambda`, `Subscript`, comprehensions, `__import__`, `open`, `exec`
- Evaluated with `{"__builtins__": {}}` plus the frozen context dict.
- **Caps:** expression ≤ 500 chars, AST depth ≤ 20.
- Errors caught per-rule → line records `amount=0` plus a `RULE_EVAL_FAILED` warning, so one bad formula never kills a payrun.

**Forward-reference protection:** `percentage_base_code` and any `rules.<CODE>` must reference a **strictly lower** sequence. Validated at rule save (`422`) and at compute (`RULE_FORWARD_REFERENCE`, line = 0). Without it, drag-to-reorder can silently zero a rule.

### 4.5 Seeded rule set — rebuilt

**What was wrong in v1.** `BASIC` was the *entire* contract wage, so `SPECIAL = max(0, wage − BASIC − HRA − DA − CONV)` = `max(0, w − w − 0.4w − 0.2w − 1600)` = **always 0**, and `GROSS` came out at `1.6 × wage + 1600` — ₹81,600 on a ₹50,000 contract. Separately, `BASIC` prorated by unpaid leave *and* `LWP` deducted the same days again.

**v3 structure.** `BASIC` is 50% of the prorated wage; allowances are percentages of `BASIC`; `SPECIAL` is the balancing figure making `GROSS ≈ contract wage`; unpaid time is charged in exactly one place (`LWP`).

| Seq | Code | Name | Category | Computation |
|----|------|------|----------|-------------|
| 10 | `BASIC` | Basic Salary | BASIC | `round(contract.wage * 0.5 * contract_days / period_days, 2)` |
| 20 | `HRA` | House Rent Allowance | ALLOWANCE | 40% of `BASIC` |
| 30 | `DA` | Dearness Allowance | ALLOWANCE | 20% of `BASIC` |
| 40 | `CONV` | Conveyance | ALLOWANCE | `1600 * contract_days / period_days` |
| 50 | `SPECIAL` | Special Allowance | ALLOWANCE | `max(0, contract.wage * contract_days / period_days - rules.BASIC - rules.HRA - rules.DA - rules.CONV)` |
| 60 | `OT` | Overtime | ALLOWANCE | `overtime_hours * (rules.BASIC / (payable_days * contract.daily_hours)) * 1.5` |
| 100 | `GROSS` | Gross Salary | GROSS | `categories.BASIC + categories.ALLOWANCE` |
| 110 | `PF` | Provident Fund | DEDUCTION | `min(rules.BASIC + rules.DA, 15000) * 0.12` |
| 120 | `PT` | Professional Tax | DEDUCTION | `200 if rules.GROSS > 21000 else 0` |
| 130 | `TDS` | Income Tax *(simplified)* | DEDUCTION | `max(0, (rules.GROSS * 12 - 500000) * 0.05 / 12)` |
| 140 | `LWP` | Unpaid Leave / Absence | DEDUCTION | `contract.wage / period_days * unpaid_days` |
| 200 | `NET` | Net Salary | NET | `categories.GROSS - categories.DEDUCTION` |

**Worked example** — ₹50,000/month, 22 `period_days`, full-month contract, 2 unpaid days, 6 overtime hours, 8h/day:

```
BASIC   25,000.00     (50,000 × 0.5 × 22/22)
HRA     10,000.00     (40% of BASIC)
DA       5,000.00     (20% of BASIC)
CONV     1,600.00
SPECIAL  8,400.00     (50,000 − 25,000 − 10,000 − 5,000 − 1,600)   ← v1 gave 0
OT       1,406.25     (6 × (25,000 / (20 × 8)) × 1.5)
────────────────────
GROSS   51,406.25     ≈ contract wage + overtime   ← v1 gave 81,600
PF       3,600.00     (min(30,000, 15,000) × 0.12)
PT         200.00
TDS      ~   0.00     simplified, §4.5 note
LWP      4,545.45     (50,000 / 22 × 2)            ← v1 charged this twice
────────────────────
NET     GROSS − deductions
```

`SPECIAL`, `OT`, `PF`, `PT`, `TDS` and `NET` all back-reference earlier results — visible, non-zero proof of ordered evaluation on the payslip screen.

> **`TDS` is a deliberately simplified single-slab approximation, not statutory Indian income tax.** The brief mentions tax zero times; this rule is our own demo content. It is labelled "Income Tax (simplified)" on the payslip and PDF. v2 specified a YTD service and a cross-month true-up; **cut** — real slabs, regimes and YTD are §14 roadmap.

### 4.6 Rounding and reconciliation

v1 stated `Numeric(12,2)` and left it there, while writing rules that produce fractions.

- Every line rounds **`ROUND_HALF_UP` to 2dp at line level**, immediately after evaluation.
- `categories.*` accumulate **already-rounded** amounts — `GROSS` and `NET` are sums of rounded numbers, not rounded sums.
- **Invariants, asserted at finalize, covered by `test_payslip_reconciles`:**
  - `payslip.gross == Σ(lines where category ∈ {BASIC, ALLOWANCE})`
  - `payslip.total_deductions == Σ(lines where category = DEDUCTION)`
  - `payslip.net == payslip.gross − payslip.total_deductions == the NET line`
- Currency stored on contract, payslip and structure; printed on the payslip and PDF.

### 4.7 Editing rules without rewriting history

The brief requires seeded rules be deletable, and the demo deletes one. B6 also requires *"Preserves finalized or paid payroll batches as historical records."* Both are satisfied by a **state guard**, not machinery:

| Payrun state | Recompute |
|---|---|
| `DRAFT`, `COMPUTED` | **Allowed, against the live structure** — edit HRA, hit Compute, watch net move. This is the scored behaviour. |
| `VALIDATED`, `PAID`, `CANCELLED` | **`409`.** Cannot be recomputed at all. |

Because a validated payrun can never be recomputed, deleting a rule cannot retroactively change it — and `payslip_line` already denormalises `rule_code/name/category/sequence`, so the historical document reads correctly forever. *(v2's `payrun_rule_snapshot` table solved the same problem with a JSONB snapshot; cut — the guard is 3 lines and strictly simpler.)*

### 4.8 Correction path

v1 had none: an error in a `PAID` payrun left no in-product action, and `POST /payslips/{id}/recompute` had no state guard — as written it could rewrite a paid payslip.

| Action | From | To | Guard |
|---|---|---|---|
| `compute` / `recompute` | `DRAFT`, `COMPUTED` | `COMPUTED` | **`409` otherwise** (§4.7) |
| `validate` | `COMPUTED` | `VALIDATED` | refuses on any open `ERROR` warning |
| `reopen` | `COMPUTED`, `VALIDATED` | `DRAFT` | **never from `PAID`** |
| `cancel` | any non-`PAID` | `CANCELLED` | — |
| `mark-paid` | `VALIDATED` | `PAID` | refuses on unresolved `MISSING_BANK_DETAILS` unless `force=true` **+ mandatory `force_paid_reason`** |

`PAID` is terminal. *(v2 added `reverse`, off-cycle and arrears payruns; cut — zero mentions in the brief, and `reopen` covers every correction that can arise inside a 48-hour demo.)* `force_paid_reason` is a column on `payrun`, which answers "who force-paid this and why" without a general audit-log table.

### 4.9 Warnings — `services/warnings.py`

| Code | Severity | Blocks | Trigger |
|---|---|---|---|
| `NO_ACTIVE_CONTRACT` | ERROR | validate | no RUNNING contract covers the period |
| `NEGATIVE_NET` | ERROR | validate | net < 0 |
| `NO_STRUCTURE_RULES` | ERROR | compute | structure has no active rules |
| `PAYSLIP_NOT_RECONCILED` | ERROR | validate | a §4.6 invariant failed |
| `MISSING_BANK_DETAILS` | WARNING | mark-paid | bank account / IFSC empty |
| `MULTI_CONTRACT_PERIOD` | WARNING | — | 2+ contracts in the period; the one at `period_end` was used (§3.2) |
| `RULE_EVAL_FAILED` | WARNING | — | a formula threw |
| `RULE_FORWARD_REFERENCE` | WARNING | — | rule references a later sequence (§4.4) |
| `MISSING_CHECKOUT` | WARNING | — | attendance rows in period with null check_out |
| `ATTENDANCE_ON_LEAVE_DAY` | WARNING | — | attendance row on an approved-leave day |
| `HIGH_ABSENCE` | WARNING | — | `absent_days > 30% of contract_days` |
| `PRORATED_PERIOD` | INFO | — | `contract_days < period_days` (joiner/leaver) |
| `CONTRACT_EXPIRING` | INFO | — | contract ends within 30 days of period end |
| `RECOMPUTE_REQUIRED` | INFO | — | source data changed after compute |

State transitions are gated in the service layer. This gives the demo its best beat — *the system stops you before you pay someone wrong.*

---

## 5. API Design — `/api/v1`

FastAPI's `openapi.json` is the **single source of truth**; Pranav generates his TS client from it.

### Auth
```
POST   /auth/login            → {access_token, refresh_token, user{id,role,employee_id}}
POST   /auth/refresh
GET    /auth/me
```

### Master data
```
GET    /employees                ?q&department_id&status&employee_type&manager_id&scope=my_team&page
POST   /employees
GET    /employees/{id}
PATCH  /employees/{id}
GET    /employees/{id}/summary   → smart-button counts, ONE call not five  ★
       {contracts, attendances, time_off_requests, allocations, payslips}

GET|POST|PATCH   /departments · /job-positions
GET|POST|PATCH   /working-schedules      (lines nested; hours_per_week read-only)
GET|POST|PATCH   /contracts              ?employee_id&state&active_on
GET    /contracts/active                 ?employee_id&date
```
★ Spec B2 requires smart buttons showing counts. Five round-trips per employee form would be slow and obvious on stage.

*(v2's `/holidays` CRUD and `/contracts/segments` are cut — holidays are seed-only, contracts resolve singly.)*

### Attendance & Time Off
```
GET|POST   /attendances          ?employee_id&date_from&date_to&status
POST       /attendances/check-in · /attendances/check-out
PATCH      /attendances/{id}     HR_MANAGER+ only; sets is_manual_edit + edit_reason

GET|POST|PATCH  /time-off/types
GET|POST        /time-off/allocations
POST            /time-off/allocations/{id}/approve · /refuse
GET|POST        /time-off/requests    ?scope=my_team&state
POST            /time-off/requests/{id}/approve · /refuse · /cancel
GET             /time-off/balances     ?employee_id
                → per type: {allocated, taken, pending, remaining,
                             validity_from, validity_to}
```

`pending` closes v1's gap where an employee could stack requests past their balance with no signal in the UI — and since approval now blocks past zero (§3.6), the UI needs to warn *before* the user hits the wall.

### Payroll configuration
```
GET|POST|PATCH  /salary-structures
GET             /salary-structures/{id}   → rules ordered + rule_count + employee_count
POST            /salary-structures/{id}/reorder   {rule_ids: [...]}   drag-to-reorder
GET|POST|PATCH|DELETE  /salary-rules
POST            /salary-rules/validate-formula    → dry-run sandbox: error, or the
                                                    amount against a sample context
```
`employee_count` = distinct employees with a `RUNNING` contract pointing at the structure.

### Payrun — the two-step wizard (spec B5)

The spec is emphatic: *"Clicking Continue moves to employee selection **without creating the Payrun**."* Step 1 hits a **stateless preview endpoint** that persists nothing:

```
POST /payruns/eligible-employees          ← STEP 1 · creates NOTHING · idempotent
     {salary_structure_id, period_start, period_end, department_id?, employee_type?}
     → [{employee_id, name, department, contract_wage, currency,
         period_days, contract_days,        ← proration visible before you commit
         eligible: bool,
         blockers: ["NO_ACTIVE_CONTRACT"|"ALREADY_PAID_THIS_PERIOD"],
         notes:    ["PRORATED_PERIOD"|"MULTI_CONTRACT_PERIOD"]}]

POST /payruns                             ← STEP 2 · "Create Payrun"
     {name, salary_structure_id, period_start, period_end, employee_ids:[...]}
     → creates batch + DRAFT payslips, returns processing view
```

### Payrun processing (spec B6)
```
GET   /payruns              ?state&period&department_id
GET   /payruns/{id}         → payslips summary + warnings + totals
POST  /payruns/{id}/compute        → (re)generate payslips + lines + warnings  [idempotent]
POST  /payruns/{id}/validate       → VALIDATED   blocked by ERROR warnings
POST  /payruns/{id}/mark-paid      → PAID        {force?, force_paid_reason?}
POST  /payruns/{id}/reopen         → DRAFT       never from PAID
POST  /payruns/{id}/cancel         → CANCELLED   non-PAID only
POST  /payruns/{id}/send-payslips  → BackgroundTasks bulk email + PDF attachment
GET   /payruns/{id}/warnings
```

### Payslips
```
GET   /payslips             ?payrun_id&employee_id&state&period
GET   /payslips/{id}        → lines grouped by category, day counts,
                              the contract used, currency
GET   /payslips/{id}/pdf    → application/pdf
POST  /payslips/{id}/recompute    → 409 unless payrun is DRAFT/COMPUTED
```

Payslip PDFs are emailed as **plain attachments**, as v1 specified — the brief asks for "bulk email distribution", and attachments landing in MailHog demo better than links. The PDF footer carries a one-line confidentiality notice and the "Income Tax (simplified)" label. *(v2's signed expiring links and PDF passwords are cut — §14.)*

### Dashboard (spec B9) — one endpoint, one round-trip
```
GET /dashboard  ?period_start&period_end&department_id&employee_type
{
  kpis: {total_net_paid, payslips_generated, average_net_salary,
         approved_time_off_days, attendance_health_pct, headcount},
  salary_cost_by_department: [{department, headcount, total_gross, total_net}],
  monthly_net_trend:        [{month, net}],   ← last 12 months, sparse-tolerant
  attendance_overview:      {present, late, absent_days, overtime_hours,
                             missing_checkouts, manual_edits, coverage_pct},
  time_off_overview:        {approved_days, pending_requests, by_type[], low_balances[]},
  alerts:                   [{severity, code, message, entity_type, entity_id}]
}
```

**One endpoint, role-filtered.** For `HR_MANAGER` the response omits every money field (`total_net_paid`, `average_net_salary`, `salary_cost_by_department`, `monthly_net_trend`), leaving headcount, attendance and leave. This keeps the brief's *"no access to payroll features"* boundary while giving that role a real landing screen. *(v2 specified a separate `/dashboard/hr`; cut — one endpoint with a serializer branch is simpler and cannot drift.)*

**KPI definitions** — v1 named them without defining them, the fastest way to lose trust in a dashboard:

| KPI | Formula |
|---|---|
| `total_net_paid` | `Σ payslip.net` where state ∈ {VALIDATED, PAID}, period within filter |
| `payslips_generated` | `count(payslip)` in filter, any state except CANCELLED |
| `average_net_salary` | `total_net_paid / payslips_generated` — mean net **over payslips**, not headcount |
| `approved_time_off_days` | `Σ duration_days` of APPROVED requests overlapping the period |
| `attendance_health_pct` | `100 × days_present_on_time / Σ contract_days`, where `days_present_on_time` = rows with `status = PRESENT` |
| `coverage_pct` | `100 × (days_with_any_attendance_row + approved_leave_days) / Σ contract_days` — how much of the schedule is *accounted for*, present or excused |
| `headcount` | employees `status = ACTIVE` with a RUNNING contract on `period_end` |
| `absent_days` | per §4.2, summed across filtered employees |

`monthly_net_trend` requests 12 months but renders whatever exists — the seed provides 6 (§9), and the chart must not look broken with fewer.

Built from SQL aggregates over live tables — no cached or static values, per the spec's explicit requirement.

### Cross-cutting
- Errors: RFC 7807-ish `{code, message, field_errors[]}` — Pranav maps `code` to toasts once.
- Pagination: `?page&page_size` → `{items, total, page, pages}` on every list.
- Money as `Numeric(12,2)`, serialized as strings; every money-bearing object carries `currency`.
- Dates `YYYY-MM-DD`; timestamps ISO-8601 with offset. Client renders in `Asia/Kolkata`.
- `GET /healthz`; structured JSON logs with a request id.

---

## 6. RBAC

Five roles, exactly as spec page 3 defines them. Declarative matrix in `core/rbac.py` plus one dependency `require("payrun", "create")`. **Implemented in B0** (`backend/app/core/rbac.py`).

| Resource | EMPLOYEE | HR_MANAGER | HR_PAYROLL_USER | HR_PAYROLL_MGR | ADMIN |
|---|---|---|---|---|---|
| Employees | R *(own)* | CRUD | CRUD | CRUD | CRUD |
| Contracts | R *(own)* | CRUD | CRUD | CRUD | CRUD |
| Working Schedules | R | CRUD | CRUD | CRUD | CRUD |
| Attendance | CR *(own)* | CRUD | CRUD | CRUD | CRUD |
| Time Off requests | CR *(own)* | CRUD | CRUD | CRUD | CRUD |
| Approve / refuse leave | — | ✔ | ✔ | ✔ | ✔ |
| Leave balances | R *(own)* | CRUD | CRUD | CRUD | CRUD |
| Salary Structures / Rules | — | — | **R only** | CRUD | CRUD |
| Payruns / Payslips | — | — | **CRU** (no delete) | CRUD | CRUD |
| Dashboard | — | **R** *(money fields omitted)* | R | R | R |
| User & role management | — | — | — | — | CRUD |

**Row-level scoping:** `EMPLOYEE` requests pass through a shared dependency injecting `WHERE employee_id = current_user.employee_id`. `?scope=my_team` for `HR_MANAGER` injects `WHERE employee.manager_id = current_user.employee_id`. Enforced in the service layer so no router can forget it.

### 6.1 Two spec tensions, decided rather than left open

**(a) HR_MANAGER and the dashboard.** Page 3 gives HR_MANAGER *"no access to payroll features"*, and B9 is the **Payroll** Dashboard — so denying it is correct, not an oversight. But leaving that role with no landing screen is bad product. Resolution: one endpoint, money fields stripped by role (§5). Spec-faithful *and* usable.

**(b) Employees cannot see their own payslips.** Page 3 grants employees details / attendance / leave-balances and *"no payroll access"* — it does not grant payslip viewing. `/payslips` stays closed to `EMPLOYEE`, and email is the delivery channel (B8). `EMPLOYEE_SELF_PAYSLIP=true` flips one matrix entry to `Grant(_R, Scope.OWN)`. Ship with it **off**; the flag makes "shouldn't employees see their payslips?" a demo toggle rather than a rebuild.

*(A third tension — HR_MANAGER is denied Salary Structures but has Contract CRUD, which exposes `wage` — is the brief's own, produced by reading page 3 strictly. Noted so the answer exists if a judge asks; we are not inventing a restriction the spec doesn't ask for.)*

---

## 7. Screen Inventory

The Excalidraw link is the source of truth for **layout**; this table is the source of truth for **behaviour**, written from the brief's text.

| # | Screen | Key fields / columns | Empty state | Error / edge states |
|---|---|---|---|---|
| S1 | Login | email, password | — | invalid credentials; account inactive |
| S2 | Employees — Kanban + List | name, dept, position, type, status, manager | "No employees yet — Add your first" | filter yields nothing |
| S3 | Employee Form | personal, job, bank, joining/exit dates, manager, schedule + **smart buttons** (contracts, attendance, requests, allocations, payslips) | new record: smart buttons show 0, not hidden | IFSC format; exit < joining; duplicate email |
| S4 | Contracts list / form | employee, wage, currency, period, structure, state; **active contract highlighted** | "No contracts — payroll will skip this employee" | overlap rejected by DB → friendly 409; wage ≤ 0 |
| S5 | Working Schedule editor | weekly grid, per-day start/end/break, **live weekly-hours readout (read-only)** | template picker (Standard 40h / Part-time / Night) | two lines on one day; end = start; midnight-crossing hint |
| S6 | Attendance list / form | date, in, out, break, worked hrs, OT, status, manual-edit badge | "No records this period" | missing check-out banner; future date; >16h; day already has a row |
| S7 | Manual correction dialog | before/after, **mandatory reason** | — | reason required |
| S8 | Time Off — Requests | type, dates, duration, state, approver | "No requests" | overlapping request; **over balance → approval refused, with the shortfall named** |
| S9 | Time Off — Allocations | employee, type, days, validity, state | "Allocate leave to get started" | validity inverted |
| S10 | Time Off — Types | name, unit, paid, requires allocation, colour | seeded 5 | — |
| S11 | Balances | per type: allocated / taken / **pending** / remaining | "No allocations" | remaining near zero flagged before the user files a request that will be refused |
| S12 | Salary Structures | name, rule count, employee count | "Create a structure" | delete blocked when a RUNNING contract uses it |
| S13 | Salary Rules config | code, name, category, sequence (**drag to reorder**), amount type, formula, **Validate formula** button showing a sample result | seeded 12 | sandbox rejection naming the offending token; forward reference |
| S14 | Payrun wizard step 1 | structure, period, dept/type filters → **Continue** | — | *nothing is created* — verified in the demo |
| S15 | Payrun wizard step 2 | eligible employees, blockers, notes, per-employee `contract_days/period_days` | "No eligible employees for this period" | all blocked → Create disabled |
| S16 | Payrun processing | totals, payslip table, **warnings panel grouped by severity**, state actions | draft with 0 computed | validate blocked by ERROR; mark-paid blocked by bank details → force dialog demands a reason |
| S17 | Payslip detail | lines in sequence, grouped by category, day counts, **Worked Days**, the contract used, currency | — | RULE_EVAL_FAILED line shown at 0 with the error |
| S18 | Dashboard | 6 KPIs, cost-by-department bar, net trend line, attendance + leave panels, alerts | "No payroll data for this period" — never a blank chart | fewer than 12 months of history renders cleanly; HR_MANAGER sees the money-free variant |
| S19 | My Payslips *(flagged off)* | own payslips, download | — | §6.1(b) |

**Global states every list screen implements once** (F1 shared primitives): loading skeleton, empty, filtered-empty, error-with-retry, permission-denied.

**Accessibility floor** (not a full WCAG pass): keyboard-reachable actions, visible focus rings, labelled form controls, colour never the sole carrier of state (severity badges carry text), 4.5:1 contrast on text.

---

## 8. Work Split & Schedule

### 8.1 The contract-first rule (hours 0–2, both together)

Aditya defines all Pydantic schemas and stubs every router with realistic fixtures. Pranav immediately runs:

```bash
npx openapi-typescript http://localhost:8000/openapi.json -o src/api/schema.d.ts
```

Pranav then builds against **MSW mocks** derived from those types. **Result: Pranav is never blocked waiting on backend logic** — the commonest failure mode for a 2-person hackathon team.

**Ownership boundary:** Aditya owns `backend/` and `openapi.json`. Pranav owns `frontend/src/`. Neither edits the other's tree. Any contract change → Aditya appends to `docs/api-contract.md` and pings Pranav.

### 8.2 Aditya — backend track

| # | Block | Hrs | Notes |
|---|---|---|---|
| ~~B0~~ | ~~Scaffold, Compose, config, JWT auth, RBAC matrix~~ | ~~4~~ | ✅ **shipped** (`99bfacc`) |
| ~~B1~~ | ~~Employee (+manager, joining/exit), Department, JobPosition, WorkingSchedule + hours computation~~ | ~~4~~ | ✅ **shipped** — `/employees/{id}/summary` live |
| ~~B2~~ | ~~Contract + exclusion constraint + `contract_resolver` (**single contract + warning**)~~ | ~~2.5~~ | ✅ **shipped** — 24 resolver unit tests + 52 API assertions |
| B2.5 | **`calendar.py`** — holidays + `period_days` / `contract_days` | 1.5 | ⭐ every day number comes from here |
| ~~B3~~ | ~~Attendance + derived status + `worked_hours` (midnight-safe) + manual-edit fields~~ | ~~3~~ | ✅ **shipped** — `ABSENT` dropped; 41 unit tests + 67 API assertions |
| ~~B4~~ | ~~TimeOffType, Allocation, Request, `leave_engine` (schedule-aware duration, block-on-over-balance, cancel)~~ | ~~4~~ | ✅ **shipped** — 17 unit tests + 79 API assertions |
| B5 | **`formula.py` sandbox + `payroll_engine.py` + `time_basis.py`** | 6 | ⚠ longest pole — start by hr 10 |
| B6 | SalaryStructure / Rule CRUD + reorder + validate-formula + forward-ref check | 3 | |
| B7 | Payrun lifecycle (compute/validate/mark-paid/reopen/cancel), eligible-employees preview, warnings engine | 4.5 | |
| B8 | Payslip PDF (WeasyPrint + Jinja2) + bulk email attachment | 3 | |
| B9 | Dashboard aggregation with the §5 KPI formulas + role filtering | 3 | |
| B10 | **Seed script** | 3 | §9 — do not skip |

**≈37.5h backend** — roughly v1's budget, with every correctness fix included. *(v2 was ≈48h: the cuts in §1.5 returned ~11 hours.)*

### 8.3 Pranav — frontend track

| # | Block | Hrs | Notes |
|---|---|---|---|
| F0 | Vite + TS + Tailwind + shadcn, router, auth, role-gated top nav | 4 | 6 nav items per spec B1 |
| F1 | **Shared primitives** — `DataTable`, `FormLayout`, `StatusBadge`, `SmartButtonBar`, `DateRangePicker`, `ConfirmDialog`, `EmptyState`, `WarningPanel` | 5 | built once, reused ~15× — highest-leverage hours in the project |
| F2 | Employee Kanban + List + Form with smart buttons (S2–S3) | 5 | the operational hub |
| F3 | Contracts list/form + active highlight (S4) | 3 | |
| F4 | Working Schedule weekly grid editor + live hours readout (S5) | 3 | |
| F5 | Attendance list + form + correction dialog (S6–S7) | 3 | |
| F6 | Time Off: Requests, Allocations, Types, Balances (S8–S11) | 5 | |
| F7 | Salary Structure / Rule config, drag-to-reorder, formula validator (S12–S13) | 4 | |
| F8 | **Payrun 2-step wizard + processing + payslip breakdown** (S14–S17) | 6 | highest demo value |
| F9 | Dashboard + alerts panel (S18) | 5 | |

### 8.4 Hard sync points

| When | Gate |
|---|---|
| **T+2h** | OpenAPI contract frozen; TS client generated |
| **T+8h** | Auth + Employee CRUD wired end-to-end against the real API |
| **T+14h** | **`calendar.py` + `contract_resolver` unit-tested** — day counts correct before anything consumes them |
| **T+20h** | Attendance + Time Off + payroll config screens live |
| **T+32h** | **Full payrun → compute → warnings → validate → PDF path working**, incl. a joiner and a two-contract employee |
| **T+40h** | Dashboard live. **FEATURE FREEZE.** Seed, rehearse, record backup video |
| **T+44h** | Stretch only: deploy to Render + Vercel |

---

## 9. Demo Data — treat as a deliverable

The brief requires *"representative employee, contract, time, salary, and payroll data"* and a **Monthly Net Salary Trend chart built on historical data**. An empty trend chart on stage looks broken.

`backend/app/db/seed.py`, Faker with a **fixed seed** so every run is byte-identical:

- 4 departments, 12 job positions, 5 users (one per role), **manager assignments** so `?scope=my_team` demonstrates
- **30 employees**, mixed `employee_type`
  - ~3 with **missing bank details** → live `MISSING_BANK_DETAILS` on stage
  - **1 joiner** and **1 leaver** dated mid-period → `PRORATED_PERIOD` visible on the payslip
- 3 working schedules (Standard 40h, Part-time 20h, **Night 22:00→06:00** — proves the midnight fix)
- **~14 public holidays** across the seeded months, at least one falling inside a seeded leave request
- **35 contracts** — several employees with an expired + a current contract, **and one with an adjacent pair splitting a month** (a raise on the 16th) → `MULTI_CONTRACT_PERIOD` warning, payslip still produced
- **~3,000 attendance rows** across 6 months with realistic exceptions (late arrivals, missing check-outs, overtime, and **deliberate gaps** so `absent_days` is non-zero)
- 5 time off types (mixed paid/unpaid, one hours-unit), ~40 allocations, ~60 requests across all states
- 1 salary structure, 12 rules (§4.5)
- **6 historical payruns (validated + paid) + 1 draft** → the trend chart has real data and the dashboard is populated on first load

Every item is chosen to make a specific behaviour visible without touching the database during the demo.

---

## 10. Scale & Reliability

Right-sized for the brief, not for imaginary traffic.

**Load:** 500 employees × 1 monthly payrun = 500 payslips × ~12 lines = **6,000 rows/run**. Target compute < 5s.

**How that target is met** — the naive version does 500 × 4 queries and crawls:
- Pre-load per payrun in **4 bulk queries** (contracts, attendance aggregates, approved-leave aggregates, holidays), keyed into dicts before the loop. No N+1.
- The holiday set and each schedule's weekday pattern are computed **once per payrun**, not per employee — `period_days` is identical for everyone on the same schedule.
- `bulk_save_objects` for payslip lines.
- One transaction per payrun; `SELECT … FOR UPDATE` on the payrun row so a double-clicked **Compute** can't run twice.
- `compute` is **idempotent** — deletes and regenerates lines inside the transaction.

**Indexes:** `contract(employee_id, state, date_start, date_end)`, `attendance(employee_id, work_date)` unique, `time_off_request(employee_id, state, date_from)`, `public_holiday(date)` unique, `payslip(payrun_id)`, `payslip(employee_id, period_start)`, `payslip_line(payslip_id)`.

**Reliability:** `/healthz`; structured JSON logs with request id; state machines reject illegal transitions (§4.8); paid payroll is immutable (*"Preserves finalized or paid payroll batches as historical records"*).

---

## 11. Risks

| # | Risk | Mitigation |
|---|---|---|
| 1 | **Payroll engine underestimated** — the brief's core and the longest pole | Build at hour 10, not hour 30. Unit-test rule sequencing before any UI touches it. |
| 2 | **Day-counting bugs** — the foundation of every number | `calendar.py` lands at T+14h with its own test file, before anything consumes it |
| 3 | **Empty dashboard on demo day** — trend chart needs history | Seed 6 historical payruns (§9). Non-negotiable. |
| 4 | **API contract drift between the two of us** | OpenAPI is the single source of truth; TS client regenerated; changes logged in `docs/api-contract.md` |
| 5 | **Mockups unread by the backend author** | The Excalidraw link is the only visual source and Pranav owns it; §7 constrains behaviour, not layout, so the two cannot conflict |
| 6 | WeasyPrint / GTK pain on Windows 11 | Runs in the Linux container. Fallback: `fpdf2`. |
| 7 | UI polish eats payroll time | Feature freeze at **T+40h**, no exceptions |
| 8 | Live demo failure during judging | Local Compose is the primary demo; **record a backup video at T+42h** |
| 9 | Formula `eval()` as an injection hole | AST allowlist sandbox (§4.4); a judge *will* ask about this |

---

## 12. Verification

### 12.1 Bring it up

```bash
docker compose up --build
```

- API + Swagger → `http://localhost:8000/docs`
- Frontend → `http://localhost:5173`
- MailHog inbox → `http://localhost:8025`

Seed:

```bash
docker compose exec api python -m app.db.seed
```

### 12.2 Automated tests

```bash
docker compose exec api pytest -v
```

| Test | Asserts |
|---|---|
| `test_formula_sandbox` | `__import__`, `open`, dunder access, `Lambda`, comprehensions all rejected |
| `test_rule_sequencing` | `SPECIAL` and `NET` resolve using earlier rule results |
| `test_rule_forward_reference` | a rule referencing a later sequence is rejected at save |
| `test_contract_resolver` | picks the contract applicable at `period_end` when an employee has 2+ |
| `test_multi_contract_warns_not_blocks` | **an adjacent pair (raise on the 16th) still produces a payslip, with a WARNING** ← v1 raised a blocking ERROR |
| `test_overlapping_contracts` | DB exclusion constraint raises on true overlap |
| `test_schedule_hours` | `hours_per_week` computed from lines, ignores manual input |
| `test_night_shift_hours` | 22:00→06:00 computes `8.0`, attributed to the check-in date |
| `test_calendar_holidays` | a holiday inside the period reduces `period_days` by 1 |
| `test_proration_joiner_leaver` | joiner on the 20th and leaver on the 10th are each paid a fraction, not a full month |
| `test_absence_reduces_pay` | an employee with zero attendance and no leave is **not** paid in full |
| `test_lwp_charged_once` | **unpaid leave reduces net by exactly one day's wage per day** ← v1 charged twice |
| `test_special_allowance_nonzero` | `SPECIAL > 0` and `GROSS ≈ contract wage` ← v1 gave 0 and 1.6× wage |
| `test_leave_balance` | approving a 3-day request drops remaining 12 → 9; `pending` reflects unapproved requests |
| `test_leave_over_balance_blocked` | approving 15 days against a 12-day balance returns 422; balance never goes negative |
| `test_leave_schedule_aware` | a Fri–Mon request on a 5-day week is 2 days, and 1 if Monday is a holiday |
| `test_payslip_reconciles` | `net == gross − deductions == NET line`; category sums match |
| `test_payrun_gating` | `validate` refuses while an ERROR warning is open |
| `test_paid_payrun_immutable` | `recompute` on a PAID payrun returns 409; `reopen` from PAID is refused |
| `test_rule_delete_preserves_history` | deleting a rule leaves a PAID payslip's lines intact |
| `test_duplicate_payslip_blocked` | the partial unique index rejects a second payslip for the same employee-period |
| `test_force_pay_requires_reason` | `mark-paid?force=true` without `force_paid_reason` is rejected |
| `test_rbac_matrix` | each role × resource × action against §6; EMPLOYEE cannot read another's records; HR_MANAGER's dashboard has no money fields |
| `test_dashboard_aggregates` | KPI totals match a hand-computed fixture, using the §5 formulas |

### 12.3 End-to-end — the two required demo scenarios

**Scenario A — Employee → Payslip**
1. Create employee → assign Standard 40h schedule → **weekly hours auto-computed**, field read-only
2. Create a RUNNING contract for the period; try a second overlapping one → **rejected by the DB**
3. Payroll → **NEW** → wizard step 1 (structure + period) → **Continue** → *confirm via `GET /payruns` that nothing was created yet* ← the spec's exact requirement
4. Step 2 shows eligible employees with `contract_days/period_days` — the joiner already reads `7/22`
5. Select employees → **Create Payrun** → **Compute**
6. Inspect a payslip: BASIC → HRA/DA/CONV/**SPECIAL** → GROSS → PF/PT/TDS/LWP → NET, in sequence, with Worked Days and the contract used
7. See `MISSING_BANK_DETAILS` → **Validate blocked** → fix the record → **Validate** → **Mark Paid** (force dialog demands a reason)
8. **Print Payslip** → PDF · **Send Payslips** → 30 emails land in MailHog

**Scenario B — Allocation → Request → Payroll impact**
1. Create a Time Off Type (days, requires allocation, **unpaid**)
2. Allocate 12 days → approve → balance shows `allocated 12 / taken 0 / pending 0 / remaining 12`
3. Employee raises a 3-day request spanning a weekend and a public holiday → **duration shows 2 days, not 4** → HR approves → **balance drops to 10**
4. Recompute the payrun → the `LWP` line appears, **net drops by exactly 2 days' wage**, and BASIC is unchanged
5. Try to approve a 15-day request against the 10-day balance → **refused, with the shortfall named** — the balance cannot go negative

**Third beat if time allows:** the employee with a **raise on the 16th**. Two contracts, one payslip, the applicable contract named on the document and a `MULTI_CONTRACT_PERIOD` warning explaining the choice. v1 would have refused to pay this person at all.

**Dashboard check:** change Period and Department filters and confirm every KPI, both charts, and the alerts panel move — proving live aggregation rather than static data.

---

## 13. Repository Layout

Canonical product name: **PayPulse** — decided, and the only name that appears in the UI, the API title, the payslip PDF, or the demo. It already matches the GitHub remote (`pranavpanchal1326/PayPulse`).

Applied in B1: `APP_NAME`, the OpenAPI title, `COMPANY_NAME`, the mail sender, the log channel, the Python package name, and every seeded demo account (`*@paypulse.app`, password `paypulse`).

**Deliberately left alone**, because they are invisible to judges and renaming them would orphan the existing Postgres volume mid-hackathon: the Compose project name (`peoplepay360`), the database name, and the DB user. Worth doing in the post-hackathon cleanup, not now.

*The hackathon brief is titled "PeoplePay360 HR & Payroll". Building a product under our own name is normal and expected; the brief is the requirement, not the branding.*

```
peoplepay360/
├── docker-compose.yml          postgres · api · mailhog · frontend
├── .env.example
├── README.md
├── docs/
│   ├── PRD.md                  this document (v3)
│   ├── PRD-v1.md               archived v1, for diffing
│   ├── api-contract.md         change log Aditya maintains
│   └── demo-script.md          the 5-minute walkthrough
├── backend/                                                    ADITYA
│   ├── Dockerfile · pyproject.toml · alembic/
│   ├── app/
│   │   ├── main.py
│   │   ├── core/         config · security · rbac · deps · errors · enums
│   │   ├── db/           base · session · seed.py
│   │   ├── models/       employee contract schedule holiday attendance
│   │   │                 timeoff salary payrun payslip
│   │   ├── schemas/      Pydantic — the API contract
│   │   ├── api/v1/       auth employees contracts schedules attendance
│   │   │                 timeoff salary payruns payslips dashboard
│   │   ├── services/     calendar · contract_resolver · schedule_calc
│   │   │                 time_basis · leave_engine · attendance_service
│   │   │                 formula · payroll_engine · warnings
│   │   │                 pdf · mailer · dashboard
│   │   └── templates/    payslip.html (Jinja2 → WeasyPrint)
│   └── tests/
└── frontend/                                                   PRANAV
    ├── Dockerfile · vite.config.ts
    └── src/
        ├── api/          generated schema.d.ts + typed hooks
        ├── components/   ui/ (shadcn) · shared/ (DataTable, WarningPanel…)
        ├── features/     employees contracts schedules attendance
        │                 timeoff payroll dashboard
        └── routes/
```

---

## 14. Future Roadmap

The brief requires this as a deliverable: *"Brief summary of proposed enhancements or extensions the team would prioritize with additional development time."* Everything here was specified in v2 and deliberately cut to keep the build simple — so this section is a real plan, not a wish list.

**Next, in priority order:**

1. **Split-period payslips** — compute across multiple contract segments in one period and merge the lines, so a mid-month raise pays 15 days at each wage instead of prorating a single contract. *(v3 warns and picks one; §3.2.)*
2. **Year-to-date and a real tax engine** — YTD gross/net/TDS on the payslip, statutory slabs and regimes, month-to-month true-up, Form 16.
3. **Full audit log** — append-only `(actor, action, entity, before, after, reason)` across salary rules, payrun transitions, leave approvals and contract changes. *(v3 covers only attendance edits and force-pay.)*
4. **Payroll corrections** — reversal payruns with negated lines, off-cycle and arrears runs, and leave cancellation after a period is paid.
5. **Employer contributions and CTC** — an `EMPLOYER_COST` rule category for employer PF, ESI and gratuity.
6. **Leave policy engine** — monthly accrual, carry-forward, expiry, half-days, and an over-balance policy that auto-reclassifies excess days to LWP instead of blocking.
7. **Notifications** — in-app bell plus email on leave approval/refusal and payslip availability.
8. **Payslip delivery hardening** — signed expiring download links or password-protected PDFs, plus a retention policy.
9. **Scale** — Celery + Redis for payruns beyond ~5k employees, with per-payslip tasks and progress streaming.
10. **Ops** — secrets manager, PITR backups, rate limiting, Sentry, SES/SendGrid with bounce handling.

---

## 15. Next Actions

B0, B1, B2 and B2.5 are shipped — the foundation every payroll number is derived from is done and tested. In order:

1. ~~**B1** — Employee, Department, JobPosition, WorkingSchedule + computed hours~~ ✅
2. ~~**B2** — Contract with the exclusion constraint, `contract_resolver` returning a **single** contract plus a `MULTI_CONTRACT_PERIOD` warning~~ ✅
3. ~~**B2.5** — `calendar.py`, the public holiday table, `period_days` / `contract_days`~~ ✅
4. ~~**B3** — attendance: `ABSENT` dropped, midnight-safe `worked_hours`, manual-correction audit fields, `AbsencePolicy`~~ ✅
5. ~~**B4** — time off: types, allocations, requests, schedule- and holiday-aware `duration_days`, block-on-over-balance, cancel~~ ✅
6. Publish the updated `openapi.json` and ping Pranav with the §5 deltas (balances `pending`, payrun `reopen`/`cancel`, role-filtered dashboard, `?scope=my_team`, and B2's `/contracts/resolve`)
7. **B5 — the payroll engine.** `formula.py` (AST allowlist sandbox), `time_basis.py` (assembles §4.2 from calendar + attendance + leave, all of which now exist), and `payroll_engine.py`. Write `test_lwp_charged_once` and `test_special_allowance_nonzero` *first* — they pin the two defects v1 shipped.
