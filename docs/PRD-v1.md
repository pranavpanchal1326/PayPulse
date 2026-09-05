# PeoplePay360 — System Design & PRD

> **Status: DESIGN ONLY — no code until Aditya gives the go-ahead.**
> Team: **Aditya** (backend) · **Pranav** (frontend) · Odoo Hackathon · ~36–48h build window

---

## 1. Context

### Why this project exists
The hackathon brief (`PeoplePay360 HR & Payroll.pdf`, 11 pages) asks for an **integrated HR and Payroll platform** — explicitly *not* a set of CRUD screens. The brief's own framing:

> "Many basic HR tools store employee details, attendance, leave, and salary data as separate records. Real HR and payroll teams need these records to work together."

The scoring pressure is therefore on **business logic and data relationships**, not UI polish. Four things are called out as the hard parts:

1. **Period-based contract handling** — an employee has many contracts over time; payroll must use *only* the one valid for the pay period, and concurrent active contracts must be impossible.
2. **Schedule-derived hours** — weekly hours are *computed* from a day/start/end/break pattern, never typed in.
3. **Leave allocation consumption** — approved requests must actually decrement a balance.
4. **Ordered salary rule evaluation** — rules run in sequence so later rules build on earlier totals ("complex totals build upon earlier calculations").

The brief also explicitly bans fakes: *"configuration screens must be fully functional and integrated, not static mockups"*, *"The Payroll Dashboard must reflect real-time, live data … instead of relying on static charts."*

### Intended outcome
A working platform demoing two end-to-end flows in 5 minutes:
- **Scenario A:** Employee → Contract → Attendance → Payrun → Payslip → PDF → Email
- **Scenario B:** Time Off Type → Allocation → Request → Approval → Balance consumption → Payroll deduction

### Decisions locked
| Area | Choice |
|---|---|
| Backend | **FastAPI + PostgreSQL** (SQLAlchemy 2.0, Alembic, Pydantic v2) |
| Frontend | **React + Vite + TypeScript + shadcn/ui + Tailwind**, TanStack Query, Recharts |
| Timeline | ~36–48 hours |
| Deploy | Docker Compose local (primary demo) · Render + Vercel as stretch |

### Reference material
- Spec text: pages 1–11 of the PDF (fully extracted; pages 12+ are the same drawings stored as Illustrator vector data).
- Official mockups: <https://app.excalidraw.com/l/65VNwvy7c4X/17vHpCNFjex> — **Pranav should open this directly.**

### Resolved ambiguities

Three questions came up on review. All were checked against a keyword sweep of the full 11-page spec; none change the architecture. Recorded here so we don't re-litigate them at hour 20.

#### A · Are the seeded salary rules required defaults, or do users build everything from scratch?

**Both — seed them as data, make them fully editable.**

The brief never prescribes a rule set: `predefined`, `default`, `preconfigured`, `out-of-the-box` are all **absent** from the spec. The `BASIC / HRA / DA / PF / PT / TDS` set in §4 is *our* choice of realistic content, not an organizer requirement.

But two lines make seeding effectively mandatory:

> "Fully operational HR and payroll system **populated with** representative employee, contract, time, salary, and payroll data" — *deliverables, p10*

> "Ensure Salary Rules **actively drive** Payslip generation; configuration screens must be fully functional and integrated, not static mockups." — *p10*

So we ship **both**:
- **Seeded as database rows** via `seed.py`, so a judge opening the app sees a working payroll immediately and the Salary Structure screen isn't an empty table.
- **Fully user-creatable** — create, edit, delete, reorder sequence, rewrite a formula. Nothing about the rules lives in Python.

The line that actually decides the score is a third one: *"Implement essential business rules … directly in the application logic rather than **using hardcoded values**."* A judge tests this by editing `HRA` from 40% → 50%, hitting **Compute**, and watching net salary move. If that works we pass; if `HRA` is a constant in `payroll_engine.py` we fail regardless of how the UI looks.

**Build requirement:** the seeded set must be deletable. Demo beat — delete a rule, recompute, show the payslip line vanish.

#### B · Is there an official dataset, or do we generate demo data?

**We generate it. No official dataset exists.**

`dataset`, `sample data`, `CSV`, `upload`, `provided` are all **absent** from the spec, and the only URL in the entire 11-page brief is the Excalidraw mockup link.

