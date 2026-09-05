# API reference

Base URL `http://localhost:8000`, everything under `/api/v1`.

**The OpenAPI schema is the source of truth**, not this file. This explains
the conventions that hold everywhere; the schema has every field.

- Interactive: **http://localhost:8000/docs**
- Raw: **http://localhost:8000/openapi.json**
- Generate a typed client: `npx openapi-typescript http://localhost:8000/openapi.json -o src/api/schema.d.ts`

---

## Auth

`POST /api/v1/auth/login`

```json
{ "email": "admin@paypulse.app", "password": "paypulse" }
```

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsIn...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsIn...",
  "token_type": "bearer",
  "user": {
    "id": 1,
    "email": "admin@paypulse.app",
    "full_name": "Asha Menon",
    "role": "ADMIN",
    "employee_id": 1,
    "is_active": true
  }
}
```

Send the access token on every request:

```
Authorization: Bearer <access_token>
```

| Endpoint | Does |
|---|---|
| `POST /auth/login` | Exchange credentials for a token pair |
| `POST /auth/refresh` | Exchange a refresh token for a new pair |
| `POST /auth/logout` | Revoke **every** session for the user |
| `GET /auth/me` | The current identity |

**A refresh token is rejected as an access token.** They are different things
and mixing them up returns 401. Logout stamps `tokens_valid_from`, which
invalidates every token issued at or before that instant — "log me out
everywhere" is the only sensible meaning for revoking a token that is not
stored anywhere.

---

## Conventions

### Errors

Every failure returns the same envelope:

```json
{ "code": "unauthenticated", "message": "Not authenticated", "field_errors": [] }
```

`field_errors` is populated on validation failures, and each entry names the
field the message belongs to:

```json
{
  "code": "validation_error",
  "message": "Request validation failed",
  "field_errors": [
    { "field": "email", "message": "value is not a valid email address" },
    { "field": "password", "message": "Field required" }
  ]
}
```

Map `code` to a toast once. Bind `field_errors[].field` to your inputs — the
names match what the forms render, so a business rule failure lands on the
right field rather than only in a toast.

| Status | Means |
|---|---|
| 400 / 422 | Validation or a business rule refused it |
| 401 | Missing, expired, or wrong kind of token |
| 403 | Authenticated, but the role does not allow it |
| 404 | Missing **or** out of scope — deliberately indistinguishable |
| 409 | Conflict: duplicate, overlap, or a state that forbids the transition |

### Lists

Every collection returns the same page envelope:

```json
{ "items": [], "total": 39, "page": 1, "pages": 1, "page_size": 50 }
```

`page` and `page_size` are query params. **`page_size` caps at 200** — asking
for more is a 422, not a silent clamp.

### Money

Serialised as **strings**, never floats: `"47500.00"`. Parse them as decimals.
Nothing in this system lets an amount lose paise to binary floating point.

### Dates

ISO `YYYY-MM-DD`. Period filters are `period_start` / `period_end`, inclusive.

---

## Endpoint map

75 operations across 57 paths. Grouped by what they are for:

| Area | Paths |
|---|---|
| **Auth** | `/auth/login` · `/auth/refresh` · `/auth/logout` · `/auth/me` |
| **People** | `/employees` · `/employees/{id}` · `/employees/{id}/summary` · `/departments` · `/job-positions` |
| **Schedules** | `/working-schedules` · `/working-schedules/{id}` |
| **Contracts** | `/contracts` · `/contracts/{id}` · `/contracts/active` · `/contracts/resolve` |
| **Attendance** | `/attendances` · `/attendances/check-in` · `/attendances/check-out` · `/attendances/overview` |
| **Leave** | `/time-off/types` · `/time-off/allocations` · `/time-off/requests` · `/time-off/balances` · `/time-off/summary` (+ approve / refuse / cancel) |
| **Salary config** | `/salary-structures` · `/salary-rules` · `/salary-rules/validate-formula` |
| **Payroll** | `/payruns` · `/payruns/{id}` (+ compute / validate / mark-paid / cancel / reopen / warnings / send-payslips) · `/payruns/eligible-employees` |
| **Payslips** | `/payslips` · `/payslips/{id}` · `/payslips/{id}/pdf` · `/payslips/{id}/total` · `/payslips/{id}/recompute` |
| **Reporting** | `/dashboard` |

Plus `GET /healthz` outside the versioned prefix, and `GET /api/v1/demo/story`,
which is public because the landing page renders signed out.

---

## Things worth knowing before you call it

**Query params that are required.** `/dashboard`, `/attendances/overview`,
`/time-off/summary` and `/contracts/resolve` need `period_start` and
`period_end`; the overview and summary also need `employee_id`. Omitting them
is a 422 that names the field.

**Employee search is `q`,** not `search`. Unknown query params are ignored.

**Preview before you commit.** `POST /payruns/eligible-employees` shows who
*could* be paid for a period, with per-employee blockers
(`ALREADY_PAID_THIS_PERIOD`, `NO_ACTIVE_CONTRACT`) and prorated day counts —
and creates nothing.

**Hour-unit leave.** `POST /time-off/requests` takes `duration_hours` for an
HOURS-unit type, or `half_day` for half of a single day; otherwise duration is
derived from the dates, skipping weekends and holidays. Balances for an HOURS
type are **returned in hours**, though the ledger stores days — see
[ARCHITECTURE.md](ARCHITECTURE.md#leave).

**Scope is invisible.** An `EMPLOYEE` calling `/employees` gets a page
containing only themselves, `total: 1`. Another employee's id returns 404, not
403, so ids cannot be probed.

---

## Rate limiting

Login is rate limited per key on a fixed window, shared across API processes
(`core/ratelimit.py`). Exceeding it returns 429.
