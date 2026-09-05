# API contract — change log

The ownership boundary from [PRD §8.1](PRD.md): **Aditya owns `backend/` and
`openapi.json`; Pranav owns `frontend/src/`.** Neither edits the other's tree.

**Any contract change gets an entry here and a ping.** Not a commit message, not
a Slack line that scrolls away — an entry, in this file, with a date and the
shape that changed. A hand-written frontend contract and a generated backend
one only stay in step if there is one place that records when they move.

---

## How the two sides line up today

| | Source | Covers |
|---|---|---|
| `frontend/src/api/schema.d.ts` | generated from the live `/openapi.json` | whatever the backend has shipped — today, auth and `/healthz` |
| `frontend/src/api/contract.ts` | hand-written from [PRD §5](PRD.md) | B1–B9, everything not shipped yet |
| `frontend/src/mocks/` | the fixtures behind `contract.ts` | every PRD §5 endpoint, served under `VITE_API_MODE=mock` |

**The migration is per-block, and it is a deletion.** When a backend block
lands, its types come out of `contract.ts` and are read from `schema.d.ts`
instead, the matching mock handler is retired, and an entry below records it. A
type in `contract.ts` is a promissory note, not a home.

Regenerate the schema whenever the backend ships a router:

```bash
npx openapi-typescript http://localhost:8100/openapi.json -o src/api/schema.d.ts
```

---

## Conventions that apply to every endpoint

These are not negotiable per-route, and a deviation is a contract change that
needs an entry here.

- **Money is a string.** `Numeric(12,2)` on the wire as `"50000.00"`, never a
  float. `parseFloat` on a money field is a lint error; `api/money.ts` is the
  only place one is parsed.
- **Every collection is `{items, total, page, pages, page_size}`.** No endpoint
  returns a bare array — with two deliberate exceptions, noted where they occur:
  `POST /payruns/eligible-employees` and `GET /time-off/balances` are fixed,
  small, and rendered whole, and paging either would let a user act on a subset
  they never saw.
- **Every failure is `{code, message, field_errors[]}`.** `code` is stable and
  mapped to a message once, in `api/errors.ts`. `field_errors` is populated on
  422 and belongs on the field, never in a toast.
- **Timestamps carry an offset**, rendered in `Asia/Kolkata`. Dates are
  `YYYY-MM-DD`.
- **Derived fields are computed server-side and ignored on write** —
  `worked_hours`, `overtime_hours`, `hours_per_week`, `duration_days`,
  `employee.status`. Sending them is not an error; it simply has no effect.

---

## Entries

### 2026-09-05 · P3 — the contract is written and mocked

The first entry, and the one that establishes the baseline. Types for B1–B9
hand-written from PRD §5 in `api/contract.ts`, and every one of those endpoints
now answers from `src/mocks` behind `VITE_API_MODE=mock`.

**Routes covered** — the full PRD §5 surface:

```
POST   /auth/login · /auth/refresh          GET /auth/me · /healthz
GET    /employees            POST /employees      GET|PATCH /employees/{id}
GET    /employees/{id}/summary
GET|POST /departments · /job-positions · /working-schedules   PATCH /{id}
GET|POST /contracts          PATCH /contracts/{id}     GET /contracts/active
GET|POST /attendances        POST /attendances/check-in · /check-out
PATCH  /attendances/{id}
GET|POST|PATCH /time-off/types
GET|POST /time-off/allocations    POST /time-off/allocations/{id}/approve · /refuse
GET|POST /time-off/requests       POST /time-off/requests/{id}/approve · /refuse · /cancel
GET    /time-off/balances
GET|POST /salary-structures  PATCH /salary-structures/{id}
GET    /salary-structures/{id}    POST /salary-structures/{id}/reorder
GET|POST|PATCH|DELETE /salary-rules
POST   /salary-rules/validate-formula
POST   /payruns/eligible-employees          GET|POST /payruns
GET    /payruns/{id} · /payruns/{id}/warnings
POST   /payruns/{id}/compute · /validate · /mark-paid · /reopen · /cancel · /send-payslips
GET    /payslips · /payslips/{id} · /payslips/{id}/pdf
POST   /payslips/{id}/recompute
GET    /dashboard
```

**Decisions the backend should match, or push back on now rather than in P10.**
Each is a place the PRD left room and the mock had to choose:

1. **`POST /payruns/eligible-employees` returns a flat array**, not a `Page`.
   It persists nothing and the wizard renders it whole.
2. **`GET /time-off/balances` returns a flat array** for the same reason — a
   handful of rows per employee.
3. **`POST /payruns/{id}/compute` accepts `COMPUTED → COMPUTED`.** §5 calls
   compute idempotent, so pressing it after fixing an attendance row must
   work, not 422. *(Found by the mock self-test, which initially failed this.)*
4. **`POST /payruns/{id}/send-payslips` answers `202`** with
   `{queued, skipped, message}` — it is a `BackgroundTasks` job, and a
   synchronous 200 would give the UI the wrong feedback model.