Use **Faker with a fixed random seed** so every run is byte-identical — the demo must not look different from the rehearsal. Two contents that aren't obvious but are load-bearing (see §9):
- **3 historical validated + paid payruns**, or the required Monthly Net Salary Trend chart renders empty on stage.
- **~3 employees with missing bank details**, so `MISSING_BANK_DETAILS` fires live instead of us breaking something on stage.

**Open question worth asking the organizers.** Absence from the brief isn't proof they haven't posted a dataset on a portal or Discord. Ask — but don't block: synthetic data is the safe default and "representative" points that way.

#### C · Where do attendance check-ins come from — the app, or a biometric device?

**In-app. No device integration.**

`biometric`, `fingerprint`, `RFID`, `device`, `kiosk`, `scanner`, `hardware` — **zero occurrences across all 11 pages.** The brief states the source positively instead:

> Employee role: "**Create attendance entries** and Time Off Requests" — *p3*

> "Attendance Form provides detailed records and supports **manual corrections** restricted to authorized users" — *B3, p6*

Employees create entries in the web app; HR corrects them, with the correction flagged via `is_manual_edit` / `edit_reason` (§3). That is exactly why the dashboard tracks *manual edits* and *missing check-outs* as attendance-quality metrics — the model assumes human entry with exceptions, not clean device telemetry.

**Do not build biometric integration.** Pure scope creep, zero rubric payoff, and it would eat hours from the payroll engine where the marks actually are.

*Optional hedge, only after T+32h:* a `POST /attendances/bulk` endpoint taking a JSON array. ~20 minutes, makes the seed script cleaner, and gives a one-sentence answer if a judge asks about devices — "the ingestion endpoint is there; a device adapter would post to it."

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
│  │  contract_resolver · schedule_calc · leave_engine          │  │
│  │  attendance_service · payroll_engine · formula (sandbox)   │  │
│  │  warnings · pdf · mailer · dashboard                       │  │
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

**Deliberately excluded** (wrong complexity for 48h): Celery/Redis, microservices, event bus, GraphQL. `BackgroundTasks` covers bulk email; Postgres covers everything else.

**One non-obvious call:** MailHog in Compose. Bulk "Send Payslips" is a required feature and demoing it against real SMTP is slow and fragile. MailHog captures every message with a browsable inbox — judges *see* 30 payslip emails land, with zero deliverability risk. A `.env` switch points at real SMTP later.

**Second non-obvious call:** WeasyPrint runs in the Linux container, not on Windows. WeasyPrint needs GTK, a genuine time sink to install on Windows 11. Since we're already on Compose, this costs nothing. *(Fallback if it fights us: `fpdf2` — pure Python, no system deps.)*

---

## 3. Data Model

23 tables. The **Employee is the hub**; everything else hangs off it.

```
                        ┌──────────────┐
                        │     User     │  role, email, password_hash
                        └──────┬───────┘
                               │ 1:1
┌────────────┐          ┌──────▼───────┐          ┌─────────────────┐
│ Department │◄─────────│   EMPLOYEE   │─────────►│ WorkingSchedule │
│ JobPosition│          │   (the hub)  │          │  hours_per_week │
└────────────┘          └──────┬───────┘          │   = COMPUTED    │
                               │                  └────────┬────────┘
     ┌─────────────┬───────────┼───────────┬───────────┐   │ 1:N
     ▼             ▼           ▼           ▼           ▼   ▼
┌─────────┐ ┌───────────┐ ┌─────────┐ ┌──────────┐ ┌──────────────┐
│Contract │ │Attendance │ │TimeOff  │ │  Leave   │ │ScheduleLine  │
│ wage    │ │ check_in  │ │Request  │ │Allocation│ │ day/start/   │
│ period  │ │ check_out │ │         │ │          │ │ end/break    │
│ state   │ │worked_hrs │ └────┬────┘ └────┬─────┘ └──────────────┘
└────┬────┘ └───────────┘      └─consumes─►┘
     │                                │
     │ FK                        ┌────▼──────┐
     ▼                           │TimeOffType│ unit, requires_allocation,
┌─────────────────┐              └───────────┘ affects_payroll
│ SalaryStructure │◄──────┐
└────────┬────────┘       │
         │ 1:N            │        ┌────────┐      ┌──────────┐
         ▼                └────────│ PAYRUN │─────►│ Payslip  │
┌─────────────────┐                │ period │ 1:N  │  gross   │
│   SalaryRule    │                │ state  │      │   net    │
│ code, category, │                └────────┘      └────┬─────┘
│ sequence,       │                     │               │ 1:N
│ amount_type,    │                     ▼               ▼
│ formula         │              ┌──────────────┐  ┌─────────────┐
└─────────────────┘              │PayrollWarning│  │ PayslipLine │
                                 └──────────────┘  │ rule, amount│
                                                   └─────────────┘
```

