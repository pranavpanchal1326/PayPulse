# PAYPULSE — Frontend Build Plan

**Phased delivery · 16 phases in 5 stages**
Companion to [DESIGN-BLUEPRINT.md](DESIGN-BLUEPRINT.md) (how it looks and feels)
and [PRD.md](PRD.md) (what it does).

> **How to use this document.** One phase at a time, in order. A phase is not
> started until the previous phase's exit criteria are all checked. No phase is
> "mostly done" — it is done or it is current.

---

## The shape of it

```
STAGE I · FOUNDATION        P0  Material proof
                            P1  Primitives
                                └── the system exists

STAGE II · SPINE            P2  API + Auth + Shell        ← first real backend data
                            P3  Contract & fixtures
                            P4  Signature systems
                                └── the product has a skeleton

STAGE III · PRODUCT         P5  People
                            P6  Contracts & schedules
                            P7  Attendance
                            P8  Time off
                            P9  Payroll configuration
                            P10 The payrun cockpit        ← the set piece
                            P11 Payslip & PDF
                            P12 Dashboard
                                └── the application is complete

STAGE IV · STORY            P13 Landing page + 3D
                                └── built FROM the system, never alongside it

STAGE V · FINISH            P14 Hardening
                            P15 Demo readiness
```

**Dependency rule:** everything in Stage III depends on all of Stage II.
Nothing in Stage III depends on anything else in Stage III — the feature phases
are independently shippable and their order is chosen for demo value, not
technical necessity.

---

## Working agreements

These hold for every phase.

1. **The blueprint is binding.** A hex code, px value, or shadow written inline
   in a component is a defect. Everything comes from `tokens.css`.
2. **Every phase ends with a review** against [DESIGN-BLUEPRINT.md §21](DESIGN-BLUEPRINT.md).
   The checklist is run honestly; a failed item blocks the exit.
3. **Build the state matrix, not the happy path.** Every screen ships with
   loading, empty, filtered-empty, error, and permission-denied — or it is not
   done.
4. **Keyboard and dark mode are not a later phase.** They are part of each
   component's definition of done. Retrofitting either is three times the work.
5. **Never fake data that the backend already provides.** Fixtures are a
   scaffold with an explicit removal date, tracked in §Backend dependency below.
6. **One primary action per view.** If a screen has two, the design is wrong.

---

## Backend dependency map

The backend is at **B0** — only `/auth` exists. Frontend phases run ahead of it
on typed fixtures, then swap. This table is the swap schedule.

| Frontend phase | Needs backend | Status today | Strategy |
|---|---|---|---|
| P2 Auth + Shell | `/auth` (B0) | ✅ shipped | **Real API from day one** |
| P5 People | B1 | not built | **On fixtures.** Every call goes through `features/people/api.ts`; that file is the whole swap. |
| P6 Contracts & schedules | B1, B2, B2.5 | not built | Fixtures → swap |
| P7 Attendance | B3 | not built | Fixtures → swap |
| P8 Time off | B4 | not built | Fixtures → swap |
| P9 Payroll config | B5, B6 | not built | Fixtures → swap |
| P10 Payrun | B7 | not built | Fixtures → swap |
| P11 Payslip & PDF | B8 | not built | Fixtures → swap |
| P12 Dashboard | B9 | not built | Fixtures → swap |

**The swap is a phase task, not a separate project.** Each feature phase has
"replace fixture with generated client" in its exit criteria, conditional on
that backend block existing. If it does not exist yet, the phase exits on
fixtures and a tracked TODO carries the swap forward.

---

# STAGE I · FOUNDATION

The riskiest assumption in this project is that clay actually feels right at
production density. Stage I answers that before anything is built on top of it.

---

## P0 · Material proof

**Goal.** Prove the material. One button, one well, one figure — in both
themes, with grain — that genuinely feels like the object we described.

**Size** M · **Depends on** nothing

### Deliverables

```
frontend/
├── package.json · vite.config.ts · tsconfig.json · tailwind.config.ts
├── Dockerfile                       ← uncomment the compose service
└── src/
    ├── styles/
    │   ├── tokens.css               every value from the blueprint
    │   ├── clay.css                 --clay-1..4, --inset-1..3, states
    │   └── grain.svg
    ├── fonts/                       4 families, woff2, subset latin + ₹
    └── proving-ground.tsx           a single route: /proving-ground
```

### The proving ground

One page, not shipped to production, that shows: the three elevation states
side by side · a button through rest/hover/active/focus/disabled · an inset
well holding a table fragment · the four families at their real sizes · the
full palette · a `num-hero` figure · the light model demonstrated on a single
shape. Toggle for light/dark and grain on/off.

This page is how we judge the material, and it stays in the repo as the visual
regression reference.

### Exit criteria

- [x] Every token from the blueprint exists in `tokens.css`; nothing is invented
- [x] The press interaction swaps highlight and shade and descends 2px
- [x] Hover grows, softens, and moves the shadow down-right — it does not just scale
- [x] Dark mode is complete — every token has a dark value and nothing is hardcoded
- [x] Typecheck and production build are clean · 4.95 kB CSS, 50.6 kB JS gzipped
- [x] **All 56 text/ground pairings clear 4.5:1 in both themes** (measured, not assumed)
- [~] `docker compose up` — the service is wired and `docker compose config` validates; the image build itself is unrun
- [ ] Grain reads as material rather than noise — *needs a human eye at 100% zoom*
- [x] All four typefaces self-hosted — closed in P1 via `@fontsource`; no CDN dependency remains
- [ ] **The judgement call: does this feel like an object?** — *open; this is the user's call and it gates the phase*

---

## P1 · Primitives

**Goal.** Build the system once. Everything after this is composition.

**Size** L · **Depends on** P0

### Deliverables

```
src/components/system/
  Button · IconButton · Field · Select · DateRangePicker
  Table (TanStack) · Badge · StateChip · Card · Well
  Drawer · Modal · Toast · Tooltip · Menu
  EmptyState · WarningCard · SkeletonRow · Meter · SegmentedControl
src/motion/springs.ts · variants.ts
src/sound/sprite.ts · useSound.ts
src/components/gallery.tsx          ← /gallery, every primitive × every state
```

### Notes

- `Table` is the most important component in the product — the app is mostly
  tables. Build it against 500 fixture rows from the start, with the density
  switch (36/44/52px) working.
- Rows stay **flat** inside the well. The well carries elevation. This is both
  the material principle (P2) and the performance requirement — it is not a
  compromise, and it must not be "improved" later.
- Sound engine ships muted with the toggle wired, even though the sound map is
  not fully populated until P10.

### Exit criteria

- [x] `/gallery` shows every primitive in rest / hover / active / focus / disabled / loading / error
- [x] Every primitive works keyboard-only — 83 controls, 0 unreachable; `focus-visible` declared on all 7 interactive selectors as 2px cobalt outside the clay
- [x] All 30 icon-only controls carry an accessible name
- [x] Every primitive repaints in dark mode (verified by reading resolved custom properties, not transitioned values)
- [x] `prefers-reduced-motion` covers every animated selector; `MotionConfig reducedMotion="user"` collapses every spring globally
- [x] Table holds 500 rows — DOM stays capped at **14 rows**, 0.39ms per scroll+layout
- [x] Zero inline hex/px/shadow in any component (`npm run check:tokens`, enforced in `npm run verify`)
- [x] Semantics: real `<table>` with a caption, all 8 fields label-associated, errors announced with `role="alert"`
- [x] **Self-hosted typefaces — the item deferred from P0 is closed**

### P1 · Findings

**1. TanStack Table v9 was installed and has a different API.** `npm i
@tanstack/react-table` resolved to a v9 pre-release (`createCoreRowModel`, no
`useReactTable`). Pinned to `^8.21.3`. Worth knowing before any other TanStack
package is added.

**2. The token-discipline check found two violations in my own code** —
a raw `fontSize: 15` and a raw `#fff` in the proving ground. That is the
argument for the rule: the discipline fails silently without enforcement.
`scripts/check-tokens.mjs` now runs in `npm run verify`. Geometry
(width/height/position) is exempt; spacing, radius, type, colour and shadow
are not.

**3. Font budget exceeded.** Blueprint §19 assumed ~92kb for four families.
Self-hosted reality is **~123kb on first paint** (Bricolage latin 77kb + Geist
latin 29kb + Geist latin-ext 17kb, the last carrying `₹`), rising to ~220kb if
every subset loads. Bricolage's variable optical-size axis is the cost.
Deferred to P14 with a known fix: subset the display face to the glyph set it
actually renders, which is headline text only.

**4. Deviation: sound is synthesised, not sampled.** §08.1 budgets a 40kb
sprite. Every sound in the map is a click, thunk, tick or short tonal figure,
all of which synthesise cleanly in Web Audio — at **zero bytes**, and with the
landing pitch of a rule block parameterised by its depth in the stack, which a
fixed sprite could not do. Budget 40kb → 0.

**5. Measurement note for later phases.** A hidden browser pane pauses CSS
transitions and `requestAnimationFrame`. Any theme or motion assertion read
straight after a state change will report the *mid-transition* value and look
like a bug. Read resolved custom properties instead — they are not
transitioned.

---

# STAGE II · SPINE

---

## P2 · API, auth and the shell

**Goal.** The application frame, running on **real backend data**. This is the
one phase in Stage II–III where the API genuinely exists today.

**Size** L · **Depends on** P1 · **Backend** `/auth` ✅

### Deliverables

```
src/api/client.ts             fetch wrapper, Bearer, refresh-on-401 queue
src/api/errors.ts             {code, message, field_errors} → toast / field map
src/api/money.ts              decimal handling — NEVER parseFloat
src/auth/                     context, storage, guards, role gating
src/app/Shell.tsx             sidebar · topbar · breadcrumbs · page header
src/app/CommandMenu.tsx       ⌘K — Go to / Do / Ask
src/app/Pulse.tsx
src/routes/                   route tree, role-gated
src/features/auth/Login.tsx   S1
```