5. **`POST /salary-rules/validate-formula` answers `200` with
   `valid: false`** for a bad expression, rather than 422. The rule editor
   calls it on every keystroke; half-typed input is the normal case.
   The response carries an extra `referenced: string[]` — the identifiers the
   expression actually read — which the editor highlights. Drop it if the
   backend would rather not compute it.
6. **`GET /payslips/{id}` omits lines whose rule has
   `appears_on_payslip: false`**; the totals still include them.
7. **Row-level scoping answers `404`, not `403`.** An `EMPLOYEE` asking for
   another person's record gets "no longer exists" — a 403 would confirm that
   the record is there.
8. **`POST /time-off/requests` for an `HOURS`-unit type takes `hours`** and
   stores `duration_days = hours / daily_hours`. §3.6 says the conversion
   happens; it does not say which field carries the input.

**Two open questions for Aditya.** Both are noted in
[BUILD-PLAN.md](BUILD-PLAN.md) as well:

- **`HR_MANAGER` and the dashboard.** PRD §6.1(a) says that role gets the
  dashboard with money stripped. `core/rbac.py` does not grant it, and
  `tests/test_rbac.py::test_no_payroll_features` asserts it must not. The
  frontend and the mock both mirror the **backend**, so `GET /dashboard`
  currently 403s for `HR_MANAGER`. The serialiser branch that nulls
  `total_net_paid`, `average_net_salary`, `salary_cost_by_department` and
  `monthly_net_trend` is written and tested and will work the moment the grant
  is added — this is a one-line decision, not a rebuild.
- **`ABSENT` in the attendance status enum.** PRD §3.4 records it as a
  scheduled deletion — absence is the absence of a row, not a property of one.
  `contract.ts` already omits it and the frontend never renders it.

---

## 2026-09-05 · Stage III — three deltas found by building the screens

Building P6–P12 against the fixtures surfaced one rule the mock was missing and
two endpoints the frontend needs and §5 does not have. All three are recorded
here rather than worked around silently.

### 1. `POST /time-off/requests/{id}/cancel` — 409 inside a paid period *(implemented)*

PRD §3.6's cancellation table has three rows. The mock implemented two.

| Request state at cancel | Effect |
|---|---|
| `DRAFT` / `TO_APPROVE` | `CANCELLED`; no balance effect |
| `APPROVED`, period not yet `PAID` | `CANCELLED`; balance restored |
| `APPROVED`, period already `PAID` | **`409`** — paid payroll is immutable (§4.8) |

The third row now exists in `mocks/handlers/timeOff.ts`: it looks for a `PAID`
payslip whose period overlaps the request's dates and refuses with the month
named. **The backend must implement the same rule** — the UI relies on that
refusal being readable rather than on hiding the button, because whether a
period is paid is not something the request row knows.

### 2. `GET /contracts/{id}` — *proposed*

§5 lists `GET|POST|PATCH /contracts` and `GET /contracts/active`, and no
single-contract read. But `provenance.ts` has linked to `/contracts/{id}` since
P4 — it is where the derivation chain **ends** for every `BASIC` line, which is
the product's central promise — and P6 routes it.

Today the screen resolves the id out of the contract list it has already
loaded, and says *"that contract is not here"* when it cannot. That is honest,
and it means a deep link to a contract outside the current filter fails for a
reason the user cannot act on.

```
GET /contracts/{id}   → Contract, or 404 (row-scoped: an EMPLOYEE asking for
                        somebody else's contract gets 404, per convention 7)
```

Cheap — the row is already selected by `PATCH`. Not a blocker.

### 3. `GET /public-holidays` — *proposed, read-only*

§5 cut `/holidays` **CRUD** with the note *"holidays are seed-only"*, which is
right: nobody needs a screen to manage them. But it left no way to *read* them
either, and three places need to:

- THE LINE draws holiday ticks so that a company holiday is distinguishable
  from somebody taking a day (§10.1). It has drawn none since P5.
- The attendance month strip has the same gap for the same reason.
- The leave form would like to say *"two of those days are public holidays"*
  before the request is filed, rather than after the server has counted.

The frontend will not invent the calendar: a mark on the line that no row backs
is exactly what §10.1 forbids, so the ticks simply do not appear.

```
GET /public-holidays   ?date_from&date_to
                       → Page<PublicHoliday>   {id, name, date, is_optional}
```

`PublicHoliday` already exists in `contract.ts`, unused, waiting for this.
Read-only; no POST, no PATCH, no DELETE — seed-only stands.

### Also worth knowing

**`sessionStorage` now backs the mock's refresh tokens.** Not a contract
change — a mock fidelity fix. The client keeps its refresh token in
`localStorage` so a reload can re-mint (P2), and the mock held its session maps
in module scope, which the page re-imports on every reload. The result was a
valid token presented to a server that had forgotten every session it issued,
so `F5` signed you out under `VITE_API_MODE=mock` and did not against the real
API. Rotation is unchanged; the token is still burned on use.

---

**Not yet reconciled with `openapi.json`:** everything above except `/auth` and
`/healthz`. That reconciliation is the exit criterion of each B-block, and each
one gets an entry here.
