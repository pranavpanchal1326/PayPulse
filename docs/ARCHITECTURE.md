# Architecture

How PayPulse is put together, and why the interesting parts are shaped the way
they are.

---

## The shape of it

```
                    React + Vite (5173)
                            │  fetch, Bearer token
                            ▼
        ┌─────────────────────────────────────────┐
        │  FastAPI  (8000)                        │
        │                                         │
        │   api/v1/       routing, RBAC, shapes   │
        │      │                                  │
        │   services/     all the business logic  │
        │      │                                  │
        │   models/       SQLAlchemy ORM          │
        └──────┼──────────────────────────────────┘
               ▼
        PostgreSQL 16 (5432)        Mailpit (8025)
        20 tables, 11 migrations    payslip delivery
```

Four containers, defined in `docker-compose.yml`: `db`, `api`, `frontend`,
`mail`.

### Layers, and the rule between them

| Layer | Holds | Never does |
|---|---|---|
| `api/v1/` | Routing, permissions, request/response shapes | Business arithmetic |
| `services/` | All rules, all calculation | Import FastAPI |
| `models/` | Tables, columns, constraints | Contain logic beyond derived properties |
| `schemas/` | Pydantic request/response contracts | Touch the database |

`services/` importing no FastAPI is what makes the engine unit-testable
without a client — which is why 449 tests run in five seconds.

---

## The payroll pipeline

This is the part worth understanding. A payslip is not a stored number; it is
computed from five sources that must agree.

```
 contract ──┐
 schedule ──┤
 holidays ──┼──►  time_basis  ──►  payroll_engine  ──►  payslip + lines
attendance ─┤     (the days)       (the money)
    leave ──┘
```

### 1. The pay basis — `services/time_basis.py`

Every day figure a payslip is built from:

```
period_days   = schedule working days in the period, minus public holidays
contract_days = period_days narrowed to the contract and employment dates
unpaid_days   = unpaid leave + absence without leave
payable_days  = contract_days - unpaid_days
```

`time_basis` counts nothing itself. It composes `calendar`,
`attendance_service` and `leave_engine`, so a payslip can never disagree with
the attendance screen or the leave balance. That composition is the point —
it is the "records work together" the brief asks for.

The policy: **schedule-anchored, attendance-derived absence.** You are paid
for the days your schedule and contract say you work, minus unpaid leave,
minus days absent without leave. Attendance does not *earn* pay; its absence
removes it. Absence has no row — it is the absence of one.

### 2. The engine — `services/payroll_engine.py`

Rules evaluate in ascending `sequence`, and after each one:

```python
rules[code]      = amount   # a later rule can reference it
categories[cat] += amount   # running totals per category
```

Those two lines are the entire "complex totals build upon earlier
calculations" feature. `SPECIAL` references `BASIC`; `GROSS` sums two
categories; `NET` subtracts one from another. All of it falls out of ordered
evaluation over a mutable context.

**Rounding.** Every line rounds `HALF_UP` to 2dp *at line level*, and category
totals accumulate already-rounded amounts. So `sum(lines) == net` exactly. A
payslip that does not reconcile is the one thing a payslip may never do.

### 3. Formulas — `services/formula.py`

Rule formulas are user-supplied text, so they never reach `eval()`. The
evaluator parses to an AST, rejects any node type outside a small allowlist,
caps nesting depth, and rewrites numeric literals to `Decimal` — money never
touches float.

---

## Contract resolution

An employee has many contracts over time. `services/contract_resolver.py`
picks the one valid for a given day and reports what it found:

- **No contract** → `NO_ACTIVE_CONTRACT`, and the employee is skipped.
- **Two covering the period** → `MULTI_CONTRACT_PERIOD`, prorated across the
  boundary. This is the "raise on the 16th" case.
- **Ending soon** → `CONTRACT_EXPIRING`, informational.

Genuinely overlapping *active* contracts are refused at write time, so the
resolver never has to guess.

---

## Payrun lifecycle

```
DRAFT ──compute──► COMPUTED ──validate──► VALIDATED ──mark-paid──► PAID
  │                    │                      │
  └────────────────────┴──────────────────────┴──► CANCELLED
                                              (PAID cannot be cancelled)
```

Warnings gate the transitions. `services/warnings.py` maps each code to a
severity and the transition it blocks — an `ERROR` blocks `validate`, and
paying past a blocking warning requires an explicit forced reason that is
recorded. A `PAID` payrun is a historical record and is never unwound.

---

## Leave

Two things are worth knowing.

**Approval is refused past zero**, not warned about. A warning that changed
nothing let balances go negative while pay stayed the same, which broke the
premise of the feature.

**The ledger is kept in days for every type** — days are what payroll
consumes, and what the over-balance guard compares a request against. A type
measured in `HOURS` (Compensatory Off) is a *presentation* in hours: the
conversion happens at the API edge in `GET /time-off/balances`, never inside
`balances()` itself. Converting in the engine would hand the guard hours to
compare against a request in days, and it would approve past zero.

---

## Security

| Concern | Where |
|---|---|
| Permission matrix | `core/rbac.py` — pure policy, no FastAPI, unit-tested alone |
| FastAPI wiring | `core/deps.py` |
| Scoping | `EMPLOYEE` is scoped to `OWN`; other ids return 404, not 403, so nothing can be probed |
| Tokens | Access + refresh; a refresh token is rejected as an access token |
| Revocation | `user.tokens_valid_from` invalidates every session at once |
| Rate limiting | `core/ratelimit.py` — fixed window, one row per key, shared across processes |

The matrix mirrors page 3 of the problem statement, including its
"all X permissions plus…" phrasing — which is why payroll roles are built by
extending the role beneath them rather than being restated.

---

## Key decisions

**Money is `Numeric`, and strings on the wire.** Never float, anywhere. A
payslip that loses paise to binary floating point is worse than no payslip.

**Absence has no row.** Absence is the absence of an attendance row, derived
against the schedule. A NULL-vs-ABSENT distinction would have to be kept
truthful by something, and nothing could.

**`worked_hours` is computed server-side, never accepted.** Otherwise a night
shift crossing midnight computes as negative.

**Public holidays exist even though the brief never mentions them.** Without
them, `period_days` counts Diwali as a working day, which inflates the pay
denominator, mis-prorates every joiner and leaver, and makes leave spanning a
holiday consume balance. Three columns fix all three.

**The seed is idempotent.** Re-running it tops the demo data up rather than
duplicating it — every row is looked up before it is written.