### Tables that carry the hard logic

**`working_schedule`** — `hours_per_week` is a **read-only computed column**, recalculated from `working_schedule_line` rows on every write. Spec A3 is explicit that it must not be entered manually.

**`contract`** — `state ∈ {DRAFT, RUNNING, EXPIRED, CANCELLED}`, `date_end` nullable (open-ended).
Enforced by a Postgres **exclusion constraint** so overlap is impossible at the DB level, not just in Python:

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE contract ADD CONSTRAINT no_overlapping_running_contracts
  EXCLUDE USING gist (
    employee_id WITH =,
    daterange(date_start, COALESCE(date_end, 'infinity'::date), '[]') WITH &&
  ) WHERE (state = 'RUNNING');
```

This single constraint is a strong talking point: it makes the spec's "avoiding concurrent active contracts" structurally true.

**`attendance`** — stores `check_in`, `check_out` (nullable), `worked_hours`, plus `is_manual_edit`, `edited_by_id`, `edit_reason`. `status` is derived against the employee's schedule: `PRESENT | LATE | MISSING_CHECKOUT | OVERTIME | ABSENT`. The dashboard's "Attendance Health" needs exactly these.

**`salary_rule`** — the engine's config:

```
code (unique), name, category ∈ {BASIC, ALLOWANCE, GROSS, DEDUCTION, NET},
sequence int, structure_id,
condition_type ∈ {ALWAYS, EXPRESSION},   condition_expr text,
amount_type   ∈ {FIXED, PERCENTAGE, FORMULA},
amount_fixed numeric, percentage numeric, percentage_base_code text,
amount_formula text, appears_on_payslip bool, is_active bool
```

**`payslip_line`** — `(payslip_id, rule_code, name, category, sequence, quantity, rate, amount)`. This *is* the "Salary Computation" breakdown the spec's B7 screen shows.

**`payroll_warning`** — `(payrun_id, payslip_id, employee_id, severity, code, message, resolved)`. Persisted at compute time so both the Payrun screen and the Dashboard alerts panel read the same rows.

---

## 4. The Payroll Engine

This is where the hackathon is won or lost. It gets built **early (hour ~10), with unit tests** — not at hour 30.

### Compute pipeline (per employee, per payrun)

```
1. RESOLVE CONTRACT  ──────────────────────────────────────────
   SELECT * FROM contract
   WHERE employee_id = :e AND state = 'RUNNING'
     AND date_start <= :period_end
     AND (date_end IS NULL OR date_end >= :period_start)
   → 0 rows  → warning NO_ACTIVE_CONTRACT (ERROR), skip payslip
   → 2+ rows → warning OVERLAPPING_CONTRACTS (ERROR)   [DB makes this ~impossible]

2. COMPUTE TIME BASIS  ────────────────────────────────────────
   scheduled_days   ← working-schedule weekday pattern ∩ period
   attendance rows  ← worked_hours, overtime_hours, missing_checkouts
   approved leave   ← paid_leave_days / unpaid_leave_days (split by TimeOffType)
   worked_days      = scheduled_days − unpaid_leave_days

3. BUILD EVAL CONTEXT  ────────────────────────────────────────
   contract.wage, contract.hours_per_week
   worked_days, scheduled_days, worked_hours, overtime_hours,
   paid_leave_days, unpaid_leave_days
   employee.employee_type, employee.department
   rules.<CODE>       ← amount of an already-computed rule
   categories.<CAT>   ← running total per category
   helpers: min, max, round, abs