### Decisions this phase locks

| Decision | Recommendation |
|---|---|
| Token storage | Access token in memory; refresh token in `localStorage`. Survives reload, and the access token is never at rest. |
| Refresh strategy | Single-flight refresh queue on 401 — concurrent requests wait on one refresh, then replay. Never a refresh storm. |
| Money type | A `Money` type wrapping the API's decimal **string**. `parseFloat` on money is a lint error. |
| Role gating | Route-level guard + a `usePermission()` hook mirroring `core/rbac.py`. The matrix lives in one file and matches the backend's exactly. |

### Exit criteria

- [x] All five seeded roles log in against the **real API** (backend smoke test: 20/20)
- [x] Navigation gated correctly per role — ADMIN/payroll roles 6 items, **HR_MANAGER 4**, **EMPLOYEE 3** (Me · Time · Leave)
- [x] Route guards refuse readably: EMPLOYEE at `/payroll` gets "Not available to your role", no payroll UI leaks
- [x] **Six concurrent requests against an expired token produce exactly one refresh**, and all six replay successfully
- [x] A refresh token used as an access token is rejected (401) and handled
- [x] Invalid credentials render the envelope's own message; unknown-user and wrong-password are byte-identical, so the form cannot enumerate accounts
- [x] 422 populates `field_errors` onto the field, never a toast
- [x] `⌘K` opens, detects Ask-intent, routes to provenance, closes on Escape, returns focus to the trigger
- [x] The pulse beats, and its rate is derived from days remaining in the period
- [x] **The access token is never at rest** — storage holds only `paypulse.theme` and `paypulse.refresh`
- [x] Session survives reload: boot re-mints an access token from the refresh token alone
- [x] Typecheck, token discipline and build clean · 8.95 kB CSS, **162 kB JS gzipped** (budget 220 kB)

### P2 · Findings

**1. Port 8000 and 5432 were both already taken** by another Docker project on
this machine that auto-starts with Docker Desktop. Rather than stop someone
else's containers, the API host port is now configurable the way the Postgres
one already was:

```
API_PORT_HOST=8100        # docker-compose.yml, .env.example
POSTGRES_PORT_HOST=5433
```

Worth keeping regardless — 8000 is a popular default and collides often.

**2. A real bug in the refresh queue, found by measurement.** Six concurrent
requests against an expired token produced **three** refreshes, not one.

The single-flight lock was correct but insufficient: concurrent requests reach
their 401s in *waves*. Wave one refreshes and releases the lock; wave two —
already in flight with the old token — then 401s and refreshes again. Each
refresh rotates the token, so the later ones can invalidate the earlier.

Fixed with a **token generation counter**. A request records the generation it
was sent with; on a 401 it refreshes only if nobody has already done so, and
otherwise just replays. Now measured at exactly one refresh for six requests.

**3. A spec conflict between the PRD and the backend.** [PRD.md §6.1(a)](PRD.md)
resolves that `HR_MANAGER` should get the dashboard with money fields
stripped, so the role has a landing screen. But `backend/app/core/rbac.py`
does not grant it, and `backend/tests/test_rbac.py::test_no_payroll_features`
**actively asserts** that HR_MANAGER has no dashboard access.

The backend and its tests are self-consistent; PRD §6.1(a) is unimplemented.
`src/auth/rbac.ts` mirrors the **backend**, because the backend is the
enforcer — so today HR_MANAGER gets a 4-item nav and lands on People.
**Aditya needs to decide which is right**, and either grant the dashboard in
`rbac.py` or amend §6.1(a).

**4. `requestAnimationFrame` is a fragile place to put focus.** The command
menu focused its input inside a rAF, which never fires in a background tab —
so the menu could open unfocused, which is unusable from the keyboard. Now
focuses synchronously with a timeout fallback.

---

## P3 · Contract and fixtures

**Goal.** Unblock every remaining phase. Types and realistic data for
everything the backend has not built yet.

**Size** M · **Depends on** P2

### Deliverables

```
src/api/schema.d.ts           generated from /openapi.json (auth only, today)
src/api/contract.ts           hand-written types for B1–B9, from PRD §5
src/mocks/                    MSW handlers for every PRD §5 endpoint
src/mocks/seed/               fixture data mirroring PRD §9
docs/api-contract.md          the change log PRD §8.1 requires — create it
```

### The fixtures must include the edge cases, or the UI never gets designed for them

Straight from [PRD.md §9](PRD.md) — every item exists to make a specific
behaviour visible:

- 30 employees, **3 with missing bank details**, **1 joiner** and **1 leaver** mid-period
- 3 schedules including a **night shift crossing midnight**
- **One employee with an adjacent contract pair** (a raise on the 16th) → `MULTI_CONTRACT_PERIOD`
- ~3,000 attendance rows with late arrivals, missing check-outs, overtime and **deliberate gaps**
- 14 public holidays, at least one inside a seeded leave request
- **6 historical payruns** so the trend chart is never empty
- One payrun with an open `ERROR` warning, so the blocked state is designable

### Exit criteria

- [x] Every PRD §5 endpoint has a typed handler and returns the correct envelope shape — **66 handlers**, checked by `__mocks.selftest()`
- [x] Lists return `{items, total, page, pages, page_size}`; errors return `{code, message, field_errors}` — both built in `mocks/http.ts` and nowhere else
- [x] Money is a **string** in every fixture, matching the real API — asserted at load, and re-asserted against live responses by the self-test
- [x] `docs/api-contract.md` exists with an initial entry — including eight decisions the backend has to match or push back on
- [x] Fixture data reproduces all edge cases above
- [x] A single flag switches the whole app between MSW and the live API — `VITE_API_MODE`, defaulting to `mock` in dev and `live` in a production build
- [x] **The mock enforces the role matrix**, so an `EMPLOYEE` sees one employee and no payslips, and `HR_MANAGER` gets a 403 on `/payruns`
- [x] Typecheck, token discipline and build clean · **162.50 kB JS gzipped, unchanged** — the fixtures are a dynamic import that a `live` build drops entirely

### P3 · Findings

**1. `compute` was not idempotent, and only the self-test noticed.** PRD §5
marks `POST /payruns/{id}/compute` idempotent. The state table said
`COMPUTED → {VALIDATED, DRAFT, CANCELLED}`, so the second press of the
cockpit's most-used button was a 422. Nothing about reading the code suggested
it: the transition table looked complete, and the omission is only visible if
you actually press the button twice. `COMPUTED → COMPUTED` is now in the table
with a comment saying why.

This is the argument for `src/mocks/selftest.ts` existing at all. It runs the
handlers through MSW's own `handler.run()` — no service worker, no test runner,
82 checks in 0.4 s — and it checks the *claims*: every list is a `Page`, every
failure is an envelope, money is a two-decimal string everywhere, step 1 of the
wizard creates nothing, the seeded `ERROR` blocks validate, the payslip PDF is
a PDF. `window.__mocks.selftest()`.

**2. The formula sandbox is a parser, not an evaluator.** `validate-formula`
takes text from a field and has to say what it would produce. `new Function` is
four lines and wrong: a text field that reaches a JavaScript compiler is an XSS
hole with extra steps, and "it only runs against fixtures" is not a reason to
write the dangerous version and then have to remember which version this was.
`mocks/formula.ts` is a small recursive-descent parser over exactly the grammar
§4.5's twelve rules are written in — arithmetic, comparisons,
`min`/`max`/`round`/`abs`, and Python's `A if C else B`. An unknown identifier
is reported **by name**, which turns a typo from a silent zero on somebody's
payslip into a message under the field.

**3. Fixtures are frozen; handlers must not be.** `seed/` is generated once and
has to stay byte-identical (§9) — a payslip screenshotted in P11 must still be
that payslip in P15. But `compute` is a live endpoint: approve a leave request,
press Compute, and the number has to move. The engine's inputs are now a
parameter (`PayrollSources`) rather than a module-level import, defaulting to
the seed and passed `db` by the handlers. Same arithmetic, current inputs.

**4. The service worker could not be verified in this session.** Registration
fails in the embedded browser pane — `An unknown error occurred when fetching
the script`, with the script itself served fine at 200. It is an environment
limitation, not a code path: the handlers are verified by the self-test, which
never touches the worker. **Confirm it in a real browser** at
`http://localhost:5173` — the console should print `[mocks] serving the PRD §5
API from fixtures`. A failed registration no longer blanks the page; it logs
what to do and boots anyway.

**5. `VITE_API_MODE` is binary on purpose.** The tempting version is
per-endpoint — auth live, everything else mocked — and it is the one that rots
into two half-configurations where the thing that breaks on stage is the seam.
Both modes serve the same five accounts with the same password, so switching
changes what the data *is*, never how the app behaves. That is why the mock has
auth handlers at all.

---

## P4 · Signature systems

**Goal.** Build the four things people remember, before any screen consumes
them.

**Size** XL · **Depends on** P3

### Deliverables

```
src/components/signature/
  Line.tsx                THE LINE — track, bead, bands, ticks, gaps, boundaries
  Line.scrub.ts           drag to scrub; page recomputes
  Stack.svg.tsx           THE STACK — flat SVG, used inside the app
  RollingNumber.tsx       odometer digits, aria-live, colour flash
  ProvenanceDrawer.tsx    "why this number?" — the derivation tree
  PayslipCard.tsx         the flip card
```

### Notes

- **`RollingNumber` is used everywhere from here on.** Every money figure in
  every later phase goes through it. Build it well: per-digit stagger from the
  right, only changed digits move, `aria-live="polite"` announcing the final
  value only.
- **`ProvenanceDrawer` is the product's core promise as a component.** It takes
  a figure and a derivation tree and renders it. Every later phase wires its
  numbers into it.
- The 3D version of `Stack` is **not** built here — that is P13. Inside the
  app, the stack is flat SVG with identical proportions.

### Exit criteria

