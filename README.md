# PeoplePay360

Integrated HR & Payroll platform — Odoo Hackathon.

Full system design and build plan: **[docs/PRD.md](docs/PRD.md)**

| | |
|---|---|
| Backend | FastAPI · PostgreSQL 16 · SQLAlchemy 2.0 · Alembic — *Aditya* |
| Frontend | React · Vite · TypeScript · shadcn/ui — *Pranav* |

---

## Run it

```bash
cp .env.example .env          # optional; compose has working defaults
docker compose up -d --build
docker compose exec api python -m app.db.seed
```

| Service | URL |
|---|---|
| API + Swagger UI | http://localhost:8000/docs |
| OpenAPI schema | http://localhost:8000/openapi.json |
| Health check | http://localhost:8000/healthz |
| Mail inbox (Mailpit) | http://localhost:8025 |
| Postgres | `localhost:5432` · `peoplepay` / `peoplepay` |

## Demo accounts

All use the password **`paypulse`**.

| Email | Role |
|---|---|
| `admin@paypulse.app` | ADMIN |
| `payroll.manager@paypulse.app` | HR_PAYROLL_MANAGER |
| `payroll.user@paypulse.app` | HR_PAYROLL_USER |
| `hr.manager@paypulse.app` | HR_MANAGER |
| `employee@paypulse.app` | EMPLOYEE |

## For the frontend

The OpenAPI schema is the single source of truth — generate the client, don't
hand-write types:

```bash
npx openapi-typescript http://localhost:8000/openapi.json -o src/api/schema.d.ts
```

Conventions worth knowing before you build against it:

- **Auth** — `POST /api/v1/auth/login` returns `{access_token, refresh_token, user}`.
  Send `Authorization: Bearer <access_token>`. Refresh tokens are rejected as
  access tokens, so don't mix them up.
- **Errors** — every failure returns `{code, message, field_errors[]}`. Map `code`
  to toasts once; `field_errors` is populated on 422 with `{field, message}`.
- **Lists** — every collection returns `{items, total, page, pages, page_size}`.
- **Money** — serialised as strings, not floats.

## Tests

```bash
docker compose exec api pytest -q          # unit tests
python backend/scripts/smoke_auth.py       # end-to-end, needs the stack running
```

## Layout

```
backend/app/
  core/      config · enums · security · rbac · deps · errors
  db/        base · session · seed
  models/    SQLAlchemy ORM
  schemas/   Pydantic — the API contract
  api/v1/    routers
  services/  business logic (from B2 onward)
```

`core/` holds no ORM imports, so the permission matrix and formula sandbox stay
unit-testable without a database.

## Build progress

- [x] **B0** — scaffold, Compose, config, JWT auth, RBAC matrix
- [ ] B1 — Employee, Department, Job Position, Working Schedule
- [ ] B2 — Contract + overlap exclusion constraint + resolver
- [ ] B3 — Attendance
- [ ] B4 — Time Off types, allocations, requests
- [ ] B5 — Formula sandbox + payroll engine
- [ ] B6 — Salary structures & rules
- [ ] B7 — Payrun lifecycle + warnings
- [ ] B8 — Payslip PDF + bulk email
- [ ] B9 — Dashboard aggregation
- [ ] B10 — Full seed data