4. EVALUATE RULES  ────────── ORDER BY sequence ASC ───────────
   for rule in structure.rules:
       if not eval(rule.condition_expr): continue
       amount = FIXED | PERCENTAGE(of rules[base_code]) | FORMULA(eval)
       write PayslipLine
       rules[rule.code]          = amount   ← later rules can reference it
       categories[rule.category] += amount  ← running totals

5. FINALIZE  ──────────────────────────────────────────────────
   basic = categories.BASIC · gross = categories.GROSS
   deductions = categories.DEDUCTION · net = categories.NET
   run warning checks → persist
```

Step 4's two assignment lines are the whole point of *"rules are processed in a specific sequence to ensure dependencies are respected."*

### Formula sandbox — `services/formula.py`

`eval()` on user-entered strings is a real vulnerability, and "we sandboxed it" is a strong judging talking point.

Approach: compile with `ast.parse(expr, mode='eval')`, then **walk the tree and reject any node not on the allowlist**.

- **Allowed:** `Expression, BinOp, UnaryOp, BoolOp, Compare, IfExp, Constant, Name(load), Call(allowlisted funcs only), Attribute(only on allowlisted namespaces)`
- **Rejected:** `Import`, `Attribute` on arbitrary objects, dunder access, `Lambda`, `Subscript`, comprehensions, `__import__`, `open`, `exec`
- Evaluated with `{"__builtins__": {}}` plus the frozen context dict.
- Errors are caught per-rule → the line records `amount=0` and a `RULE_EVAL_FAILED` warning, so one bad formula never kills a whole payrun.

### Seeded rule set (Indian payroll — demonstrates sequencing + back-references)

| Seq | Code | Name | Category | Computation |
|----|------|------|----------|-------------|
| 10 | `BASIC` | Basic Salary | BASIC | `contract.wage * worked_days / scheduled_days` |
| 20 | `HRA` | House Rent Allowance | ALLOWANCE | 40% of `BASIC` |
| 30 | `DA` | Dearness Allowance | ALLOWANCE | 20% of `BASIC` |
| 40 | `CONV` | Conveyance | ALLOWANCE | fixed `1600` |
| 50 | `SPECIAL` | Special Allowance | ALLOWANCE | `max(0, contract.wage - rules.BASIC - rules.HRA - rules.DA - rules.CONV)` |
| 60 | `OT` | Overtime | ALLOWANCE | `overtime_hours * (rules.BASIC / (scheduled_days * 8)) * 1.5` |
| 100 | `GROSS` | Gross Salary | GROSS | `categories.BASIC + categories.ALLOWANCE` |
| 110 | `PF` | Provident Fund | DEDUCTION | `min(rules.BASIC, 15000) * 0.12` |
| 120 | `PT` | Professional Tax | DEDUCTION | `200 if rules.GROSS > 21000 else 0` |
| 130 | `TDS` | Income Tax | DEDUCTION | `max(0, (rules.GROSS * 12 - 500000) * 0.05 / 12)` |
| 140 | `LWP` | Unpaid Leave Deduction | DEDUCTION | `contract.wage / scheduled_days * unpaid_leave_days` |
| 200 | `NET` | Net Salary | NET | `categories.GROSS - categories.DEDUCTION` |

`SPECIAL` and `NET` both back-reference earlier results — visible proof of ordered evaluation on the payslip screen.

### Warnings — `services/warnings.py`

| Code | Severity | Blocks | Trigger |
|---|---|---|---|
| `NO_ACTIVE_CONTRACT` | ERROR | validate | no RUNNING contract covers the period |
| `OVERLAPPING_CONTRACTS` | ERROR | validate | >1 contract matches |
| `DUPLICATE_PAYSLIP` | ERROR | validate | employee already has a payslip in an overlapping period on another live payrun |
| `NEGATIVE_NET` | ERROR | validate | net < 0 |
| `NO_STRUCTURE_RULES` | ERROR | compute | structure has no active rules |
| `MISSING_BANK_DETAILS` | WARNING | mark-paid | bank account / IFSC empty |
| `RULE_EVAL_FAILED` | WARNING | — | a formula threw |
| `MISSING_CHECKOUT` | WARNING | — | attendance rows in period with null check_out |
| `LEAVE_EXCEEDS_ALLOCATION` | WARNING | — | approved leave > allocated balance |
| `CONTRACT_EXPIRING` | INFO | — | contract ends within 30 days of period end |

State transitions are gated in the service layer: `validate` refuses on any ERROR; `mark-paid` refuses on unresolved `MISSING_BANK_DETAILS` unless `force=true`. This gives the demo its best beat — *the system stops you before you pay someone wrong.*

---

## 5. API Design — `/api/v1`

FastAPI's auto-generated `openapi.json` is the **single source of truth**; Pranav generates his TS client from it.

### Auth
```
POST   /auth/login            → {access_token, refresh_token, user{id,role,employee_id}}
POST   /auth/refresh
GET    /auth/me
```

### Master data
```
GET    /employees                ?q&department_id&status&employee_type&page  (Kanban + List)
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