- [x] THE LINE renders contracts, attendance ticks, leave gaps, holidays, overtime and period boundaries from fixture data
- [x] Scrubbing the bead recomputes every figure on the page, with no easing on the drag — measured: three `shift+←` moved 2026-08-15 → 2026-07-25 and net went ₹38,910.06 → ₹61,773.52, through `computePayslip`
- [x] THE STACK sizes each block proportionally to its real amount; deductions carve rather than stack — measured: every additive block resolves to the same 0.00772 px per rupee
- [x] `RollingNumber` rolls only changed digits, flashes directionally, and announces once to screen readers
- [x] `ProvenanceDrawer` walks `NET → GROSS → BASIC → contract` and each leaf links to a source record — `LWP` ends at *"leave request #2 · approved by Priya Nair"*, the blueprint's own example
- [x] The payslip card flips with its shadow tracking the rotation — **built, not verified running.** See finding 3
- [x] All four work keyboard-only — bead is a `role="slider"` driven by arrows, shift, Page and Home/End; stack blocks and provenance rows are focusable and Enter-operable. **Reduced motion is coded per §07.5 and unverified.** See finding 3
- [x] Typecheck, token discipline and build clean · **163.50 kB JS gzipped**, +0.4 kB — the showcase and its fixtures are a separate lazy chunk

### P4 · Findings

**1. A number that announces correctly and shows the wrong digits.** The
odometer compares each digit against the previous value to decide what moves.
The obvious way to hold that "previous" is a ref updated in a layout effect —
and it is wrong, in a way that reads as correct until you watch it: the colour
flash is React state, so it re-renders the component milliseconds after the
value moved, and on *that* render the previous value is already the current
one. Every digit reports itself unchanged, mid-roll. The screen reader
announced ₹47,843 while the display still read ₹47,842.

The fix is to treat "which digits changed" as a property of **the value**, not
of the render: the comparison runs only when the value actually differs from
the one the refs describe, and the answer is kept until it changes again.

Worth remembering for the rest of Stage III: any component that renders
differently based on *what changed* has this bug latent in it, because an
unrelated `setState` is enough to erase the difference.

**2. The tower must not draw what did not happen.** `TDS` is ₹0.00 below the
tax threshold. It is a real line and a payslip should print it — but the stack
was carving a four-pixel notch for it, because sub-pixel blocks are clamped to
a minimum height so they stay clickable. A notch for nothing removed is the
picture disagreeing with the arithmetic, which is the one thing this drawing
exists not to do. Zero-amount rules are now excluded from the drawing and
remain on the payslip and in the provenance tree.

**3. Animation could not be verified in this session, and it is not a code
problem.** The embedded browser pane runs with `document.hidden === true`:
`requestAnimationFrame` fired **zero** times in 800 ms. Motion drives every
animation in this product off rAF, so nothing moves there — the drawer sits at
`translateX(100%)`, the card does not turn, the blocks do not land. That is the
pane, not the components; it also predates P4, since the drawer is a P1
primitive.

Two things follow. First, **the four systems still need a pass in a real
browser** — open `/dev/signature`, flip the card and watch the shadow narrow as
it turns, then run it again with reduced motion on. Second, and more
importantly: a stalled frame loop makes an animation library look broken in
ways that invite fixing the wrong thing. Two comments in this phase's code
initially recorded phantom "measurements" from that stalled loop and have been
corrected. **Do not conclude anything about motion from a hidden pane.**

**4. The line needs a zoom, and that is a product finding rather than a demo
one.** Over seven months a day is three pixels, every tick abuts its
neighbours, and a leave gap is invisible — the thing the line exists to show.
Over one period each day is its own mark and the gap is unmistakable. Both
windows are real: the payrun header wants the wide view and an employee page
wants the narrow one, so the component takes its window as data and the
showcase offers all three. Any screen adopting THE LINE has to make that choice
deliberately.

**5. Overtime is an extra mark, not a different colour.** The first pass drew
an overtime day as an orange tick *instead of* its day tick, which quietly made
the line show fewer worked days than the payslip counted. It now draws both:
the day below the track, the excess above it.

---

# STAGE III · PRODUCT

Eight independent phases. Each is a vertical slice: screens, states, wiring,
and the fixture-to-API swap.

**Every Stage III phase ships with the full state matrix** — loading, empty,
filtered-empty, error, permission-denied — and a role pass confirming each role
sees the right thing.

---

## P5 · People

**Screens** S2 Employees (Kanban + List) · S3 Employee · departments · job positions
**Size** L · **Backend** B1

The employee page is the operational hub and the first place THE LINE appears
in the product. Four inset summary wells — `CONTRACT · TIME · LEAVE · PAYROLL`
— fed by a single `/employees/{id}/summary` call, not five round trips.

- [x] Kanban and List both work off one data source with a shared filter state
- [x] Employee page fills from one summary call
- [x] THE LINE renders the employee's real history
- [x] Smart-button counts show `0` on a new record, never hidden
- [x] IFSC, exit-before-joining, and duplicate-email validations render on the field
- [x] `?scope=my_team` works for `HR_MANAGER`

**Carried forward.** THE LINE draws no holiday ticks: the API exposes no
`/public-holidays` endpoint as of B0, and inventing a calendar client-side
would put marks on the line that no row backs. Fills in with B3 (P7).

## P6 · Contracts and schedules

**Screens** S4 Contracts · S5 Working schedule editor
**Size** M · **Backend** B1, B2, B2.5

S5 is the best pure-material screen in the app: seven inset day-wells, each
holding a raised block whose **width is its hours**, with `hours_per_week`
rolling beside it — visibly derived, never typed.

- [x] The active contract is unmistakable in the list — a cobalt left marker, a lifted row ground and a `TODAY` badge, resolved by §4.3 step 1 rather than by reading `state`
- [x] A DB overlap rejection renders as a warning card naming the contract it collides with, and stays on screen while the dates are corrected
- [x] `hours_per_week` is read-only and rolls on every edit — 37.50 for the night schedule, computed client-side for the preview and recomputed server-side on save
- [x] A midnight-crossing schedule is entered without confusion — `end < start` is not an error, the field says *"ends the next morning"*, and the block turns cobalt
- [x] Two lines on one day are **structurally impossible** (the model is one shift per weekday) and `end == start` is refused on the field with the reason
- [x] Typecheck, token discipline and build clean

### P6 · Findings

**1. Two screens disagreed about the same derived number.** The schedule card
rendered `hours_per_week` through `RollingCount`, which rounds, so a 37.5-hour
week read as **38** on the card and **37.50** in the editor two clicks later.
Both were "correct"; together they were a product that cannot count. Hours are
a decimal quantity and now go through the decimal renderer everywhere.

Worth generalising: `RollingCount` exists for headcounts and payslip counts —
things that genuinely are integers. Every other quantity in this product
(days, hours, balances) is a `NUMERIC(5,2)` and must not go through it.

**2. There is no `GET /contracts/{id}`.** PRD §5 lists
`GET|POST|PATCH /contracts` and `/contracts/active`, and nothing else — so
`/contracts/:id`, which `provenance.ts` already links to from every `BASIC`
line, is resolved by finding the row in the list this screen has already
loaded. It works, and it fails honestly (*"that contract is not here"*), but a
deep link to a contract outside the current filter cannot resolve. Proposed as
an addition in `api-contract.md`.

## P7 · Attendance

**Screens** S6 Attendance · S7 Correction dialog
**Size** M · **Backend** B3

- [x] Dense 36px rows hold the month's records — 518 rows for August 2026 through P1's virtualised `Table`, with the same DOM cap
- [x] Missing check-out is visible at a glance and explains its payroll consequence — a vermilion count in the header, a proportional mark on the strip, a chip on the row, and a tooltip saying it pays zero hours for a day that was attended
- [x] The correction dialog is a modal, requires a reason of at least eight characters, and shows before/after with **only the values that moved** in orange
- [x] Manual edits are permanently marked, and the badge carries the reason
- [x] `EMPLOYEE` can create but not edit — that role sees Check in / Check out and **no correction control at all**, not a disabled one; verified signed in as `employee@peoplepay360.com`
- [x] Typecheck, token discipline and build clean

### P7 · Findings

**1. The month strip's first version was a wall of red, and the rule that made
it was borrowed from the right place.** THE LINE colours a day by its worst
status, which is correct — the line draws **one employee**. Applied to
twenty-nine, every working day had somebody late or somebody with an open
punch, so every working day was vermilion. A strip where every day is an alarm
is a strip nobody reads, and it was arithmetically correct the whole time.

The fill now says only "this day has rows"; a bar along the bottom edge shows
what **share** of them have a problem. One late arrival out of twenty-nine is
a sliver; a broken day is a full bar. Same principle as the balance meter and
the stack — the shape is the data — and the general lesson is that a
per-record visual language does not survive aggregation unchanged.

**2. The screen opened on a month with no data in it.** `ANCHOR_TODAY` is
5 September and attendance ends on 31 August, because payroll runs in arrears.
Defaulting the month picker to the calendar month produced a correct, empty
register on first load — indistinguishable from a broken screen. It opens on
`OPEN_PERIOD` now. The dashboard had the same bug for the same reason and took
the same fix: **any screen with a period picker must default to a period the
fixtures actually cover.**

**3. The `/public-holidays` gap carried forward from P5 is still open**, and it
is a contract question rather than a missing screen. PRD §5 cut `/holidays`
CRUD — *"holidays are seed-only"* — and offers no read endpoint either, so
THE LINE and the month strip still draw no holiday marks. Inventing a calendar
client-side would put marks on the line that no row backs, which §10.1 exists
to forbid. Proposed as a read-only endpoint in `api-contract.md`.

## P8 · Time off

**Screens** S8 Requests · S9 Allocations · S10 Types · S11 Balances
**Size** L · **Backend** B4

The balance meter warns **before** the user files a request that would be
refused — the PRD is explicit that over-balance blocks, so the UI must not walk
someone into a wall.

