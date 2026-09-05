# PAYPULSE

**An integrated HR and payroll platform** — where employee records, contracts,
schedules, attendance and leave feed one payroll engine, instead of sitting in
five tables that never talk.

Built for the Odoo Hackathon brief *"PeoplePay360 HR & Payroll"*, whose whole
complaint is the thing this fixes:

> *"Many basic HR tools store employee details, attendance, leave, and salary
> data as separate records. Real HR and payroll teams need these records to
> work together."*

| | |
|---|---|
| **Backend** | FastAPI · PostgreSQL 16 · SQLAlchemy 2.0 · Alembic — *Aditya* |
| **Frontend** | React · Vite · TypeScript — *Pranav* |
| **Scale** | 20 tables · 57 routes · 75 operations · 449 unit tests · 400 API assertions |

---

## Run it

Three commands, about two minutes, nothing to install but Docker.

```bash
docker compose up -d --build
```

```bash
docker compose exec api python -m app.db.seed
```

Then open **http://localhost:5173** and sign in.

| Service | URL |
|---|---|
| **App** | http://localhost:5173 |
| API docs (Swagger) | http://localhost:8000/docs |
| OpenAPI schema | http://localhost:8000/openapi.json |
| Health check | http://localhost:8000/healthz |
| Mail inbox (Mailpit) | http://localhost:8025 |
| Postgres | `localhost:5432` · `peoplepay` / `peoplepay` |

### Demo accounts

All five use the password **`paypulse`**. Each sees a different product —
the role matrix is enforced in the API, not just hidden in the UI.

| Email | Role | Sees |
|---|---|---|
| `admin@paypulse.app` | ADMIN | Everything |
| `payroll.manager@paypulse.app` | HR_PAYROLL_MANAGER | Payroll, incl. validate and pay |
| `payroll.user@paypulse.app` | HR_PAYROLL_USER | Payroll, without the final approvals |
| `hr.manager@paypulse.app` | HR_MANAGER | People, time and leave — no payroll |
| `employee@paypulse.app` | EMPLOYEE | Only their own record |

---

## What makes it more than CRUD

The brief calls out four hard parts. Each one is a real mechanism here, not a
column:

**Period-based contracts.** An employee holds many contracts over time.
Payroll resolves the one valid for the pay period, prorates across a
mid-period change, and raises `MULTI_CONTRACT_PERIOD` when a period spans two.
Overlapping active contracts are refused.

**Schedule-derived hours.** Weekly hours are computed from a day/start/end/break
pattern — never typed in. A 22:00–06:00 night shift is 7 hours, not −16.

**Leave that actually consumes.** Approving a request decrements the balance,
and approval past zero is **refused** rather than warned about. Durations are
schedule- and holiday-aware: a Fri–Mon request on a five-day week is 2 days,
and 1 if the Monday is a public holiday.

**Ordered salary rules.** Rules evaluate in sequence, and each result is
visible to the next — so `SPECIAL` can reference `BASIC`, `GROSS` can sum two
categories, and `NET` can subtract one from another. Formulas run in a
sandboxed evaluator, not `eval`.

Every payslip reconciles exactly: lines round half-up at line level and the
category totals accumulate already-rounded amounts, so `sum(lines) == net`.

---

## Documentation

| Doc | Read it when |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | You want to know how a payslip gets computed |
| [docs/API.md](docs/API.md) | You are calling the API |
| [docs/RUNBOOK.md](docs/RUNBOOK.md) | You are running, seeding, resetting or demoing it |
| [docs/PRD.md](docs/PRD.md) | You want the full system design and the reasoning |
| [docs/DESIGN-BLUEPRINT.md](docs/DESIGN-BLUEPRINT.md) | You are working on the frontend's visual system |
| [docs/BUILD-PLAN.md](docs/BUILD-PLAN.md) | You want the phase-by-phase build record |

---

## Working on it

```bash
docker compose exec api python -m pytest -q       # 449 unit tests
docker compose exec api python -m ruff check app  # lint
docker compose exec frontend npm run verify       # typecheck + tokens + build
```

The smoke suites talk to a **running** stack over real HTTP — they cover what
a TestClient cannot: real Postgres constraints, real middleware, real status
codes on the wire.

```bash
docker compose exec api python -m scripts.smoke_b5   # payroll, 109 assertions
docker compose exec api python -m scripts.reset_smoke  # clean up after them
```

Run `reset_smoke` between suites. They create throwaway records, and a couple
leave rows on seeded ones that it reclaims.

### For the frontend

The OpenAPI schema is the single source of truth — generate the client, don't
hand-write types:

```bash
npx openapi-typescript http://localhost:8000/openapi.json -o src/api/schema.d.ts
```

Conventions the API keeps everywhere — see [docs/API.md](docs/API.md) for the
detail:

- **Auth** — `POST /api/v1/auth/login` returns `{access_token, refresh_token, user}`.
  Send `Authorization: Bearer <access_token>`. Refresh tokens are rejected as
  access tokens, so don't mix them up.
- **Errors** — every failure returns `{code, message, field_errors[]}`.
- **Lists** — every collection returns `{items, total, page, pages, page_size}`.
- **Money** — serialised as strings, never floats, so nothing loses paise.