### Attendance & Time Off
```
GET|POST   /attendances          ?employee_id&date_from&date_to&status
POST       /attendances/check-in · /attendances/check-out
PATCH      /attendances/{id}     HR_MANAGER+ only; sets is_manual_edit + edit_reason

GET|POST|PATCH  /time-off/types
GET|POST        /time-off/allocations
POST            /time-off/allocations/{id}/approve · /refuse
GET|POST        /time-off/requests
POST            /time-off/requests/{id}/approve · /refuse
GET             /time-off/balances     ?employee_id
                → per type: {allocated, taken, remaining, validity_from, validity_to}
```

### Payroll configuration
```
GET|POST|PATCH  /salary-structures
GET             /salary-structures/{id}   → rules ordered + rule_count + employee_count
POST            /salary-structures/{id}/reorder   {rule_ids: [...]}   drag-to-reorder
GET|POST|PATCH  /salary-rules
POST            /salary-rules/validate-formula    → dry-run the sandbox, return error or sample
```

### Payrun — the two-step wizard (spec B5)

The spec is emphatic: *"Clicking Continue moves to employee selection **without creating the Payrun**."* So step 1 hits a **stateless preview endpoint** that persists nothing:

```
POST /payruns/eligible-employees          ← STEP 1 · creates NOTHING
     {salary_structure_id, period_start, period_end, department_id?, employee_type?}
     → [{employee_id, name, department, contract_wage,
         eligible: bool, blockers: ["NO_ACTIVE_CONTRACT"|"DUPLICATE_PAYSLIP"|...]}]

POST /payruns                             ← STEP 2 · "Create Payrun"
     {name, salary_structure_id, period_start, period_end, employee_ids:[...]}
     → creates batch + DRAFT payslips, returns processing view
```

### Payrun processing (spec B6)
```
GET   /payruns              ?state&period&department_id
GET   /payruns/{id}         → payslips summary + warnings + totals
POST  /payruns/{id}/compute        → (re)generate payslips + lines + warnings   [idempotent]
POST  /payruns/{id}/validate       → VALIDATED   blocked by ERROR warnings
POST  /payruns/{id}/mark-paid      → PAID        blocked by MISSING_BANK_DETAILS
POST  /payruns/{id}/send-payslips  → BackgroundTasks bulk email + PDF attach
GET   /payruns/{id}/warnings
```

### Payslips
```
GET   /payslips             ?payrun_id&employee_id&state&period
GET   /payslips/{id}        → lines grouped by category, worked days, contract used
GET   /payslips/{id}/pdf    → application/pdf
POST  /payslips/{id}/recompute
```

### Dashboard (spec B9) — one endpoint, one round-trip
```
GET /dashboard  ?period_start&period_end&department_id&employee_type
{
  kpis: {total_net_paid, payslips_generated, average_salary,
         approved_time_off_days, attendance_health_pct, headcount},
  salary_cost_by_department: [{department, headcount, total_gross, total_net}],
  monthly_net_trend:        [{month, net}],         ← last 12 months
  attendance_overview:      {present, late, absent, overtime_hours,
                             missing_checkouts, manual_edits, coverage_pct},
  time_off_overview:        {approved_days, pending_requests, by_type[], low_balances[]},
  alerts:                   [{severity, code, message, entity_type, entity_id}]
}
```
Built from SQL aggregates over live tables — no cached or static values, per the spec's explicit requirement.