- [x] The meter is proportional and its remaining segment flips to orange under 2 days — **before** a request is filed rather than after it is refused
- [x] Approving a request rolls the balance down: in the drawer's meter beside the decision, and in the header figure when the queue is scoped to one person
- [x] A request whose working days differ from its calendar span displays both (`5 of 7`), in orange, with the reason on hover — §3.6's schedule- and holiday-aware duration made visible instead of surprising
- [x] Over-balance approval renders the API's own sentence — who is short, and by how much — as a warning card that stays until it is dealt with
- [x] Cancelling an approved request inside a **paid** period is refused with the month named. *That rule had no handler behind it* — see finding 1
- [x] Typecheck, token discipline and build clean

### P8 · Findings

**1. A PRD rule with no handler behind it.** §3.6's cancellation table has
three rows; the mock implemented two. `APPROVED` inside a period that is
already `PAID` must be refused (409), because paid payroll is immutable
(§4.8) — and the handler cancelled it happily. Nothing in P3 caught it: the
self-test checks envelope shapes and money formats, not whether every row of
every table in the PRD has code behind it.

The handler now looks for a `PAID` payslip overlapping the request's dates and
refuses by name. Worth saying plainly: **fixtures being complete does not mean
the rules are.**

**2. The four-segment meter is a three-segment meter.** §S11 names four —
allocated / taken / pending / remaining — but `allocated` is the *total*, and
drawing it beside its own parts would double the bar and make the picture
disagree with the arithmetic (P4's finding 2, in a different component). The
meter draws taken, pending and remaining; `allocated` is the legend's first
row and the figure they sum to. The blueprint's intent survives; its
arithmetic does not.

**3. The client never computes a leave duration.** It is tempting — the dates
are right there — and it would be wrong in the way that matters: the client
holds neither the employee's schedule nor the holiday calendar, so its number
would disagree with the one the server writes down. The form shows the
**calendar** span, says plainly that the working-day count comes back from the
server, and the row shows both once it does.

## P9 · Payroll configuration

**Screens** S12 Structures · S13 Rules
**Size** L · **Backend** B5, B6

S13 is a split view with drag-to-reorder keys on the left and a live STACK
preview on the right that re-renders as you type.

- [x] Dragging lifts the key to `--clay-4` and the others drop to 62% to make room
- [x] Reorder is fully keyboard-accessible — space grabs, arrows move, Home/End send to the ends, Escape returns it, and a polite live region announces *"HRA moved to position 2 of 12"* rather than "moved"
- [x] `Validate formula` shows the sandbox's **amount** against the API's own sample context, with the context printed beside it — a green tick would only have answered "does it parse?"
- [x] A sandbox rejection names the offending token, because `mocks/formula.ts` reports an unknown identifier by name
- [x] A forward reference highlights in **both** panes simultaneously — a vermilion ring on the key plus the sentence under it, and a `RULE_FORWARD_REFERENCE` card in the editor
- [x] Editing HRA 40%→50% visibly changes the STACK preview before saving — measured: the `HRA` block grew ₹12,000 → ₹15,000 and `SPECIAL` shrank by the same amount, leaving `GROSS` at 61,687.14, which is the balancing rule doing its job
- [x] Typecheck, token discipline and build clean

### P9 · Findings

**1. The live preview cannot evaluate anything, and that shaped the whole
design.** §12 S13 asks for a STACK that re-renders as you type, against a rule
set that does not exist on the server yet. The obvious implementation is a
small expression evaluator in the client — and P3 already recorded why that is
not an option: a text field that reaches a JavaScript compiler is an XSS hole
with extra steps, and a second evaluator is a second definition of how pay is
computed.

So `preview.ts` walks the rules in sequence and sends every `FORMULA` and every
`EXPRESSION` condition to `/salary-rules/validate-formula`, carrying the
context built from the rules before it. Only `FIXED` and `PERCENTAGE` are
computed locally, and neither reads a character of user-written expression.

The cost is real: each rule depends on the one before it, so the calls cannot
be parallelised, and twelve rules is about a second against the fixtures. It
is debounced at 400ms, identical work is cached, and **the previous tower
stays on screen while the next is computed** rather than blanking — a flash
per keystroke would be worse than a second of slightly older truth.

**2. Forward references are found by reading the text, not by evaluating it.**
§4.4 makes reading a later rule a silent zero rather than a failure, which is
the defect most likely to reach a payslip unnoticed — and the sandbox cannot
report it, because to the sandbox an unknown `rules.X` is just a missing
identifier. `findForwardReferences` compares each reference against the
sequence it resolves at, including category references (`categories.ALLOWANCE`
read by a rule that sits before the last `ALLOWANCE`), and marks both panes at
once. The fix for it is a *reorder*, which lives in the other pane — marking
only one would leave the reader holding half a sentence.

**3. `GROSS` and `NET` publish a result and contribute nothing.** They are
totals of other rules, so adding them to their own category doubles the tower.
This is the same class of error as P4's TDS notch: the drawing must not
disagree with the arithmetic. Both the preview and the payslip's own stack
exclude them.

## P10 · The payrun cockpit — the dark room

**Screens** S14 Wizard step 1 · S15 Step 2 · S16 Processing
**Size** XL · **Backend** B7

The set piece, and the phase where sound design is completed.

- [x] `data-room="dark"` applies across all three — set on `<html>` so the shell comes with it, declared as the **same ramp** as global dark mode in `tokens.css` rather than a second palette, and always removed on the way out
- [x] Step 1 states `COMPUTED · NOT PERSISTED` in the interface, and creates nothing — the endpoint is stateless, so the criteria can be changed as often as you like with no draft row left behind
- [x] Step 2 shows per-employee `contract_days/period_days` as a miniature LINE segment; blocked rows drop to 55% and state their reason on the row — verified with Farhan Qureshi, who has no contract covering August
- [x] The six-stage rail is derived from the payrun's real state, so a reopened run visibly goes backwards
- [x] Warnings are a triage inbox sorted by severity; every card states what it blocks, and one that blocks nothing says *"Informational"*
- [x] Clearing the last blocker sweeps the rail vermilion → jade over 900ms with the resolve chord — fired on the **transition** to zero blockers, never on a render that merely has none, and reduced to a colour change under `prefers-reduced-motion`
- [x] `Validate` is refused while an ERROR is open and says which one — measured: `BLOCKED_BY_ERRORS · 1 error must be resolved first: Farhan Qureshi has no running contract covering August 2026`
- [x] Force-pay demands a typed reason of at least twelve characters before the key enables, and the reason is printed on the run from then on
- [x] A `PAID` payrun offers no recompute, no reopen and no cancel — **absent, not disabled**
- [x] Sound map complete (eight synthesised cues), muted by default, toggle persists — the rail's block-landing pitch is parameterised by position in the list
- [x] Typecheck, token discipline and build clean

### P10 · Findings

**1. The sweep has to fire on a transition, not on a condition.** The obvious
`if (!blocked) sweep()` replays the product's one celebratory moment on every
reload of a healthy payrun, which turns it into background noise within a day.
It fires only when the previous render **was** blocked and this one is not.
This is the same shape as P4's finding 1: a component that behaves differently
based on *what changed* cannot read that from the current props alone.

**2. The dark room belongs on `<html>`, not on a panel.** A dark panel floating
in a bone-coloured application reads as a broken component rather than as
another room — the sidebar, the top bar and the scrollbars all have to come
with it. That makes the cleanup mandatory rather than tidy: the effect's
teardown removes the attribute, so navigating out by link, by back button or
by a guard rejecting you never strands the rest of the app in the dark.

**3. The dark room and dark mode must be one ramp.** §04.4 prints the same
values twice — once for `[data-room]`, once for `[data-theme]` — and copying
them into a second stylesheet would have given the product two darks that
drift on the first tweak. `tokens.css` now declares both selectors on the one
block. One line, and it removes a whole class of future bug.

## P11 · Payslip and delivery

**Screens** S17 Payslip
**Size** M · **Backend** B8

- [x] Lines render in sequence, grouped by category, with the STACK in the right margin
- [x] Every line opens the provenance drawer — earnings, deductions, both totals, the net, and every block in the tower, all through one tree and one drawer
- [x] `RULE_EVAL_FAILED` shows the line at 0 with a `DID NOT EVALUATE` mark and the warning card above, never a blank
- [x] The flip reveals the derivation face — each line with its rule, sequence and formula as written
- [x] `Print PDF` resolves the card into a document — fetched with the bearer token and handed to the browser as an object URL; a blocked pop-up is reported as a blocked pop-up rather than as a failed request
- [x] Bulk send is wired to `send-payslips` and reports the API's own 202 (*queued / skipped*) as an informational card
- [~] **Mailpit is unverified.** The mock answers 202 with a count and sends nothing; confirming a message actually lands needs the backend's B8 mailer and `docker compose up`. Carried to P15
- [x] Typecheck, token discipline and build clean

### P11 · Findings

**1. The screen was rendering the payslip twice, and the blueprint had already
said not to.** The first pass drew a document — grouped lines, totals, net —
*and* the flip card, which renders exactly that on its front face. §12 S17 does
not describe a page with a card on it; it describes **the card**. The object
has two faces, not a face and a transcript.

Deleting the duplicate exposed the real gap: the card's lines were not
clickable, so "every line opens the drawer" was only true of the copy. The
card now takes an optional `onLine`, and a line **becomes a button** when the
page supplies one — the element changes rather than an overlay being added, so
the keyboard gets it for nothing.

**2. The provenance drawer rendered a leaf as an empty drawer.** It walked
`tree.children` and nothing else, which is fine for the payslip root and wrong
for every single line — and the single line is where the promise is most
direct. *"Why is BASIC ₹34,000?"* opened a drawer with the figure and no
answer under it. The root's own evidence — formula, inputs, source — now
renders above its children, so a leaf shows
`round(contract.wage * 0.5 * contract_days / period_days, 2)`, the three values
it received, and a link to the contract it came from.

A P4 component, found by a P11 screen. That is what the phase review is for.

**3. The PDF cannot be a link.** `window.open(pdfUrl)` is the obvious version
and it is a 401: a top-level navigation carries no `Authorization` header, so
the real backend refuses it and the mock's `auth()` refuses it too. The bytes
go through the client — same refresh queue, same token — and reach the browser
as an object URL. `api/client.ts` grew one `requestBlob`, which is the whole
cost.

## P12 · Dashboard

**Screens** S18
**Size** L · **Backend** B9

- [x] Five figures across the top, each openable into its own derivation through the **same** drawer the payslip uses
- [x] Changing period or department moves every number and both charts — one call, so every figure is the same instant
- [x] Six months of history looks intentional, not broken — the trend spreads whatever exists across the full width, and points appear only while there are few enough for each to be a fact
- [x] An empty period keeps the well's shape and holds `NO PAYROLL DATA FOR THIS PERIOD`, never a blank frame
- [x] Alerts reuse the **same** `WarningCard` as S16, with the same "what this blocks" sentence built from the same `WARNING_META`
- [~] `HR_MANAGER`'s money-free variant is **built and unreachable.** The layout is driven by the payload (`total_net_paid === null`), keeps five figures by promoting the two that role owns, and replaces the two money panels with explanations rather than gaps — but `rbac.py` grants `HR_MANAGER` no dashboard at all, so the branch cannot be reached in the product. **This is P2 finding 3, still open.** Aditya has to grant it in `rbac.py` or PRD §6.1(a) has to be amended
- [x] Typecheck, token discipline and build clean

### P12 · Findings

**1. Deviation: the charts are hand-written SVG, not Recharts.** §14 names
Recharts, and every rule §14 states is a *restriction* — horizontal gridlines
only, no axis lines, no area fill under a line, radius on the trailing corners
only, two hues maximum, never a blank frame. Satisfying a list of restrictions
by overriding a library's defaults is more code than drawing the three marks
this product needs, plus ~90kb that draws ninety other things it must not. The
same argument P4 made for THE LINE and THE STACK. Bundle cost: **0kb**.

**2. A zero-based axis made the trend a lie in the other direction.** Six
months of payroll sit within a few percent of each other, so `min(values, 0)`
drew them as one flat line pinned to the top of the frame — a chart answering
*"is payroll a large number?"* when §14 asked for a trend. The domain is now
padded around the data, and because an unlabelled non-zero baseline is the
oldest chart lie there is, the caption prints the low and the high and says
the axis is not zero-based.

**3. An SVG scaled down scales its type down with it.** The first viewBox was
640 wide in a 400px panel, which turned 10px tick labels into 6px ones —
unreadable, and not the size §05.2 chose. The user space is now close to 1:1
with the size the chart actually renders at. Worth remembering for any future
chart: a `viewBox` is a typography decision as much as a geometry one.

**4. The dashboard opened on a screen of zeroes.** Same root cause as P7's
finding 2 — it counts *settled* payslips and the open period is by definition
the one still being computed. It opens on the last settled period, and the
picker marks the open one.

---

## Stage III · what closing it changed elsewhere

Three fixes landed outside the phase that raised them, because leaving them
would have made a later phase's exit criterion untrue.

**The session did not survive a reload in mock mode.** P2 verified it against
the real backend and it was right there; against the fixtures it was false,
because the mock held its token maps in module scope and the page re-imports
them on every reload. The client presented a perfectly valid refresh token to
a server that had just forgotten every session it ever issued, so `F5` signed
you out of a demo. The refresh map now lives in `sessionStorage` — session
state, not a fixture, and exactly the right lifetime: it survives a reload and
dies with the tab.

**`RequirePermission` moved to `app/guard.tsx`.** Feature route trees need it,
and importing it from `routes.tsx` meant every feature imported the router that
mounts it. That worked — function declarations hoist — but it defeated code
splitting, because a lazily loaded section reaching back into `routes.tsx`
drags the whole route tree into its own chunk.

**Payroll and Reports are lazily loaded.** Stage III took the first build to
**221.94 kB** gzipped, past §19's 220 kB budget. Splitting the two heaviest
sections — which two of the five roles cannot open at all — put the shell back
to **195.57 kB**, with payroll at 19.34 kB and the dashboard at 4.98 kB behind
their own guards. CSS is 15.91 kB gzipped.

---

# STAGE IV · STORY

---

## P13 · The landing page

**Goal.** Eight acts, built **from** the design system — which is why it comes
last. This is the discipline that makes the marketing site and the product look
like one thing.

**Size** XL · **Depends on** all of Stage III

### Deliverables

```
src/landing/acts/
  Act00Hero · Act01People · Act02Time · Act03Leave
  Act04Payroll · Act05Validation · Act06Payslip · Act07Close
src/three/                    R3F scene — the 3D STACK, lazy-loaded
```

### Exit criteria

- [x] The hero figure disassembles along THE LINE on scroll, and the user controls time
- [x] Act 05 is the only dark act, and it mirrors the payrun room exactly —
      verified: it is the only section carrying `data-theme="dark"`, and it
      renders the product's own `Rail`, `WarningCard` and payrun counts
- [x] Act 04's 3D stack is scroll-scrubbed with sound, and is the loudest
      moment — 6 beats, the longest act on the page; the WebGL canvas mounts
      and the ledger reports "9 of 10 rules" mid-scrub
- [x] Composition alternates asymmetrically; only the hero and the close are
      centred — `lean` is a prop on `ActSection`, so it cannot drift
- [x] **The 3D never mounts below 768px, under reduced motion, or on
      `hardwareConcurrency <= 4` — and the flat SVG substitute is genuinely
      equivalent.** Both gates were exercised in a browser: at 379px no
      canvas mounts and the substitute says *"Drawn flat on a narrow screen.
      Same blocks, same proportions."*; with `prefers-reduced-motion` forced,
      no canvas mounts and it says *"Drawn flat and still, because you asked
      for less motion."* The substitute is the product's own `Stack` on the
      same blocks, and the ledger beside it is the same ledger — equivalence
      by construction rather than by inspection.
- [x] **Initial JS under 180kb gzipped** — measured against the real
      production bundle over the wire: **171.19 kB**, and `StackScene`
      (217 kB gz of `three` + R3F) is confirmed absent above the fold. This
      took a change; see finding 12.
- [ ] LCP under 1.8s on a 4G throttle — **not measured.** FCP is 112ms
      unthrottled on localhost, which is not the number this asks for. It
      needs DevTools network throttling or Lighthouse, neither of which is
      available here.
- [ ] Reduced motion renders one composed static frame per act — **partly
      verified.** The gate's reduced-motion branch is confirmed, and every
      act's `motion` values are gated on `useReducedMotion` in source. But
      `useReducedMotion` subscribes to the media query before a test can patch
      it, and the CSS `@media (prefers-reduced-motion: reduce)` block cannot
      be forced from in-page script, so the per-act static frames need the OS
      setting and a person.
- [ ] Mobile is visually impressive, not merely functional — **needs a human
      eye.** It is functionally sound: no horizontal scroll at any width, the
      acts go single-column below 900px with their objects at full width, and
      the flat substitute is in place. Whether it is *impressive* is the
      judgement this criterion is actually asking for.

### P13 · Findings

**9. Three of the four typefaces had never rendered — since P1.**
`@fontsource-variable` registers its faces as "Bricolage Grotesque
**Variable**", "Geist **Variable**" and "Geist Mono **Variable**".
`tokens.css` asked for the names without the suffix. So no rule in the
product ever named a downloaded face, no `@font-face` was ever activated, and
every heading, every body line and every figure fell through to `system-ui` /
`ui-monospace`.

Measured rather than guessed: `measureText("Reports Payroll 47,842")` at 40px
returned **390.92px for `--font-display`, `--font-sans` and bare `system-ui`
alike**, and 402.95px once the real face was force-loaded by its declared
name. Instrument Serif was the one that worked, because @fontsource registers
it unsuffixed.

This is the single largest thing P14 found. §05 is the longest section of the
blueprint and none of it was in effect — including §05.3's number scale,
which exists because Geist was chosen for its tabular figures. It was silent
because a font fallback is not an error, and invisible to every previous
phase because the fallback is a perfectly respectable sans.

**10. Turning the fonts on broke two layouts that the fallback had been
hiding.** Geist is wider than `system-ui`, so measurements tuned against the
wrong face stopped fitting. `.pp-dash__figure` and `.pp-open__figure` are
grids, and a grid item's default `min-width: auto` refuses to shrink below
its min-content width — so the label and support line forced the `1fr` track
wider than the card and painted 43px and 51px past its right edge. `0` lets
them wrap, which is what they were always meant to do. **A layout tuned
against a fallback font is a layout tuned against nothing**, which is the
real lesson of findings 9 and 10 together.

**11. The landing page had no stylesheet, and one act had no ink.**
`landing.css` did not exist; all **140** `lp-*` class names used by the eight
acts were undefined. Written now, from the system — every surface a `clay-*`
or `inset-*` utility, every size a `--s-*` step, every hue a token, and
`check:tokens` stays clean.

Four things the writing of it turned up, each a real defect rather than a
styling choice:

- **The dark act inherited light-theme ink.** `color` inherits as a *computed
  value*, so anything inside `data-theme="dark"` that did not name a token of
  its own was still carrying the near-black `--ink-900` resolved outside it.
  Act 05's own title was #1A1714 on #241F19. The act now restates `color`
  as well as `background`, so inherited colours re-resolve inside the dark
  scope. Caught by running axe at *act completion* rather than at the top of
  the page — at scroll 0 the act had not been reached.
- **A sticky stage taller than the viewport plays with its ending off-screen.**
  Acts 04, 06 and 07 ran to 1064, 1141 and 979px against a 900px window. The
  stage is now exactly one viewport, and the three tall acts are fitted to it:
  the ledger tightened, the scene sized against the shorter axis, and the
  payslip given `zoom` — `zoom` and not `scale`, because a transform does not
  change layout and a scaled payslip still reserved its full height.
- **Below 900px the page stops being scenes and becomes a document.** Two
  stacked halves cannot fit one viewport — at 1024x768 the single-column acts
  measured 803, 1196 and 1135px — so the pinning is released along with the
  fixed height rather than clipping. Every act's scroll values still run
  0 → 1, and the objects are full-width instead of squeezed into half a phone.
- **Two "not yet revealed" states were built out of opacity, and both were
  resting states.** The ledger row rested at 0.4 and the chain link animated
  to 0.25 — real copy at roughly 2:1, held there until the reader scrolled.
  Both now say "not yet" with ink and material instead: an un-reached chain
  link is *flush* and becomes clay when reached, which is a truer sentence
  than 25% alpha as well as a legible one. Same finding as P14 3, third and
  fourth instance.

**12. A visitor to the front door downloaded the whole product.**
`routes.tsx` imported People, Contracts, Time, Leave, the Gallery and the
Proving Ground eagerly, so the entry chunk was **191.30 kB gzipped** and
someone who had asked only for the landing page got the employee directory,
the contract editor, the attendance grid and the leave queue with it — over
§19's 180 kB landing budget before the landing's own code was counted.

Every section is now its own chunk, matching the split Payroll and Reports
already had. The entry chunk is **132.54 kB gz** (−58.76), the landing's
measured initial payload is **171.19 kB gz**, and the app shell has 87 kB of
head room against its own 220 kB budget instead of 29 kB. All eight routes,
both anonymous flows and all five roles were re-walked afterwards.

**13. `/` had to be given away, and the guard that protected it looped.**
The landing needs `/`, which the authenticated shell owned as its index
route. The authenticated home moved to `/home` — but `AnonymousOnly`
redirected signed-in readers *to `/`*, which is one of the routes it guards,
so the first version of this change redirected forever. Its target is
`/home` now. Verified in all four directions: signed out `/` is the landing,
signed out `/people` is `/login`, signed in `/` is `/reports`, signed in
`/home` is `/reports`.

**Also noted:** `pp-rail__track` used `grid-auto-columns: 1fr`, and a bare
`1fr` carries an implicit `auto` minimum — so the five-stage rail had a
min-content width of ~705px and put a horizontal scrollbar on any page
narrower than about 740px. Found on the landing; **the payrun cockpit had it
too.** Fixed at source in `payroll.css`, and the labels now truncate.

---

# STAGE V · FINISH

---

## P14 · Hardening

**Goal.** Everything we said we would do, verified rather than assumed.

**Size** L

- [x] **Accessibility audit** — axe clean on all 7 application routes in
      **both** themes (14/14, `wcag2a wcag2aa wcag21a wcag21aa`). Seven
      violations found and fixed — findings 1–3. *Still open: the
      screen-reader pass on the payrun and payslip needs a real reader
      (NVDA / VoiceOver) and a person.*
- [x] **Reduced-motion pass** — three transitions escaped §07.5's coverage;
      one of them moved a box. Finding 4.
- [x] **Dark mode pass** — every application screen, charts included, in the
      same 14-route sweep as the accessibility audit. *The 3D fallback is not
      covered: it lives on the landing page, which does not render — see
      "P13 does not ship" below.*
- [x] **Performance pass** — measured, not assumed. App shell JS **191.00 kB
      gzipped against §19's 220 kB budget**, so it passes with 29 kB of head
      room. One `box-shadow` transition above 400px² found and fixed
      (finding 5). **The font budget still fails** — finding 6, which is
      blueprint §22 item 7, and it cannot be fully closed without a decision.
- [x] **Responsive pass** — 1440 / 1280 / 1024 / 768 all clean, with no
      horizontal scroll on any route. Mobile turned up a real data-loss
      defect, though not the one it first appeared to be. Finding 7.
- [x] **Role pass** — all five roles against all seven routes. **No route
      leaks and no scope leaks**; the matrix behaves as `rbac.ts` says it
      should. Finding 8 records the part worth knowing.
- [ ] **Generated illustrations** — 9 empty states + 4 act transitions, all
      from the locked prompt, all under 40kb WebP — **not started; needs an
      image generator.** No illustration asset exists in the repo today
      (`public/` holds only the MSW worker), so the nine empty states
      currently ship as type alone.
- [x] **Copy pass** — every banned word in §17 grepped across `frontend/src`
      and `backend/app`: **zero hits**. Voice spot-checked against §17's
      table on every screen the sweep visited.
- [x] **Error pass** — all 41 `code` literals the backend can emit were
      enumerated and checked against `api/errors.ts`. The map is deliberately
      small: seven generic codes are phrased locally and the rest fall
      through to the backend's own message, every one of which was verified
      to be a written sentence rather than a symbol. `rate_limited` is absent
      on purpose — its message carries the remaining seconds. **Passes as
      designed.**

### P14 · Findings

Seven defects found, all seven fixed and re-verified. Two items could not be
closed here and are left unticked rather than assumed.

**1. Every nav link in the shell lost its accessible name at ≤1024px.**
`shell.css` collapsed the rail to icons with
`.pp-navitem span { display: none; }`. A link's only accessible name is that
span, so `display: none` took all six sections *out of the accessibility
tree* — at exactly the width §21 names as a requirement. axe: `link-name`,
serious, on all seven screens. The span is now clipped using the project's
own `.sr-only` geometry instead of removed: sighted users lose the label, a
screen reader does not. **This is the finding P14 existed to produce.** It was
invisible to every previous phase because the review always happened wide.

**2. A signal hue carrying small text is a case the colour system never had.**
§04.4 gave us `--{signal}-solid` / `--on-solid` for "a signal covers an area,
what colour is the text *on* it". It never answered the mirror question —
"the text *is* the signal" — so P12's dashboard reached for the raw 500s and
measured **2.14:1** (orange), **2.94:1** (vermilion) and **4.47:1** (cobalt)
at 13px. That is the P0 contrast failure again, in a new place, for the same
reason: no token existed for what the screen needed.

Four `--{signal}-text` tokens now exist, each darkened only until it clears
4.5:1 on `--bone-300` — the inset well floor, the darkest ground text sits on
— so the hue survives and the reading is legal: 4.62–4.64:1 on the well,
5.73–5.76:1 on a card. In the dark room the bright signals already clear
4.5:1 on every dark ground including the clay tops, so the text tokens *are*
the solids there; two names and one value, on purpose, so the call site keeps
meaning the same thing in both themes. **27 call sites** across nine
stylesheets moved over. Fills, dots, borders and chart strokes keep the 500,
which is what §04.2 always intended.

**3. Two ways of making text quiet that a token check cannot see.**
The same mistake wearing different clothes, and neither trips
`check:tokens`, because neither writes a raw value:

- **A non-text token carrying text.** `--ink-300` is documented as "disabled
  ink, chart gridlines" and was colouring three pieces of real copy — a
  chart caveat at **1.94:1**, a "not recorded" value, and the Kanban empty
  state. An empty state is the only copy on its screen; it cannot be the
  faintest thing on it. All three now use `--ink-400`, the lightest token
  cleared for text. The genuinely disabled uses of `--ink-300` were left
  alone: WCAG exempts them, and the drag grip and chart strokes are not text.
- **`opacity` on a box that contains text.** `.pp-avatar--inactive`
  (`opacity: .55`) and `.pp-strip__day--none` (`opacity: .5`, fifteen cells at
  ~1.9:1) composited their labels down along with their grounds — and the
  strip's label is the day number, which is how you tell which day you are
  looking at. Both now recede by dropping to the well floor instead of
  fading, so the recession is *material* rather than a filter, and the ink
  holds at 5.42:1.

**4. One hover in the product moved a box under `prefers-reduced-motion`.**
`.pp-person` transitioned `translate` with no reduced-motion clause, so the
object card still lifted 1px on hover and pressed 1px on click. §07.5 is
explicit that springs collapse and position does not survive — but elevation
does, because the shadow is what says "raised", and that is meaning rather
than decoration. The card keeps its shadow change and drops the translate.
Two colour-only transitions in `leave.css` and `time.css` had no clause
either; they are clamped to 120ms so no transition anywhere in the product
outlives the reduced-motion budget.

**5. The largest interactive clay in the product transitioned its shadow.**
§19 permits a `box-shadow` transition only under ~400px a side. Every element
that transitions `box-shadow` was measured across all seven routes:
`.pp-open__card` — the open-period card on the payrun screen, the one screen
that must never drop a frame — came in at **589×364 = 214,205px²**, and grows
from there at desktop widths. It now transitions `transform` only. The shadow
still changes on hover; it snaps, and at a 2px lift the eye reads the
movement rather than the shadow's ramp. Re-measured: nothing above 400×400
transitions a shadow on any route.

**6. The font budget fails, and closing it needs a decision. → OPEN**
§19 budgets ~92 kB of fonts on first paint. Measured from the built `woff2`
files rather than estimated, reality was **168.5 kB** — worse than §22 item
7's own guess of ~123 kB, because that guess did not count the serif's second
cut. One piece was free and is fixed: `.t-quote` is the *only* consumer of
`--font-voice`, and `.t-quote` is italic, so Instrument Serif's upright cut
was **20.5 kB that no rule in the product could ever select**. Gone, at zero
visual cost, leaving **148.0 kB**. The remaining 56 kB cannot be taken without
choosing between three options, none of them free — see "Where we are".

**7. Mobile silently truncated four tables — and the metric that found it was
wrong.** `.pp-table-well` clipped with `overflow: hidden`, and a table's
intrinsic width is the sum of its columns: the contracts table measures
**878 px** inside a 263 px well on a phone. Five of its eight columns were not
scrolled off, they were *cut off* — unreachable by any gesture. Below the
tablet breakpoint the well now scrolls, and **622 px of previously
unreachable columns** came back. Desktop is untouched, so the sticky header
keeps the page as its scroll container above 768px.

Worth recording honestly: the first measurement — `scrollWidth - clientWidth`
— reported a 284 px page bleed, and that number was an artifact of the
preview pane scaling an emulated viewport. `window.scrollTo(99999, 0)` shows
the page cannot scroll sideways on any route at any width. **There was no
bleed.** The clipped-column defect was real, and it was sitting underneath a
metric that was describing something else.

**8. The role matrix holds, including scope.** All five roles were signed in
and walked through all seven routes. `EMPLOYEE` gets a 3-item nav, is refused
`/payroll` and `/reports` by name, and — the part actually worth checking —
sees **1 person** on `/people` and **1 contract** on `/contracts`, so
`scope: OWN` narrows the *data* and not merely the navigation. `HR_MANAGER`
gets 4 items and no dashboard, which matches blueprint §22 item 6's
description of the current state; that open item is a PRD decision, not a
frontend defect. Both payroll roles get all six. The routes an `EMPLOYEE` can
still reach by typing a URL return their own records only, which is the
documented contract of `app/routes.tsx`: the guard exists so the UI never
*offers* what the API would refuse, and the API refuses correctly.

**Also noted, not fixed.** In `mock` mode the first paint is a blank ground
for 1–3 s, because `main.tsx` awaits the service worker before it renders and
`startApiMode()` has no `.catch`. Harmless in a `live` build, where the
promise resolves immediately — but it means a mock demo opens on nothing, and
a worker that fails to register opens on nothing *forever*. It wants the
`Booting` state the router already has.

### P14 · Smoothness pass — findings 15–19

Run after P13 shipped, because a page nobody could open could not be janky.
Five causes, four fixed and one flagged. **The frame rate itself was not
measured** — see the note at the end, which matters for reading these.

**15. 32 compositor layers were promoted permanently, and nothing was
animating.** `.pp-roll__col` carried `will-change: transform` on the base
class, and `RollingNumber` renders one column per digit. §19 is explicit that
the promotion is "removed after"; this one never was. Measured on the landing
page at rest: **33 promoted layers, 32 of them idle digit columns.**

The component already branches — a plain `<span>` with a written transform for
a digit that did not change, a `motion.span` for one that did — so the
promotion moved onto the animated branch alone. **33 → 0 at rest**, on the
landing and on every product screen carrying a figure.

Two attempts at releasing it the instant the roll ends were reverted:
`onAnimationComplete` does not fire for every column, so the state stuck *on*,
which is worse than a bounded delay. It now releases on the next value change
— at most one layer per changed digit of one figure, and only after an
interaction. `motion` does not manage `will-change` itself in this version;
that was measured, not assumed. The payslip's flip lost its permanent
`will-change` for the same reason, and needs no replacement:
`transform-style: preserve-3d` already gives that element a rendering context.

**16. The landing's sticky chrome was blurring the page behind it, on every
frame of every scroll.** `backdrop-filter: blur(10px)` on a `position: sticky`
bar over an eight-act page is the most expensive thing that page could
reasonably contain, and §19 does not sanction it. **This was mine**, added
when `landing.css` was written in the same session. The chrome is now opaque
`--bone-200` — which is also more honest for a product whose whole argument is
material rather than glass.

**17. Act 02's live clock ticked for the rest of the page once it had been
seen.** The interval was gated on `useHasEntered`, which latches by design —
it answers "may this act start?", and disconnects its observer on first
intersection. So a `setState` fired every second, re-rendering a motion-heavy
act behind six other acts, until the page was closed. The act's own header
comment says *"it stops when the act is off screen — an interval running
behind six other acts is a battery leak."* **It did not.**

`scroll.ts` gained `useIsOnScreen`, the non-latching companion, and the clock
uses it. The distinction is worth keeping in mind: a latching answer is right
for anything that would change an act's *identity* if it unmounted (which is
why Act 04's scene still uses `useHasEntered`), and wrong for anything that
runs on its own clock rather than on the reader's scroll.

**18. `role="img"` was hiding eight focusable controls from screen readers.**
`Stack.svg.tsx` declared the whole diagram `role="img"`, which prunes its
subtree from the accessibility tree — while every block inside is a
`role="button"` with `tabIndex={0}`, because §10.3 says every displayed number
can be opened. The result was eight tab stops that announced nothing. axe:
`nested-interactive`.

Now `role="group"`: the `<title>` still names the diagram, and the blocks stay
in the tree. **This is a shared signature component**, so the payslip screen
had it too. It surfaced on the landing only because the flat substitute
renders below 768px — the same reason finding 11's dark-ink bug surfaced at
act completion rather than at the top of the page. *Where* you look decides
what you find.

**19. The 3D scene renders a shadow map every frame it draws. → FLAGGED**
`frameloop="demand"` is correct, so the scene is idle outside act 04 — but
during the scrub it draws every frame, and every frame re-renders a 1024²
shadow map, because the blocks are moving. The map is now **512²**, which is
free at this scale: a ten-block tower at six units casting a soft clay shadow.

The standing conflict is not P14's to resolve. §19 says *"no post-processing,
no shadow maps — shadows are baked into the material"*, and the scene is built
around a real cast shadow and tuned for one (`shadow-bias`, the shadow camera
bounds). Removing it is a visible design change. **Either the light goes or
§19's clause does** — that is a call for whoever owns the blueprint.

**20. Two acts collided at every seam — the reported defect.**
Screenshots from a real window showed a fragment of act 04's payroll ledger
sitting directly above act 05's dark-room headline, hard-edged, both
compositions cut. It is structural, not a layout error: a `100dvh` sticky
stage inside a `beats × 100dvh` section un-pins the instant the section's
bottom reaches the viewport's bottom, so for one full viewport of scroll per
seam the outgoing act slides up while the incoming one slides in beneath it.

Measured at 1890×900, hit-testing a 19-point vertical sample at 201 scroll
positions: **51 positions had a visibly sliding act colliding with
another.** Every act's *content* fits its stage at that size, so nothing was
overflowing — the acts were simply both on screen.

`ActSection` now fades a stage out across the last 8% of its own act, so it
is gone before it starts to move. The arriving act does not fade in: it is a
curtain coming up, and a curtain that is arriving should be solid.

**A wrong turn, recorded because the measurement is the interesting part.**
The first attempt pulled every act up by `-100dvh` so the incoming one rose
over its predecessor. It worked on the stated metric — **51 collisions → 0**,
and 6,300px of dead scroll removed with them. It was still wrong: the overlap
begins covering an act one viewport before its section ends, and a two-beat
act only *has* two viewports. Measured, per act, the progress at which
coverage begins:

| act | beats | covered from |
|---|---|---|
| 00 | 4 | p 0.67 |
| 01 | 2 | **p 0.00** |
| 02 | 3 | p 0.50 |
| 03 | 3 | p 0.50 |
| 04 | 6 | p 0.80 |
| 05 | 2 | **p 0.00** |
| 06 | 2 | **p 0.00** |

Three acts would have animated entirely behind a curtain and two would have
lost half. Reverted; the geometry is back to covering each act at **p 1.00**,
which is exactly when it has finished. The lesson is that "collisions → 0"
was the wrong success criterion on its own — it measured the symptom and not
the act.

**The fade itself is unverified.** `useScroll` does not track in a hidden
tab, so the stage's opacity reads `1` at every scroll position here. The
wiring is confirmed (motion writes an inline `opacity`) and the geometry it
depends on is confirmed, but whether the seam now reads cleanly needs the
window that produced the screenshots.

### What was not measured, and why it matters here

**No frame-rate number appears above.** The browser pane available in this
session runs hidden, and a hidden document:

- suspends `requestAnimationFrame` — so frame pacing cannot be sampled, and
  `motion`'s transform writes never run;
- throttles `setTimeout`/`setInterval` to ~1s — which is what made several
  scroll probes time out rather than return;
- does not deliver `IntersectionObserver` callbacks — so no act ever "enters",
  and Act 02's clock correctly reads as stopped;
- freezes CSS transitions — which produced **19 phantom dark-mode contrast
  failures** on `/contracts`, because `body`'s 420ms background transition
  never advanced and axe measured dark text on the light ground it was still
  leaving. Disabling the transition dropped it to zero. Dark mode is clean.

So findings 15–19 are all *code-evident* — a permanent `will-change`, a
`backdrop-filter`, a latching gate, a pruned a11y subtree, a shadow map — and
every fix was verified by re-measuring the thing it was about (promoted layer
count, computed style, axe). None of them is "this felt slow, so I changed
it", and none of them is a confirmed frame-rate improvement either. **A
person on a visible window should confirm the scroll before this is called
done.**

---

### P13 does not ship — found during P14

P14 hardens what renders. The landing page does not render, and this is not a
polish item:

- `src/landing/Landing.tsx` and all eight acts exist and are complete
  TypeScript, and `Landing` is `export default`ed exactly as a lazy route
  would want — but **nothing imports it.** `app/routes.tsx` has no landing
  route; `/` redirects an anonymous visitor to `/login`.
- **There is no `landing.css`.** All **128** `lp-*` / `act-*` class names used
  by the acts are undefined in every stylesheet. The acts are unstyled.
- Consequently the production build contains no act copy, no
  `src/three/StackScene` chunk and no `three` at all — confirmed by grepping
  the built chunks for `WebGLRenderer` and `hardwareConcurrency`: zero hits.
  The R3F gate has never executed.

So four things cannot be assessed, and are not ticked anywhere above:
§19's **landing** JS budget (180 kB) and LCP target, the 3D gate and its flat
substitute, the per-act reduced-motion frames, and P13's own eight exit
criteria. P15's cold-start path also has no first screen to start from.

## P15 · Demo readiness

**Size** M

- [ ] Both PRD §12.3 scenarios run end to end without a console error —
      **blocked on the backend.** The console half is verified: ten route
      transitions including a 404 produce **zero** app-level errors or
      warnings, and the mock contract selftest passes **82/82**. The
      scenarios themselves cannot be *run* end to end, because steps 3–8 of
      Scenario A are backend work — `POST /payruns`, Compute, Validate, Mark
      Paid with a forced reason, the PDF, and thirty emails into MailHog —
      and the backend is at B0 with only `/auth`. The mock layer answers
      those endpoints, so the screens can be walked; the criterion asks for
      more than that.
- [x] The third beat — the employee with a raise on the 16th — **exists and
      is right in the data.** Kavya Reddy (PP-0009) carries two contracts
      covering the open period: `2022-08-16 → 2026-08-15` at ₹72,000 and
      `2026-08-16 → open` at ₹81,000. Her record renders THE LINE with two
      contract bands and the boundary date. *Not yet closable:* "explained on
      screen" means the applicable contract named **on the payslip** with a
      `MULTI_CONTRACT_PERIOD` warning, and that is the payrun document —
      backend again.
- [x] **Seed reset is one command and is byte-identical each run** —
      `__mocks.reset()`, measured: 1,717,500 bytes at the same hash on first
      boot and after two consecutive resets. Verified for the mock layer; the
      backend's `seed.py` is Aditya's half of the same criterion.
- [ ] Cold-start path verified: `docker compose up` → seed → log in →
      dashboard — **blocked on the backend**, and not runnable here. The
      frontend half now has a front door: `/` is the landing page, and
      sign-in reaches a dashboard.
- [ ] Backup video recorded — **needs a person.**
- [x] **`PeoplePay360` → `PAYPULSE` complete everywhere, including the
      payslip PDF.** Audited rather than assumed, and it turned up a real
      defect rather than a naming tidy-up — finding 14.

### P15 · Findings

**14. The mock accounts had drifted from the seeded ones, and `mode.ts`
promised they had not.** `api/mode.ts` is explicit that the whole point of a
single binary flag is that *"both modes serve the same five accounts with the
same password, so switching changes what the data is, never how the app
behaves"*, and that a per-endpoint switch is the version that rots into *"a
demo where the thing that breaks is the seam"*.

The seam had already broken:

| | `backend/app/db/seed.py` | `src/mocks/seed/people.ts` |
|---|---|---|
| accounts | `*@paypulse.app` | `*@peoplepay360.com` |
| password | `paypulse` | `peoplepay` |
| names | Asha, Ravi, Neha, Imran, Sneha | identical ✓ |

So flipping `VITE_API_MODE` mid-demo meant **nobody could sign in** — the
exact failure the flag was designed to prevent, sitting inside a file whose
comments assert it cannot happen. PRD §13 names `*@paypulse.app` / `paypulse`
as canonical, so the mocks were wrong, not the backend. Aligned, and
`selftest.ts` now imports `DEMO_PASSWORD` instead of repeating the literal —
a second copy of the password is how this drifted in the first place.
Re-verified: signing in as `admin@paypulse.app` / `paypulse` works and the
contract selftest still passes 82/82.

**Also in scope, and already correct.** The payslip PDF renders
`settings.COMPANY_NAME`, which is `"PayPulse Technologies Pvt. Ltd."` — that
half of blueprint §22 item 1 was done in B1. `README.md` still opened
`# PeoplePay360`; it now reads `# PAYPULSE` and names the brief rather than
being named by it.

**Deliberately not renamed**, per PRD §13's own ruling: the Compose project
name, the database name and the DB user stay `peoplepay360`, because they are
invisible to judges and renaming them would orphan the existing Postgres
volume mid-hackathon. `docs/PRD-v1.md` keeps its title because it is an
archive, and `docs/PRD.md`'s references are the passages that *explain* the
naming. **This criterion is complete; the remaining occurrences are the ones
the PRD says to leave.**

---

## Phase review ritual

At the end of every phase, before starting the next:

1. Run the **blueprint §21 quality bar** honestly. A failed item blocks the exit.
2. Run the **state matrix check** — loading, empty, filtered-empty, error, permission-denied.
3. Run the **role pass** for any screen the phase touched.
4. Record any backend swap still outstanding in `docs/api-contract.md`.
5. Note what the phase taught us. If the material or a token needs to change,
   change it in `tokens.css` — never locally in a component.

---

## Where we are

| | |
|---|---|
| **Current phase** | **P15 · Demo readiness** — the frontend's half is done; the rest waits on the backend |
| Blueprint | ✅ complete |
| Build plan | ✅ complete |
| Backend | **B0 shipped · B1–B10 open** — and this is now the only thing in the way |
| Frontend | **P0–P13 ✅** · **P14 ✅** (two items need a person, one needs a decision) · **P15** — 3 of 6, the other 3 blocked on B1–B10 |

**Verified at P14/P15 in a browser, not assumed:**

| Check | Result |
|---|---|
| axe, 7 app routes × 2 themes | **14/14 clean** (was 7 violations) |
| axe, 8 landing acts at act completion | **8/8 clean** (was 44–47 per act) |
| Landing initial JS, production bundle over the wire | **171.19 kB gz** vs §19's 180 kB — **passes** |
| App shell entry chunk | **132.54 kB gz** vs §19's 220 kB — was 191.30 |
| R3F above the fold | **not loaded**; `StackScene` is its own 217 kB gz chunk |
| R3F gate: <768px / reduced motion | **both refuse WebGL**, with the honest reason on screen |
| `box-shadow` transitions > 400px² | **none** (was one, on the payrun card) |
| Horizontal scroll, 1440 / 1280 / 1024 / 768 / mobile | **none**, app or landing |
| Sticky stage fits one viewport, all 8 acts | **yes**, at 1440×900 and 1280×800 |
| Role pass, 5 roles × 7 routes | **no route or scope leaks** |
| Mock contract selftest | **82/82** |
| Seed reset determinism | **byte-identical** — 1,717,500 B, same hash, 3 runs |
| App-level console errors, 10 route transitions | **zero** |
| Banned words (§17) | **zero** |
| API error codes mapped | **41/41** |
| `npm run verify` | typecheck ✅ · token discipline ✅ · build ✅ |
| Typefaces actually rendering | **4/4** — was **1/4** (finding 9) |
| Fonts on first paint | **172.5 kB** vs §19's ~92 kB — **still over** |

**One decision left, and it is not a technical one.**

The font budget is the only §19 line still failing. §22 item 7 blamed
Bricolage's optical-size axis and prescribed subsetting; the P14 pass measured
that prescription and **it does not work** — the weight is in the variable
axis data, not the glyph coverage, so subsetting all three faces at full Latin
coverage saves 13.1 kB and lands at ~135 kB. `scripts/subset-display-font.py`
is the measurement, kept and documented; it is not wired up, because three
committed binaries and a Python build step is a bad trade for 13 kB.

What actually closes the gap is a coverage decision:

| | Lands at | Costs |
|---|---|---|
| **Drop Latin-1 from the subset** — no `é`, no `ü` | **~81 kB** | An employee named "José" gets a fallback face in their heading. A product decision about whose names PayPulse can set. |
| Subset at full coverage + drop the global serif | ~113 kB | Still over. `.t-quote`'s only consumer is `/dev/material`. |
| **Amend §19's budget to ~150 kB** | — | Honest, if four self-hosted families at full Latin coverage is what we want. Nothing renders differently. |

Recommendation: **amend the budget.** ~92 kB was set before the faces were
chosen, and the product now renders in all four of them for the first time.

**Still needs a person, not a script:**

1. **The screen-reader pass** on the payrun and the payslip. §18 names both;
   axe cannot do it and neither can this environment.
2. **Reduced motion, per act.** The gate is verified, and every act's motion
   values are gated on `useReducedMotion` in source — but the media query
   cannot be forced from in-page script, so the "one composed static frame"
   criterion needs the OS setting.
3. **LCP on a 4G throttle.** 112 ms FCP unthrottled on localhost is not the
   number §19 asks for. Lighthouse, or DevTools throttling.
4. **"Mobile is visually impressive, not merely functional."** It is
   functionally sound and measured so. Whether it is *impressive* is the
   judgement the criterion is actually asking for.
5. **The nine empty-state illustrations and four act transitions.** Needs an
   image generator; nothing can stand in for them.
6. **P4's signature motion** — the flip, the block landings, the drawer slide.
   P4 finding 3 has been carrying this since Stage II. The 3D stack and the
   payslip both render now, so this is finally checkable.

**Next action: B1.** Every remaining P15 criterion is a backend criterion —
the two §12.3 scenarios end to end, and the `docker compose up` cold start.
The frontend has no blocking work left.

---

## P0 · Findings

Recorded per the phase review ritual. Both are token-level and were fixed in
`tokens.css`, then synced back into the blueprint.

**1. The field was too light — the material could not read.**
The first ground (`#F7F4EE`) crowded every surface into the top 3% of the
luminance range. `clay-3` measured **1.018** against it, which is invisible;
worse, the inset well read *stronger* than the raised card, inverting the
material. Dropping the ground to putty (`#EFEAE1`) restored the depth order —
`PROUD 1.121–1.170 > FLUSH > INSET 1.107–1.252`. Shadow opacities were raised
and their negative spreads reduced, which had been pulling them too tight to
see. **This is the finding P0 existed to produce.**

**2. Contrast failures across both themes.**
`--ink-400` carries 11px and 13px labels — small text, needing 4.5:1 — and
measured **3.20:1**. Separately, white on `--jade-500` was **3.05:1** in light
and **2.10:1** in dark, so a filled `PAID` chip was illegible. Fixed by
darkening `--ink-400` until it clears the *darkest* ground it can land on, and
by adding `--{signal}-solid` / `--on-solid` so text on a signal is one system
decision. All 56 pairings now pass.

**Deferred to P1:** typefaces are still on the Google Fonts CDN. Self-hosting
needs the `woff2` files subset to `latin` + `₹` and preloaded — the blueprint
§19 budget assumes it, and a FOUT on the `num-hero` figure undoes the hero.
