# Runbook

Running, seeding, resetting, demoing and unsticking PayPulse.

---

## Start from nothing

```bash
docker compose up -d --build
```

```bash
docker compose exec api python -m app.db.seed
```

The API's entrypoint waits for Postgres (up to 60s) and runs
`alembic upgrade head` before serving, so the seed is the only manual step.
Confirm it came up:

```bash
curl -s localhost:8000/healthz
```

```json
{"status":"ok","database":"up"}
```

If that says `database: down`, or the API container exited, read
`docker compose logs api` — the entrypoint prints exactly which step failed.

---

## The seed

```bash
docker compose exec api python -m app.db.seed
```

**It is idempotent.** Every row is looked up before it is written, so
re-running tops the data up rather than duplicating it. Run it as often as you
like. It ends with a summary worth reading:

```
  employees          40 (5 with logins, 1 inactive)
  contracts          42 (40 running, incl. a mid-month raise)
  holidays           12 (8 fall on a Mon-Fri working day)
  leave              5 types, 101 allocations, 55 requests
  salary rules       12 in Regular Salary
```

Those counts are live queries, not the length of a fixture list — if a number
looks wrong, the database is wrong, not the log.

### What the seed gives you

- **40 employees** across 3 departments and 3 working schedules (40h standard,
  20h part-time, 35h night shift)
- **6 payruns**, March–August 2026. Five `PAID`, **August left `COMPUTED`** so
  you can walk validate → mark-paid live
- **A mid-period raise** — Sneha Patil's contract changes on **16 July 2026**
- Leave allocations including **12 hours of Compensatory Off for everyone**,
  the only hours-unit type

---

## Reset

**Clear what the smoke suites created:**

```bash
docker compose exec api python -m scripts.reset_smoke
```

This removes throwaway employees, smoke payruns and schedules — plus the two
rows the suites leave on *seeded* records, which deleting the throwaway
employees does not reclaim: b4's cancelled leave request and b3's
check-in/check-out row.

**Start the database over completely:**

```bash
docker compose down -v && docker compose up -d --build
```

```bash
docker compose exec api python -m app.db.seed
```

`-v` destroys the Postgres volume. Everything not in the seed is gone.

---

## Tests

```bash
docker compose exec api python -m pytest -q          # 449 unit tests, ~5s
docker compose exec api python -m ruff check app     # lint
docker compose exec frontend npm run verify          # typecheck + tokens + build
```

### Smoke suites

These talk to a **running** stack over real HTTP, covering what a TestClient
cannot: real Postgres constraints, real middleware, real status codes.

```bash
docker compose exec api python -m scripts.smoke_auth   #  20
docker compose exec api python -m scripts.smoke_b1     #  37  people
docker compose exec api python -m scripts.smoke_b2     #  52  contracts
docker compose exec api python -m scripts.smoke_b25    #  24  holidays
docker compose exec api python -m scripts.smoke_b3     #  67  attendance
docker compose exec api python -m scripts.smoke_b4     #  91  leave
docker compose exec api python -m scripts.smoke_b5     # 109  payroll
```

**Run `reset_smoke` between them.** They create fixtures, and some leave rows
behind by design. Skipping the reset produces failures that look like bugs and
are not — a second `smoke_b3` in the same day fails on `already_checked_out`
if its previous attendance row is still there.

---

## Demo day

**Two things to know before you present.**

**The multi-contract beat is on the July payrun, not August.** Sneha Patil's
raise lands on 16 July 2026, so payrun 5 (July) carries
`MULTI_CONTRACT_PERIOD` and `PRORATED_PERIOD`. Opening August shows only
`MISSING_CHECKOUT` and `MISSING_BANK_DETAILS`.

**August is deliberately mid-lifecycle.** It sits in `COMPUTED`, so you can
run validate → mark-paid live in front of an audience. The five earlier months
are already `PAID` if you want finished examples.

### A demo path that works

1. **Landing page** (signed out, `/`) — a real payslip figure computed from
   the same database and engine the product uses, via `GET /demo/story`.
2. **Sign in as `admin@paypulse.app`** → the dashboard aggregates live.
3. **People → an employee** → their contracts, with the raise visible as two
   bands on the timeline.
4. **Leave → Balances** → Compensatory Off reads in **hours**; request some
   and watch the balance move. Ask for more than is left and approval is
   refused, not warned.
5. **Payroll → August 2026** → compute, validate, mark paid. Warnings gate
   each step.
6. **A payslip → PDF** → a real rendered document, and
   `POST /payruns/{id}/send-payslips` puts real mail in **Mailpit**
   (http://localhost:8025).
7. **Sign in as `employee@paypulse.app`** → the same product, scoped to one
   person. Payroll is 403, and other employees' records are 404.

---

## Troubleshooting

**`docker compose up` and the API restarts in a loop.**
Read its logs: `docker compose logs api --tail 50`. Almost always a migration
that could not apply against an existing volume. `docker compose down -v` and
re-seed.

**The frontend loads but every request 401s.**
The access token expired and the refresh failed. Sign out and back in. Seeing
a few 401s in the console *followed by a 200* is normal — that is the refresh
interceptor working.

**A smoke suite fails on "already exists" or "already checked out".**
Fixture residue. `docker compose exec api python -m scripts.reset_smoke`.

**Payslip PDF is empty or 500s.**
The PDF renders through WeasyPrint inside the API container. Check
`docker compose logs api` — it will name the missing font or asset.

**No mail in Mailpit.**
Mail only appears after `POST /payruns/{payrun_id}/send-payslips`. The payrun
must be `VALIDATED` or `PAID` — earlier states are a 409.

**Numbers on the landing page changed unexpectedly.**
`GET /demo/story` reads a real payslip. If smoke payruns are in the database
it may pick a different one — run `reset_smoke`.

---

## Ports

| Port | Service |
|---|---|
| 5173 | Frontend (Vite) |
| 8000 | API |
| 5432 | Postgres |
| 8025 | Mailpit web UI |
| 1025 | Mailpit SMTP |

Something else already on one of them is the most common first-run failure.
`docker compose ps` shows what actually bound.

---

## Database access

```bash
docker compose exec db psql -U peoplepay -d peoplepay360
```

The compose project, database name and user stay `peoplepay360` on purpose —
they are invisible to a demo, and renaming them would orphan the existing
volume.