### Cross-cutting
- Errors: RFC 7807-ish `{code, message, field_errors[]}` — Pranav maps `code` to toasts once.
- Pagination: `?page&page_size` → `{items, total, page, pages}` on every list.
- All money as `Numeric(12,2)`; serialized as strings to dodge float drift.

---

## 6. RBAC

Five roles, exactly as spec page 3 defines them. A declarative matrix in `core/rbac.py` plus one FastAPI dependency `require("payrun", "create")`.

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
| Dashboard | — | — | R | R | R |
| User & role management | — | — | — | — | CRUD |

**Row-level scoping:** `EMPLOYEE` requests pass through a shared dependency that injects `WHERE employee_id = current_user.employee_id`. Enforced in the service layer so no router can forget it.

**One spec ambiguity, flagged:** page 3 gives Employees *"no payroll access"* and lists only details / attendance / leave-balances — it does **not** grant them payslip viewing. So `/payslips` stays closed to `EMPLOYEE`; they receive payslips by email (spec B8). If we'd rather employees see their own payslips in-app, that's a one-line matrix change — but the strict reading matches the brief, so that's the default.

---

## 7. Work Split & Schedule

### The contract-first rule (hours 0–2, both together)
Aditya defines all Pydantic schemas and stubs every router to return realistic fixtures. Pranav immediately runs:

```bash
npx openapi-typescript http://localhost:8000/openapi.json -o src/api/schema.d.ts
```

Pranav then builds against **MSW mocks** derived from those types. **Result: Pranav is never blocked waiting on backend logic** — the single most common failure mode for a 2-person hackathon team.

**Ownership boundary:** Aditya owns `backend/` and `openapi.json`. Pranav owns `frontend/src/`. Neither edits the other's tree. Any contract change → Aditya appends a line to `docs/api-contract.md` and pings Pranav.

### Aditya — backend track
| # | Block | Hrs | Notes |
|---|---|---|---|
| B0 | Scaffold, Compose (Postgres + MailHog + api), config, JWT auth, RBAC matrix | 4 | Ship `/docs` early |
| B1 | Employee, Department, JobPosition, WorkingSchedule + hours computation | 4 | `/employees/{id}/summary` |
| B2 | Contract + **exclusion constraint** + `contract_resolver` | 3 | Unit-test the resolver |
| B3 | Attendance + derived status + manual-edit audit | 3 | |
| B4 | TimeOffType, Allocation, Request, `leave_engine` balances + approval | 5 | Schedule-aware duration |
| B5 | **`formula.py` sandbox + `payroll_engine.py`** | 6 | ⚠ longest pole — start by hr 10 |
| B6 | SalaryStructure / Rule CRUD + reorder + validate-formula | 3 | |
| B7 | Payrun lifecycle, eligible-employees preview, warnings engine | 5 | |
| B8 | Payslip PDF (WeasyPrint + Jinja2) + bulk email | 3 | |
| B9 | Dashboard aggregation endpoint | 3 | |
| B10 | **Seed script** | 3 | See §9 — do not skip |

### Pranav — frontend track
| # | Block | Hrs | Notes |
|---|---|---|---|
| F0 | Vite + TS + Tailwind + shadcn, router, auth, role-gated top nav | 4 | 6 nav items per spec B1 |
| F1 | **Shared primitives** — `DataTable`, `FormLayout`, `StatusBadge`, `SmartButtonBar`, `DateRangePicker`, `ConfirmDialog` | 5 | Built once, reused ~15× — highest-leverage hours in the project |
| F2 | Employee **Kanban + List + Form** with smart buttons | 5 | The operational hub |
| F3 | Contracts list/form; active contract visually highlighted | 3 | |
| F4 | Working Schedule **weekly grid editor**; live weekly-hours readout | 3 | |
| F5 | Attendance list + form + manual correction dialog | 3 | |
| F6 | Time Off: Requests, Allocations, Types + approve/refuse | 5 | |
| F7 | Salary Structure / Rule config, **drag-to-reorder sequence** | 4 | |
| F8 | **Payrun 2-step wizard** + processing screen + payslip breakdown | 6 | Highest demo value |
| F9 | Dashboard: KPI cards, Recharts bar + line, alerts panel | 5 | |

### Hard sync points
| When | Gate |
|---|---|
| **T+2h** | OpenAPI contract frozen; TS client generated |
| **T+8h** | Auth + Employee CRUD wired end-to-end against the real API |
| **T+20h** | Attendance + Time Off + payroll config screens live |
| **T+32h** | **Full payrun → compute → warnings → validate → PDF path working** |
| **T+40h** | Dashboard live. **FEATURE FREEZE.** Seed, rehearse, record backup video |
| **T+44h** | Stretch only: deploy to Render + Vercel |

---

## 8. Scale & Reliability

Right-sized for the brief, not for imaginary traffic.

**Load:** 500 employees × 1 monthly payrun = 500 payslips × ~12 lines = **6,000 rows/run**. Target compute < 5s.

**How that target is met** — the naive version does 500 × 4 queries and crawls:
- Pre-load per payrun in **3 bulk queries** (contracts, attendance aggregates, approved-leave aggregates), keyed into dicts before the loop. No N+1.
- `bulk_save_objects` for payslip lines.
- One transaction per payrun; `SELECT … FOR UPDATE` on the payrun row so a double-clicked **Compute** can't run twice.
- `compute` is **idempotent** — deletes and regenerates lines inside the transaction.
- `UNIQUE (payrun_id, employee_id)` on payslip.

**Indexes:** `contract(employee_id, state, date_start, date_end)`, `attendance(employee_id, check_in)`, `time_off_request(employee_id, state, date_from)`, `payslip(payrun_id)`, `payslip_line(payslip_id)`.

**Reliability:** health check at `/healthz`; structured JSON logs with a request-id; state machines reject illegal transitions; finalized payruns are immutable (spec: *"Preserves finalized or paid payroll batches as historical records"*).

### What we'd revisit past the hackathon
| Trigger | Change |
|---|---|
| Payruns > ~5k employees | Move compute to Celery + Redis with per-payslip tasks and progress streaming |
| Multi-country payroll | Version salary structures; add effective-dated rules |
| Audit / compliance | Full append-only audit log; signed, immutable payslip PDFs |
| Real deployment | Secrets manager, DB backups + PITR, rate limiting, Sentry |
| Bulk email at scale | SES/SendGrid with a retry queue and bounce handling |

---

## 9. Demo Data — treat as a deliverable

The brief requires *"representative employee, contract, time, salary, and payroll data"* and a **Monthly Net Salary Trend chart built on historical data**. An empty trend chart on stage looks broken, so the seed must include prior periods.

`backend/app/db/seed.py` generates:
- 4 departments, 12 job positions, 5 users (one per role)
- **30 employees**, mixed `employee_type`, with avatars; ~3 deliberately missing bank details → live `MISSING_BANK_DETAILS` warnings
- 3 working schedules (Standard 40h, Part-time 20h, Night shift)
- **35 contracts** — several employees with an expired + a current contract, to prove period-based selection
- **~2,000 attendance rows** across 4 months, seeded with realistic exceptions (late arrivals, missing check-outs, overtime)
- 5 time off types, ~40 allocations, ~60 requests across all states
- 1 salary structure, 12 rules (table in §4)
- **3 historical payruns (validated + paid) + 1 draft** → the trend chart has real data and the dashboard is populated on first load

---

## 10. Repository Layout

```
peoplepay360/
├── docker-compose.yml          postgres · api · mailhog · frontend
├── .env.example
├── README.md
├── docs/
│   ├── PRD.md                  this document
│   ├── api-contract.md         change log Aditya maintains
│   └── demo-script.md          the 5-minute walkthrough
├── backend/                                                    ADITYA
│   ├── Dockerfile · pyproject.toml · alembic/
│   ├── app/
│   │   ├── main.py
│   │   ├── core/         config · security · rbac · deps · errors
│   │   ├── db/           base · session · seed.py
│   │   ├── models/       employee contract schedule attendance
│   │   │                 timeoff salary payrun payslip
│   │   ├── schemas/      Pydantic — the API contract
│   │   ├── api/v1/       auth employees contracts schedules attendance
│   │   │                 timeoff salary payruns payslips dashboard
│   │   ├── services/     contract_resolver · schedule_calc · leave_engine
│   │   │                 formula · payroll_engine · warnings
│   │   │                 pdf · mailer · dashboard
│   │   └── templates/    payslip.html (Jinja2 → WeasyPrint)
│   └── tests/
└── frontend/                                                   PRANAV
    ├── Dockerfile · vite.config.ts
    └── src/
        ├── api/          generated schema.d.ts + typed hooks
        ├── components/   ui/ (shadcn) · shared/ (DataTable, SmartButtonBar…)
        ├── features/     employees contracts schedules attendance
        │                 timeoff payroll dashboard
        └── routes/
```

---

## 11. Risks

| # | Risk | Mitigation |
|---|---|---|
| 1 | **Payroll engine underestimated** — it's the brief's core and the longest pole | Build at hour 10, not hour 30. Unit-test the rule sequencing before any UI touches it. |
| 2 | **Empty dashboard on demo day** — trend chart needs history | Seed 3 historical payruns (§9). Non-negotiable. |
| 3 | **API contract drift between the two of us** | OpenAPI is the single source of truth; Pranav regenerates the TS client; changes logged in `docs/api-contract.md` |
| 4 | WeasyPrint / GTK pain on Windows 11 | Runs in the Linux container. Fallback: `fpdf2`. |
| 5 | UI polish eats payroll time | Feature freeze at **T+40h**, no exceptions |
| 6 | Live demo failure during judging | Local Compose is the primary demo; **record a backup video at T+42h** |
| 7 | Formula `eval()` as an injection hole | AST allowlist sandbox (§4); a judge *will* ask about this |

---

## 12. Verification

**Bring it up**
```bash
docker compose up --build
```
- API + Swagger → `http://localhost:8000/docs`
- Frontend → `http://localhost:5173`
- MailHog inbox → `http://localhost:8025`

**Seed**
```bash
docker compose exec api python -m app.db.seed
```

**Automated tests** — small, targeted at the logic judges will probe:
```bash
docker compose exec api pytest -v
```

| Test | Asserts |
|---|---|
| `test_formula_sandbox` | `__import__`, `open`, dunder access all rejected |
| `test_rule_sequencing` | `SPECIAL` and `NET` resolve using earlier rule results |
| `test_contract_resolver` | picks the period-valid contract when an employee has 2+ |
| `test_overlapping_contracts` | DB exclusion constraint raises on overlap |
| `test_schedule_hours` | `hours_per_week` computed correctly from lines, ignores manual input |
| `test_leave_balance` | approving a 3-day request drops remaining 12 → 9 |
| `test_payrun_gating` | `validate` refuses while an ERROR warning is open |
| `test_dashboard_aggregates` | KPI totals match a hand-computed fixture |

### End-to-end — the two required demo scenarios

**Scenario A — Employee → Payslip**
1. Create employee → assign Standard 40h schedule → confirm weekly hours auto-computed
2. Create a RUNNING contract for the period; try a second overlapping one → rejected
3. Payroll → **NEW** → wizard step 1 (structure + period) → **Continue** → *confirm via `GET /payruns` that nothing was created yet* ← the spec's exact requirement
4. Select employees → **Create Payrun** → **Compute**
5. Inspect a payslip: BASIC → HRA/DA/CONV/SPECIAL → GROSS → PF/PT/TDS → NET, in sequence
6. See `MISSING_BANK_DETAILS` warning → **Validate blocked** → fix the record → **Validate** → **Mark Paid**
7. **Print Payslip** → PDF · **Send Payslips** → 30 emails land in MailHog

**Scenario B — Allocation → Request → Payroll impact**
1. Create a Time Off Type (days, requires allocation, unpaid)
2. Allocate 12 days → approve → balance shows 12
3. Employee raises a 3-day request → HR approves → **balance drops to 9**
4. Recompute the payrun → the `LWP` deduction line appears and NET drops accordingly

**Dashboard check:** change the Period and Department filters and confirm every KPI, both charts, and the alerts panel move — proving live aggregation rather than static data.

---

## 13. First Actions on Go-Ahead

1. `git init` + scaffold the repo tree in §10
2. Write `docker-compose.yml` (postgres · api · mailhog · frontend) + `.env.example`
3. Aditya: SQLAlchemy models + first Alembic migration (incl. `btree_gist` + exclusion constraint)
4. Aditya: Pydantic schemas + stub routers → **publish `openapi.json` within the first 2 hours**
5. Pranav: Vite scaffold, generate the TS client, start on the F1 shared primitives
