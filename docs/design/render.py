#!/usr/bin/env python3
"""Composes the PeoplePay360 design board and writes the .excalidraw scene."""
import json, textwrap, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_board import *   # noqa

W = 3400          # band width / canvas column width


def para(s, x, y, w, size=14, color=MUTED, fam=HAND, g=None, lh=None):
    """word-wrapped paragraph; returns the y below it"""
    chars = max(8, int(w / (size * CW[fam])))
    out = []
    for block in s.split("\n"):
        out.extend(textwrap.wrap(block, chars) or [""])
    body = "\n".join(out)
    txt(body, x, y, size=size, color=color, fam=fam, w=w, g=g)
    return y + len(out) * size * LH


# =========================================================== 00 · COVER ====
def cover(y):
    txt("PeoplePay360", 0, y, size=84, color=INK)
    txt("Integrated HR & Payroll Platform", 6, y + 116, size=30, color=MUTED)
    line([(0, y + 172), (1560, y + 172)], color=HAIR)
    txt("System & Product Design Board   ·   v1.0   ·   Odoo Hackathon",
        6, y + 188, size=16, color=SOFT)

    cx = 0
    for label, col, bg in [
        ("36-48 h build window", INK, NONE),
        ("FastAPI + PostgreSQL 16", VIO, VIO_BG),
        ("React + Vite + TypeScript", BLUE, BLUE_BG),
        ("Aditya  backend", MUTED, NONE),
        ("Pranav  frontend", MUTED, NONE),
        ("DESIGN ONLY - no code yet", RED, RED_BG),
    ]:
        cx += pill(cx, y + 236, label, stroke=col, bg=bg, size=14) + 14

    # ---- legend: the board's own design system --------------------------
    lx, ly = 2060, y - 10
    rect(lx, ly, 1340, 330, stroke=HAIR, bg=SURF)
    txt("HOW TO READ THIS BOARD", lx + 26, ly + 22, size=13, color=AMB)
    line([(lx + 26, ly + 50), (lx + 1314, ly + 50)], color=HAIR, op=60)

    legend = [
        ("rect", BLUE, BLUE_BG, "Screen / UI surface", "owned by Pranav"),
        ("rect", VIO, VIO_BG, "Service / business logic", "owned by Aditya"),
        ("rect", GRN, GRN_BG, "Persisted state - a table", "the source of truth"),
        ("rect", RED, RED_BG, "Blocking gate", "refuses the transition"),
        ("note", AMB, AMB_BG, "Decision & rationale", "why, not just what"),
        ("arrow", SOFT, NONE, "solid = sync call", "dashed = background task"),
    ]
    for i, (kind, col, bg, label, sub) in enumerate(legend):
        c, r = i % 2, i // 2
        ex, ey = lx + 26 + c * 650, ly + 74 + r * 82
        if kind == "arrow":
            arrow([(ex, ey + 14), (ex + 46, ey + 14)], color=col, sw=2)
            arrow([(ex, ey + 30), (ex + 46, ey + 30)], color=col, sw=2, dash="dashed")
        else:
            rect(ex, ey + 6, 46, 30, stroke=col, bg=bg)
        txt(label, ex + 66, ey + 6, size=17, color=INK)
        txt(sub, ex + 66, ey + 31, size=13, color=SOFT)
    return y + 400


# ================================================ 01 · THE FOUR HARD PARTS =
def hard_parts(y):
    section(0, y, "01",  "What actually has to be true",
            "The brief scores business logic and data relationships, not screens. Four "
            "requirements carry the marks - each is made structurally true in the schema "
            "or the engine, not merely handled inside a service method.")
    y += 150

    items = [
        ("Period-based contracts",
         "An employee accumulates contracts over time. Payroll must use only the one "
         "valid for the pay period, and concurrent active contracts must be impossible.",
         "A Postgres EXCLUDE constraint over daterange, scoped to state = RUNNING. "
         "Overlap cannot be inserted - not in Python, in the database."),
        ("Schedule-derived hours",
         "Weekly hours are computed from a day / start / end / break pattern. The spec is "
         "explicit that they must never be typed in.",
         "hours_per_week is a read-only computed column, recalculated from "
         "working_schedule_line on every write. The form has no input for it."),
        ("Leave that costs money",
         "An approved request has to actually decrement a balance - and unpaid leave has "
         "to reach the payslip.",
         "leave_engine consumes the allocation on approval; the LWP rule turns "
         "unpaid_leave_days into a deduction line on the next compute."),
        ("Ordered rule evaluation",
         "Rules run in sequence so later rules build on earlier totals. This is the line "
         "the brief repeats most often.",
         "Each evaluated rule writes back into rules.<CODE> and categories.<CAT>. "
         "SPECIAL and NET both back-reference earlier results, visibly, on the payslip."),
    ]
    cw, gap = 820, 40
    h = max(82 + measure(p, cw - 48, 14)[2] + 50 + measure(f, cw - 48, 14)[2] + 26
            for _, p, f in items)
    for i, (title, problem, fix) in enumerate(items):
        x = i * (cw + gap)
        rect(x, y, cw, h, stroke=INK, bg=SURF)
        ellipse(x + 24, y + 24, 34, 34, stroke=AMB, bg=AMB_BG)
        centered(str(i + 1), x + 24, y + 31, 34, size=15, color=AMB)
        txt(title, x + 72, y + 26, size=21, color=INK)
        by = para(problem, x + 24, y + 82, cw - 48, size=14, color=MUTED)
        line([(x + 24, by + 14), (x + cw - 24, by + 14)], color=HAIR, op=60)
        txt("MADE TRUE BY", x + 24, by + 28, size=11, color=AMB)
        para(fix, x + 24, by + 50, cw - 48, size=14, color=INK)
    return y + h + 90


# ============================================== 02 · SYSTEM ARCHITECTURE ===
def architecture(y):
    section(0, y, "02", "System architecture",
            "One deployable unit per concern, right-sized for a 48 hour window. The "
            "service layer is the whole product - routers stay thin and the database "
            "carries the invariants.")
    y += 150
    g = ["arch"]

    # ---- frontend -------------------------------------------------------
    rect(0, y, 1500, 190, stroke=BLUE, bg=BLUE_BG, g=g)
    txt("Browser  ·  React SPA (Vite)", 30, y + 24, size=24, color=BLUE, g=g)
    pill(1310, y + 26, "PRANAV", stroke=BLUE, bg=NONE, size=12, g=g)
    txt("shadcn/ui  ·  Tailwind  ·  TanStack Query  ·  Recharts  ·  react-hook-form + zod",
        30, y + 66, size=14, color=MUTED, g=g)
    line([(30, y + 100), (1470, y + 100)], color=BLUE, op=40, g=g)
    cx = 30
    for item in ["Employees", "Contracts", "Attendance", "Time Off", "Payroll", "Reports"]:
        cx += pill(cx, y + 118, item, stroke=BLUE, bg=NONE, size=13, g=g) + 10

    arrow([(750, y + 190), (750, y + 268)], color=MUTED, sw=2, g=g)
    txt("REST  /api/v1   ·   JWT Bearer", 776, y + 200, size=14, color=INK, g=g)
    txt("TS client generated from openapi.json", 776, y + 224, size=13, color=SOFT, g=g)

    # ---- backend --------------------------------------------------------
    by = y + 268
    rect(0, by, 1500, 440, stroke=VIO, bg=VIO_BG, g=g)
    txt("FastAPI", 30, by + 22, size=24, color=VIO, g=g)
    pill(1312, by + 24, "ADITYA", stroke=VIO, bg=NONE, size=12, g=g)

    rect(30, by + 66, 1440, 74, stroke=VIO, bg="#ffffff", g=g)
    txt("API layer", 50, by + 78, size=16, color=VIO, g=g)
    txt("routers  ·  Pydantic schemas  ·  RBAC dependency  ·  RFC-7807 errors",
        50, y + 268 + 102, size=13, color=MUTED, g=g)

    rect(30, by + 152, 1440, 168, stroke=VIO, bg="#ffffff", g=g, sw=2)
    txt("Service layer", 50, by + 164, size=16, color=VIO, g=g)
    txt("ALL business logic lives here", 190, by + 167, size=13, color=SOFT, g=g)
    svc = ["contract_resolver", "schedule_calc", "leave_engine", "attendance_service",
           "payroll_engine", "formula (sandbox)", "warnings", "pdf", "mailer", "dashboard"]
    for i, s in enumerate(svc):
        c, r = i % 5, i // 5
        sx = 50 + c * 282
        rect(sx, by + 196 + r * 52, 262, 40, stroke=VIO, bg=VIO_BG, g=g)
        centered(s, sx, by + 206 + r * 52, 262, size=13, color=VIO, fam=CODE, g=g)

    rect(30, by + 332, 1440, 74, stroke=VIO, bg="#ffffff", g=g)
    txt("Data layer", 50, by + 344, size=16, color=VIO, g=g)
    txt("SQLAlchemy 2.0 ORM  ·  Alembic migrations  ·  Numeric(12,2) money",
        50, by + 368, size=13, color=MUTED, g=g)

    # ---- stores ---------------------------------------------------------
    ly = by + 440
    leaves = [("PostgreSQL 16", "23 tables · btree_gist", GRN, GRN_BG),
              ("WeasyPrint", "payslip PDF · Jinja2", TEA, TEA_BG),
              ("MailHog  :8025", "captured SMTP inbox", TEA, TEA_BG)]
    for i, (t, s, col, bg) in enumerate(leaves):
        lx = i * 520
        arrow([(750, ly), (lx + 230, ly + 62)], color=MUTED,
              dash="dashed" if i == 2 else None, g=g)
        node(lx, ly + 62, 460, 92, t, s, stroke=col, bg=bg, size=19, g=g)

    # ---- notes column A --------------------------------------------------
    nx, ny = 1660, y + 6
    ny += sticky(nx, ny, 840, "DELIBERATELY EXCLUDED", [
        "Celery / Redis - BackgroundTasks covers bulk email",
        "Microservices, event bus, GraphQL - wrong complexity for 48 h",
        "Every hour spent here is an hour off the payroll engine",
    ]) + 62
    ny += sticky(nx, ny, 840, "TWO NON-OBVIOUS CALLS", [
        "MailHog in Compose - judges watch 30 payslip emails land,",
        "  with zero deliverability risk. A .env switch points at real SMTP.",
        "WeasyPrint runs in the Linux container, never on Windows.",
        "  GTK on Win 11 is a real time sink. Fallback: fpdf2.",
    ]) + 62
    ny += sticky(nx, ny, 840, "CONTRACT-FIRST WORKING AGREEMENT", [
        "Hour 0-2: schemas written, every router stubbed with fixtures.",
        "openapi.json is the single source of truth; Pranav generates",
        "  the TS client and builds against MSW mocks from those types.",
        "Result: the frontend is never blocked on backend logic - the",
        "  most common two-person hackathon failure, removed by design.",
    ], accent=GRN, bg=GRN_BG) + 62

    rect(nx, ny, 840, 292, stroke=INK, bg=SURF)
    txt("SCALE, SIZED FOR THE BRIEF", nx + 26, ny + 22, size=13, color=INK)
    line([(nx + 26, ny + 48), (nx + 814, ny + 48)], color=HAIR, op=60)
    txt("500 employees  x  1 monthly payrun\n= 500 payslips  x  ~12 lines  =  6,000 rows\ntarget: compute under 5 seconds",
        nx + 26, ny + 64, size=14, color=INK, fam=CODE)
    para("The naive version does 500 x 4 queries and crawls. Pre-load in 3 bulk queries "
         "keyed into dicts before the loop, then bulk_save_objects for the lines.",
         nx + 26, ny + 146, 788, size=14, color=MUTED)
    txt("indexes: contract(employee,state,dates) · attendance(employee,check_in)\n"
        "         time_off_request(employee,state,from) · payslip(payrun)",
        nx + 26, ny + 224, size=12, color=SOFT, fam=CODE)

    # ---- notes column B --------------------------------------------------
    bx, by2 = 2560, y + 6
    rect(bx, by2, 840, 232, stroke=INK, bg=SURF)
    txt("OWNERSHIP BOUNDARY", bx + 26, by2 + 22, size=13, color=INK)
    line([(bx + 26, by2 + 48), (bx + 814, by2 + 48)], color=HAIR, op=60)
    para("Aditya owns backend/ and openapi.json. Pranav owns frontend/src/. "
         "Neither edits the other's tree.", bx + 26, by2 + 64, 788, size=15, color=MUTED)
    para("Any contract change is one appended line in docs/api-contract.md plus a ping. "
         "No silent drift, no merge archaeology at hour 30.",
         bx + 26, by2 + 128, 788, size=15, color=MUTED)
    txt("openapi.json  =  the only interface that exists", bx + 26, by2 + 196,
        size=14, color=GRN, fam=CODE)

    ay = by2 + 272
    api = [
        ("AUTH", "POST /auth/login · /refresh   ·   GET /auth/me"),
        ("MASTER", "/employees ?q&department&status&type   · POST · PATCH\n"
                   "/employees/{id}/summary   -> smart-button counts, ONE call\n"
                   "/departments · /job-positions · /working-schedules\n"
                   "/contracts ?employee&state&active_on   ·  /contracts/active"),
        ("TIME", "/attendances ?employee&range&status\n"
                 "POST /attendances/check-in · /check-out\n"
                 "PATCH /attendances/{id}  HR_MANAGER+  sets is_manual_edit"),
        ("LEAVE", "/time-off/types · /allocations · /requests\n"
                  "POST .../{id}/approve · /refuse\n"
                  "GET /time-off/balances ?employee_id"),
        ("CONFIG", "/salary-structures · /salary-rules\n"
                   "POST /salary-structures/{id}/reorder     drag to reorder\n"
                   "POST /salary-rules/validate-formula      dry-run the sandbox"),
        ("PAYRUN", "POST /payruns/eligible-employees    STEP 1 - creates NOTHING\n"
                   "POST /payruns                       STEP 2 - creates the batch\n"
                   "POST /payruns/{id}/compute · /validate · /mark-paid\n"
                   "POST /payruns/{id}/send-payslips"),
        ("PAYSLIP", "/payslips ?payrun&employee · /{id} · /{id}/pdf · /recompute"),
        ("DASHBOARD", "GET /dashboard ?period&department&type    one round trip"),
    ]
    rows_n = sum(len(v.split("\n")) for _, v in api)
    ah = 74 + rows_n * 15 * LH + len(api) * 10 + 46
    rect(bx, ay, 840, ah, stroke=VIO, bg=VIO_BG)
    txt("API SURFACE  ·  /api/v1", bx + 26, ay + 22, size=13, color=VIO)
    txt("openapi.json is generated from these, and is the contract",
        bx + 26, ay + 44, size=12, color=SOFT)
    line([(bx + 26, ay + 66), (bx + 814, ay + 66)], color=VIO, op=40)
    ry2 = ay + 80
    for group, body in api:
        txt(group, bx + 26, ry2, size=11, color=VIO)
        txt(body, bx + 140, ry2 - 2, size=12, color=INK, fam=CODE)
        ry2 += len(body.split("\n")) * 15 * LH + 10
    txt("errors: RFC-7807 {code, message, field_errors[]}   ·   lists always paginate",
        bx + 26, ry2 + 6, size=12, color=SOFT)
    return max(ly + 62 + 92, ay + ah, ny + 292) + 110


# ===================================================== 03 · DATA MODEL =====
def data_model(y):
    section(0, y, "03", "Data model",
            "23 tables. The Employee is the hub and everything else hangs off it. "
            "Three tables carry logic the rest of the system trusts - those are marked.")
    y += 150
    g = ["dm"]

    def tbl(x, ty, w, h, name, sub, col, bg, marked=False):
        rect(x, ty, w, h, stroke=col, bg=bg, g=g, sw=2 if marked else 1)
        centered(name, x, ty + 14, w, size=16, color=col, fam=CODE, g=g)
        centered(sub, x, ty + 38, w, size=12, color=MUTED, g=g)
        if marked:
            ellipse(x + w - 26, ty - 8, 18, 18, stroke=AMB, bg=AMB_F, g=g)

    C1, C2, C3, C4, C5, C6 = 0, 400, 800, 1200, 1600, 2000
    TW_ = 320
    hub_y = y + 150

    txt("IDENTITY & ORG", C1, y, size=11, color=SOFT, g=g)
    tbl(C1, y + 20, TW_, 66, "user", "role · email · password_hash", INK, SURF)
    tbl(C1, y + 106, TW_, 66, "department", "name · manager", INK, SURF)
    tbl(C1, y + 192, TW_, 66, "job_position", "title · department", INK, SURF)

    txt("THE HUB", C2, y, size=11, color=SOFT, g=g)
    rect(C2, hub_y - 130, TW_, 240, stroke=GRN, bg=GRN_BG, g=g, sw=2)
    centered("EMPLOYEE", C2, hub_y - 106, TW_, size=24, color=GRN, g=g)
    centered("the operational hub", C2, hub_y - 72, TW_, size=13, color=MUTED, g=g)
    line([(C2 + 30, hub_y - 44), (C2 + TW_ - 30, hub_y - 44)], color=GRN, op=40, g=g)
    txt("name · employee_type · department\njob_position · working_schedule\nbank_account · ifsc · manager",
        C2 + 30, hub_y - 30, size=12, color=MUTED, fam=CODE, g=g)

    txt("TIME", C3, y, size=11, color=SOFT, g=g)
    tbl(C3, y + 20, TW_, 66, "working_schedule", "hours_per_week = COMPUTED", AMB, AMB_BG, True)
    tbl(C3, y + 106, TW_, 66, "working_schedule_line", "day · start · end · break", INK, SURF)
    tbl(C3, y + 192, TW_, 66, "attendance", "check_in · check_out · status", INK, SURF)

    txt("LEAVE", C4, y, size=11, color=SOFT, g=g)
    tbl(C4, y + 20, TW_, 66, "time_off_type", "unit · affects_payroll", INK, SURF)
    tbl(C4, y + 106, TW_, 66, "leave_allocation", "allocated · validity range", INK, SURF)
    tbl(C4, y + 192, TW_, 66, "time_off_request", "consumes the allocation", INK, SURF)

    txt("CONTRACT & PAY CONFIG", C5, y, size=11, color=SOFT, g=g)
    tbl(C5, y + 20, TW_, 66, "contract", "wage · period · state", AMB, AMB_BG, True)
    tbl(C5, y + 106, TW_, 66, "salary_structure", "the rule set", INK, SURF)
    tbl(C5, y + 192, TW_, 66, "salary_rule", "sequence · amount_type", AMB, AMB_BG, True)

    txt("PAYROLL OUTPUT", C6, y, size=11, color=SOFT, g=g)
    tbl(C6, y + 20, TW_, 66, "payrun", "period · state", VIO, VIO_BG)
    tbl(C6, y + 106, TW_, 66, "payslip", "gross · net · worked_days", VIO, VIO_BG)
    tbl(C6, y + 192, TW_, 66, "payslip_line", "rule · quantity · amount", VIO, VIO_BG)
    tbl(C6, y + 278, TW_, 66, "payroll_warning", "severity · code · resolved", RED, RED_BG)

    # relations
    arrow([(C1 + TW_, y + 53), (C2, hub_y - 60)], color=SOFT, g=g, tail="dot")
    txt("1:1", C1 + TW_ + 26, y + 40, size=12, color=SOFT, g=g)
    arrow([(C1 + TW_, y + 139), (C2, hub_y - 20)], color=SOFT, g=g)
    arrow([(C1 + TW_, y + 225), (C2, hub_y + 20)], color=SOFT, g=g)
    for ty in (y + 53, y + 225):
        arrow([(C2 + TW_, hub_y - 40 if ty < y + 100 else hub_y + 40), (C3, ty)], color=SOFT, g=g)
    arrow([(C3 + TW_ / 2, y + 86), (C3 + TW_ / 2, y + 106)], color=AMB, sw=2, g=g)
    txt("1:N  computes", C3 + TW_ / 2 + 12, y + 84, size=11, color=AMB, g=g)
    arrow([(C2 + TW_, hub_y + 70), (C4, y + 225)], color=SOFT, g=g)
    arrow([(C4 + TW_ / 2 - 60, y + 192), (C4 + TW_ / 2 - 60, y + 172)], color=GRN, sw=2, g=g)
    txt("consumes", C4 + TW_ / 2 - 50, y + 172, size=11, color=GRN, g=g)
    arrow([(C4 + TW_, y + 53), (C4 + TW_ + 40, y + 53), (C4 + TW_ + 40, y + 225), (C4 + TW_, y + 225)],
          color=SOFT, g=g, op=60)
    arrow([(C2 + TW_, hub_y - 100), (C5, y + 53)], color=AMB, sw=2, g=g)
    arrow([(C5 + TW_ / 2, y + 172), (C5 + TW_ / 2, y + 192)], color=SOFT, g=g)
    txt("1:N  ordered", C5 + TW_ / 2 + 12, y + 170, size=11, color=AMB, g=g)
    arrow([(C5 + TW_, y + 139), (C6, y + 53)], color=SOFT, g=g)
    arrow([(C6 + TW_ / 2, y + 86), (C6 + TW_ / 2, y + 106)], color=VIO, g=g)
    arrow([(C6 + TW_ / 2, y + 172), (C6 + TW_ / 2, y + 192)], color=VIO, g=g)
    arrow([(C6, y + 139), (C6 - 40, y + 139), (C6 - 40, y + 311), (C6, y + 311)],
          color=RED, g=g, op=70)

    # notes
    nx = 2450
    txt("TABLES THAT CARRY THE HARD LOGIC", nx, y, size=13, color=AMB, g=g)
    rect(nx, y + 24, 950, 366, stroke=AMB, bg=AMB_BG, g=g)
    ny = y + 46
    for name, body in [
        ("working_schedule",
         "hours_per_week is read-only and recalculated from its lines on every write."),
        ("contract",
         "state in DRAFT / RUNNING / EXPIRED / CANCELLED, date_end nullable. Overlap is "
         "blocked by the database, not by a service check:"),
        ("salary_rule",
         "sequence, condition, amount_type and formula - the entire engine is configuration, "
         "so a judge editing HRA 40% -> 50% moves net pay."),
    ]:
        txt(name, nx + 24, ny, size=15, color=INK, fam=CODE, g=g)
        ny = para(body, nx + 24, ny + 24, 902, size=13, color=MUTED, g=g) + 12
    rect(nx + 24, ny - 4, 902, 92, stroke=GRN, bg="#ffffff", g=g)
    txt("EXCLUDE USING gist (\n  employee_id WITH =,\n  daterange(date_start, COALESCE(date_end,'infinity'),'[]') WITH &&\n) WHERE (state = 'RUNNING')",
        nx + 40, ny + 8, size=11, color=GRN, fam=CODE, g=g)
    return y + 420


# ================================================== 04 · PAYROLL ENGINE ====
def engine(y):
    section(0, y, "04", "The payroll engine",
            "Built at hour 10 with unit tests, not at hour 30. Five steps, per employee, "
            "per payrun - step 4 is the whole point of the brief.")
    y += 150
    g = ["eng"]
    steps = [
        ("RESOLVE CONTRACT",
         "The one RUNNING contract whose range covers the period.",
         "0 rows  -> NO_ACTIVE_CONTRACT (ERROR), skip\n2+ rows -> OVERLAPPING_CONTRACTS\n           (the DB makes this near-impossible)"),
        ("COMPUTE TIME BASIS",
         "Schedule intersected with the period, then reality on top.",
         "scheduled_days from the weekday pattern\nworked / overtime hours from attendance\nworked_days = scheduled - unpaid_leave"),
        ("BUILD EVAL CONTEXT",
         "A frozen dict - the only thing a formula can see.",
         "contract.wage · hours_per_week\nworked_days · scheduled_days · overtime_hours\nrules.<CODE> · categories.<CAT>\nhelpers: min max round abs"),
        ("EVALUATE RULES",
         "ORDER BY sequence ASC. Two write-backs make it compound.",
         "if condition fails -> skip\namount = FIXED | PERCENTAGE | FORMULA\nrules[code]        = amount\ncategories[cat]  += amount"),
        ("FINALIZE",
         "Totals fall out of the category running totals.",
         "basic / gross / deductions / net\nrun the warning checks\npersist lines + warnings together"),
    ]
    cw, gap = 620, 70
    h = max(74 + measure(l, cw - 44, 13)[2] + 28 + len(d.split("\n")) * 12 * LH + 26
            for _, l, d in steps)
    for i, (title, lead, detail) in enumerate(steps):
        x = i * (cw + gap)
        accent = AMB if i == 3 else INK
        rect(x, y, cw, h, stroke=accent, bg=AMB_BG if i == 3 else SURF, g=g,
             sw=2 if i == 3 else 1)
        ellipse(x + 22, y + 22, 32, 32, stroke=accent, bg="#ffffff", g=g)
        centered(str(i + 1), x + 22, y + 29, 32, size=15, color=accent, g=g)
        txt(title, x + 68, y + 24, size=18, color=accent, g=g)
        by = para(lead, x + 22, y + 74, cw - 44, size=13, color=MUTED, g=g)
        line([(x + 22, by + 12), (x + cw - 22, by + 12)], color=HAIR, op=60, g=g)
        txt(detail, x + 22, by + 28, size=12, color=INK, fam=CODE, g=g)
        if i < 4:
            arrow([(x + cw + 10, y + h / 2), (x + cw + gap - 10, y + h / 2)],
                  color=SOFT, sw=2, g=g)
    txt("this is where 'rules are processed in a specific sequence' becomes literally true",
        3 * (cw + gap), y + h + 14, size=13, color=AMB, g=g)

    # ---- seeded rule set ------------------------------------------------
    ty = y + h + 70
    txt("SEEDED RULE SET  ·  Indian payroll  ·  seeded as rows, fully editable",
        0, ty, size=13, color=INK)
    rows = [
        ("10", "BASIC", "BASIC", "contract.wage * worked_days / scheduled_days"),
        ("20", "HRA", "ALLOWANCE", "40% of BASIC"),
        ("30", "DA", "ALLOWANCE", "20% of BASIC"),
        ("40", "CONV", "ALLOWANCE", "fixed 1600"),
        ("50", "SPECIAL", "ALLOWANCE", "max(0, wage - BASIC - HRA - DA - CONV)"),
        ("60", "OT", "ALLOWANCE", "overtime_hours * (BASIC/(scheduled_days*8)) * 1.5"),
        ("100", "GROSS", "GROSS", "categories.BASIC + categories.ALLOWANCE"),
        ("110", "PF", "DEDUCTION", "min(BASIC, 15000) * 0.12"),
        ("120", "PT", "DEDUCTION", "200 if GROSS > 21000 else 0"),
        ("130", "TDS", "DEDUCTION", "max(0, (GROSS*12 - 500000) * 0.05 / 12)"),
        ("140", "LWP", "DEDUCTION", "wage / scheduled_days * unpaid_leave_days"),
        ("200", "NET", "NET", "categories.GROSS - categories.DEDUCTION"),
    ]
    colours = {4: AMB, 11: AMB}
    table(0, ty + 26, ["SEQ", "CODE", "CATEGORY", "COMPUTATION"],
          [90, 180, 220, 830], rows, row_h=30, head_h=34, fs=13,
          mono=(1, 3), rowcolors=colours)
    txt("SPECIAL and NET back-reference earlier results - ordered evaluation, visible on screen",
        0, ty + 26 + 34 + 12 * 30 + 12, size=13, color=AMB)

    # ---- sandbox --------------------------------------------------------
    sx = 1420
    rect(sx, ty + 26, 940, 394, stroke=RED, bg=RED_BG)
    txt("FORMULA SANDBOX", sx + 26, ty + 48, size=13, color=RED)
    txt("services/formula.py", sx + 26, ty + 72, size=20, color=INK, fam=CODE)
    para("eval() on user-entered strings is a real vulnerability, and a judge will ask. "
         "Parse with ast.parse(expr, mode='eval'), then walk the tree and reject any node "
         "that is not on the allowlist.", sx + 26, ty + 106, 888, size=14, color=MUTED)
    txt("ALLOWED", sx + 26, ty + 188, size=11, color=GRN)
    txt("Expression · BinOp · UnaryOp · BoolOp · Compare\nIfExp · Constant · Name(load)\nCall - allowlisted functions only\nAttribute - allowlisted namespaces only",
        sx + 26, ty + 208, size=12, color=INK, fam=CODE)
    txt("REJECTED", sx + 500, ty + 188, size=11, color=RED)
    txt("Import · Lambda · Subscript · comprehensions\nAttribute on arbitrary objects · dunder access\n__import__ · open · exec\nevaluated with __builtins__ = {}",
        sx + 500, ty + 208, size=12, color=RED, fam=CODE)
    line([(sx + 26, ty + 320), (sx + 914, ty + 320)], color=RED, op=40)
    para("Errors are caught per rule: the line records amount = 0 plus a RULE_EVAL_FAILED "
         "warning, so one bad formula never kills a whole payrun.",
         sx + 26, ty + 336, 888, size=14, color=INK)

    sticky(2420, ty + 52, 980, "THE LINE THAT DECIDES THE SCORE", [
        "'Implement business rules in application logic rather than",
        "  using hardcoded values.'",
        "A judge tests it by editing HRA 40% -> 50%, hitting Compute,",
        "  and watching net salary move.",
        "If that works we pass. If HRA is a constant in payroll_engine.py",
        "  we fail regardless of how the UI looks.",
        "Build requirement: the seeded set must be deletable. Demo beat -",
        "  delete a rule, recompute, watch the payslip line vanish.",
    ], accent=RED, bg=RED_BG)
    return ty + 26 + 394 + 110


# ================================================ 05 · PAYRUN LIFECYCLE ====
def lifecycle(y):
    section(0, y, "05", "Payrun lifecycle & the warning gates",
            "State transitions are gated in the service layer, never in the router. "
            "This is also the demo's best beat: the system stops you before you pay "
            "someone wrong.")
    y += 150
    g = ["lc"]
    states = [("DRAFT", "payslips created", INK, SURF),
              ("COMPUTED", "lines + warnings", BLUE, BLUE_BG),
              ("VALIDATED", "locked for edit", VIO, VIO_BG),
              ("PAID", "historical record", GRN, GRN_BG),
              ("SENT", "PDFs delivered", TEA, TEA_BG)]
    actions = [("Compute", "idempotent - deletes and\nregenerates inside the txn", None),
               ("Validate", "refuses on any ERROR warning", RED),
               ("Mark Paid", "refuses on unresolved\nMISSING_BANK_DETAILS", RED),
               ("Send Payslips", "BackgroundTasks - bulk\nPDF + email", None)]
    nw, gap = 300, 420
    for i, (s, sub, col, bg) in enumerate(states):
        x = i * (nw + gap)
        node(x, y, nw, 96, s, sub, stroke=col, bg=bg, size=22, g=g, sw=2)
        if i < 4:
            label, note, gate = actions[i]
            arrow([(x + nw + 30, y + 48), (x + nw + gap - 30, y + 48)],
                  color=RED if gate else SOFT, sw=2, g=g,
                  dash="dashed" if i == 3 else None)
            centered(label, x + nw, y + 12, gap, size=16, color=gate or INK, g=g)
            centered(note, x + nw, y + 62, gap, size=12, color=MUTED, g=g)
            if gate:
                ellipse(x + nw + gap / 2 - 11, y + 37, 22, 22, stroke=RED, bg=RED_BG, g=g)
                centered("!", x + nw + gap / 2 - 11, y + 41, 22, size=14, color=RED, g=g)
    txt("finalized payruns are immutable - the spec calls them historical records",
        3 * (nw + gap), y + 118, size=13, color=GRN, g=g)

    ty = y + 170
    txt("WARNINGS ENGINE  ·  persisted at compute time, read by both the payrun screen and the dashboard",
        0, ty, size=13, color=INK)
    rows = [
        ("NO_ACTIVE_CONTRACT", "ERROR", "validate", "no RUNNING contract covers the period"),
        ("OVERLAPPING_CONTRACTS", "ERROR", "validate", "more than one contract matches"),
        ("DUPLICATE_PAYSLIP", "ERROR", "validate", "employee already paid for an overlapping period"),
        ("NEGATIVE_NET", "ERROR", "validate", "net < 0"),
        ("NO_STRUCTURE_RULES", "ERROR", "compute", "structure has no active rules"),
        ("MISSING_BANK_DETAILS", "WARNING", "mark-paid", "bank account or IFSC empty"),
        ("RULE_EVAL_FAILED", "WARNING", "-", "a formula threw inside the sandbox"),
        ("MISSING_CHECKOUT", "WARNING", "-", "attendance rows with a null check_out"),
        ("LEAVE_EXCEEDS_ALLOCATION", "WARNING", "-", "approved leave beyond the balance"),
        ("CONTRACT_EXPIRING", "INFO", "-", "contract ends within 30 days of period end"),
    ]
    cols = {i: (RED if r[1] == "ERROR" else (AMB if r[1] == "WARNING" else BLUE))
            for i, r in enumerate(rows)}
    table(0, ty + 26, ["CODE", "SEVERITY", "BLOCKS", "TRIGGER"],
          [400, 170, 180, 720], rows, row_h=30, head_h=34, fs=13,
          mono=(0,), rowcolors=cols)

    nx = 1620
    rect(nx, ty + 26, 900, 374, stroke=GRN, bg=GRN_BG)
    txt("THE DEMO BEAT", nx + 26, ty + 48, size=13, color=GRN)
    para("Compute a payrun. Three employees come back with MISSING_BANK_DETAILS. "
         "Press Validate - it goes through. Press Mark Paid - it refuses, by name, "
         "with the three employees listed.",
         nx + 26, ty + 76, 848, size=15, color=INK)
    para("Fix one record, recompute, mark paid. The room understands in ten seconds "
         "that the rules are real and enforced server-side.",
         nx + 26, ty + 190, 848, size=15, color=MUTED)
    txt("POST /payruns/{id}/mark-paid   ->   409  MISSING_BANK_DETAILS",
        nx + 26, ty + 300, size=13, color=GRN, fam=CODE)
    txt("?force=true  overrides, and says so in the audit trail",
        nx + 26, ty + 330, size=13, color=SOFT, fam=CODE)

    sticky(2600, ty + 52, 800, "CONCURRENCY", [
        "One transaction per payrun.",
        "SELECT ... FOR UPDATE on the payrun row, so a",
        "  double-clicked Compute cannot run twice.",
        "UNIQUE (payrun_id, employee_id) on payslip.",
        "500 employees = 3 bulk queries, not 2000. No N+1.",
        "Target: compute under 5 seconds.",
    ], accent=VIO, bg=VIO_BG)
    return ty + 26 + 374 + 110


# ============================================ 06 · IA & DEMO SCENARIOS =====
def flows(y):
    section(0, y, "06", "Navigation & the two demo scenarios",
            "Six nav items, role-gated. Everything a judge needs to see happens inside "
            "two end-to-end runs that take five minutes together.")
    y += 150
    g = ["ia"]
    nav = [
        ("Employees", BLUE, ["Kanban + List", "Employee form", "Smart buttons"]),
        ("Contracts", BLUE, ["List by employee", "Period + wage", "Active highlighted"]),
        ("Attendance", BLUE, ["Daily list", "Check in / out", "Manual correction"]),
        ("Time Off", GRN, ["Requests", "Allocations", "Types", "Balances"]),
        ("Payroll", VIO, ["Payruns", "New payrun wizard", "Payslips", "Structures & rules"]),
        ("Reports", AMB, ["Dashboard", "KPIs + charts", "Alerts panel"]),
    ]
    cw, gap = 540, 32
    for i, (name, col, items) in enumerate(nav):
        x = i * (cw + gap)
        rect(x, y, cw, 216, stroke=col, bg=SURF)
        rect(x, y, cw, 46, stroke=col, bg=col.replace(col, {BLUE: BLUE_BG, GRN: GRN_BG,
             VIO: VIO_BG, AMB: AMB_BG}[col]))
        centered(name, x, y + 12, cw, size=19, color=col)
        for j, it in enumerate(items):
            txt("·  " + it, x + 26, y + 66 + j * 30, size=14, color=MUTED)

    # scenario rails
    def rail(ry, tag, title, steps, accent, callout=None):
        pill(0, ry, tag, stroke=accent, bg=NONE, size=13)
        txt(title, 128, ry + 2, size=18, color=INK)
        sw, sg = 350, 66
        for i, s in enumerate(steps):
            x = i * (sw + sg)
            node(x, ry + 44, sw, 66, s, stroke=accent, bg=SURF, size=15)
            if i < len(steps) - 1:
                arrow([(x + sw + 12, ry + 77), (x + sw + sg - 12, ry + 77)],
                      color=accent, sw=2)
        if callout:
            idx, text_ = callout
            cx = idx * (sw + sg)
            arrow([(cx + sw / 2, ry + 132), (cx + sw / 2, ry + 156)], color=RED, sw=2)
            rect(cx - 120, ry + 156, 600, 92, stroke=RED, bg=RED_BG)
            para(text_, cx - 100, ry + 174, 560, size=13, color=RED)

    rail(y + 268, "SCENARIO A", "Employee to payslip, end to end",
         ["Employee\n+ schedule", "Contract\nRUNNING", "Wizard step 1\nContinue",
          "Select staff\nCreate Payrun", "Compute", "Validate\nMark Paid",
          "PDF + email"], BLUE,
         callout=(2, "Continue must create NOTHING. Step 1 hits a stateless preview "
                     "endpoint; GET /payruns is checked live on stage to prove it."))
    rail(y + 540, "SCENARIO B", "Allocation to payroll impact",
         ["Time Off Type\nunpaid", "Allocate\n12 days", "Employee asks\n3 days",
          "HR approves", "Balance\n12 -> 9", "Recompute", "LWP line\nNET drops"], GRN)
    return y + 700


# ===================================================== 07 · WIREFRAMES =====
def wireframes(y):
    section(0, y, "07", "Key screens",
            "Drawn in the reference board's language - dark ground, one window per "
            "screen, annotations to the right. These three carry the demo.")
    y += 150
    NAV = ["Employees", "Contracts", "Attendance", "Time Off", "Payroll", "Reports"]

    # ---- 1. wizard step 1 ----------------------------------------------
    g = ["wf1"]
    x, w, h = 0, 1080, 700
    cy = window(x, y, w, h, "New Payrun - step 1 of 2", NAV, "Payroll", g=g)
    txt("New Payrun", x + 28, cy + 22, size=22, color=INK, g=g)
    pill(x + 210, cy + 26, "STEP 1 / 2", stroke=VIO, bg=VIO_BG, size=11, g=g)
    para("Choose the structure and the period. Nothing is written yet.",
         x + 28, cy + 58, 620, size=13, color=SOFT, g=g)
    fy = field(x + 28, cy + 92, 480, "Salary Structure *", "Standard Indian Payroll  v", g=g)
    field(x + 540, cy + 92, 232, "Period start *", "01-09-2026", g=g)
    field(x + 796, cy + 92, 232, "Period end *", "30-09-2026", g=g)
    fy = field(x + 28, fy + 26, 480, "Department", "All departments  v", g=g)
    field(x + 540, fy - 46, 488, "Employee type", "All types  v", g=g)
    line([(x + 28, fy + 30), (x + w - 28, fy + 30)], color=HAIR, op=60, g=g)
    txt("ELIGIBILITY PREVIEW  ·  computed, not persisted", x + 28, fy + 46, size=11,
        color=AMB, g=g)
    ry = rowtable(x + 28, fy + 68, w - 56, ["EMPLOYEE", "DEPARTMENT", "WAGE", "ELIGIBLE"],
                  [320, 300, 220, 180],
                  [["Aarav Mehta", "Engineering", "Rs 78,000", "Yes"],
                   ["Diya Shah", "Engineering", "Rs 92,000", "Yes"],
                   ["Rohan Patel", "Sales", "Rs 54,000", "No contract"],
                   ["Nisha Rao", "Finance", "Rs 61,000", "Yes"],
                   ["Kabir Nair", "Operations", "Rs 47,500", "Yes"]],
                  g=g, badge_col=3, hl=2)
    rect(x + 28, ry + 14, w - 56, 56, stroke=RED, bg=RED_BG, g=g)
    txt("1 of 5 blocked  ·  Rohan Patel has no RUNNING contract covering this period",
        x + 48, ry + 32, size=13, color=RED, g=g)
    button(x + 28, y + h - 60, "Cancel", primary=False, g=g)
    button(x + w - 190, y + h - 60, "Continue  >", g=g)
    txt("1  ·  Payrun wizard, step 1", x, y + h + 18, size=15, color=MUTED)
    txt("The Continue button is a preview call. Nothing exists in the database until step 2.",
        x, y + h + 42, size=13, color=SOFT)

    # ---- 2. payrun processing ------------------------------------------
    g = ["wf2"]
    x = 1160
    cy = window(x, y, w, h, "Payrun  ·  September 2026", NAV, "Payroll", g=g)
    txt("Payrun / SEP-2026", x + 28, cy + 22, size=22, color=INK, g=g)
    pill(x + 300, cy + 26, "COMPUTED", stroke=BLUE, bg=BLUE_BG, size=11, g=g)
    bx = x + 28
    for lbl, prim in [("Compute", True), ("Validate", False), ("Mark Paid", False),
                      ("Send Payslips", False)]:
        bx += button(bx, cy + 62, lbl, primary=prim, g=g) + 12
    kpis = [("Employees", "29"), ("Gross", "Rs 18,42,100"), ("Deductions", "Rs 3,11,480"),
            ("Net payable", "Rs 15,30,620")]
    for i, (k, v) in enumerate(kpis):
        kx = x + 28 + i * 254
        rect(kx, cy + 108, 234, 76, stroke=HAIR, bg=SURF, g=g)
        txt(k, kx + 16, cy + 122, size=11, color=SOFT, g=g)
        txt(v, kx + 16, cy + 142, size=18, color=INK, g=g)
    rect(x + 28, cy + 200, w - 56, 84, stroke=RED, bg=RED_BG, g=g)
    txt("3 warnings block Mark Paid", x + 48, cy + 214, size=15, color=RED, g=g)
    txt("MISSING_BANK_DETAILS  ·  Kabir Nair, Sana Iyer, Vikram Bose\nMISSING_CHECKOUT  ·  4 attendance rows in period",
        x + 48, cy + 238, size=12, color=RED, fam=CODE, g=g)
    ry = rowtable(x + 28, cy + 302, w - 56,
                  ["EMPLOYEE", "WORKED", "GROSS", "NET", "STATE"],
                  [300, 160, 220, 220, 120],
                  [["Aarav Mehta", "21 / 22 d", "Rs 78,000", "Rs 64,910", "Draft"],
                   ["Diya Shah", "22 / 22 d", "Rs 92,000", "Rs 75,340", "Draft"],
                   ["Nisha Rao", "20 / 22 d", "Rs 55,450", "Rs 46,120", "Draft"],
                   ["Kabir Nair", "22 / 22 d", "Rs 47,500", "Rs 40,880", "Draft"],
                   ["Sana Iyer", "19 / 22 d", "Rs 51,300", "Rs 43,010", "Draft"]],
                  g=g, badge_col=4, badge_color=SOFT, hl=3)
    txt("2  ·  Payrun processing", x, y + h + 18, size=15, color=MUTED)
    txt("Warnings are rows, not toasts - the dashboard reads exactly the same table.",
        x, y + h + 42, size=13, color=SOFT)

    # ---- 3. payslip -----------------------------------------------------
    g = ["wf3"]
    x = 2320
    cy = window(x, y, w, h, "Payslip  ·  Aarav Mehta", NAV, "Payroll", g=g)
    txt("Payslip / Aarav Mehta", x + 28, cy + 22, size=22, color=INK, g=g)
    txt("01-09-2026  to  30-09-2026   ·   Contract #C-2024-118   ·   21 / 22 worked days",
        x + 28, cy + 56, size=13, color=SOFT, g=g)
    button(x + w - 200, cy + 22, "Print PDF", primary=False, g=g)
    txt("SALARY COMPUTATION  ·  evaluated in sequence", x + 28, cy + 90, size=11, color=AMB, g=g)
    lines = [("10", "Basic Salary", "BASIC", "74,454.55", INK),
             ("20", "House Rent Allowance", "ALLOWANCE", "29,781.82", INK),
             ("30", "Dearness Allowance", "ALLOWANCE", "14,890.91", INK),
             ("40", "Conveyance", "ALLOWANCE", "1,600.00", INK),
             ("50", "Special Allowance", "ALLOWANCE", "0.00", AMB),
             ("60", "Overtime", "ALLOWANCE", "2,538.00", INK),
             ("100", "Gross Salary", "GROSS", "123,265.28", BLUE),
             ("110", "Provident Fund", "DEDUCTION", "-1,800.00", RED),
             ("120", "Professional Tax", "DEDUCTION", "-200.00", RED),
             ("130", "Income Tax", "DEDUCTION", "-3,318.00", RED),
             ("140", "Unpaid Leave", "DEDUCTION", "-3,545.45", RED),
             ("200", "Net Salary", "NET", "114,401.83", GRN)]
    hy = cy + 112
    line([(x + 28, hy + 22), (x + w - 28, hy + 22)], color=HAIR, op=60, g=g)
    for i, lbl in enumerate(["SEQ", "RULE", "CATEGORY", "AMOUNT"]):
        txt(lbl, x + 28 + [0, 90, 480, 780][i], hy + 2, size=11, color=SOFT, g=g)
    for i, (seq, name, cat, amt, col) in enumerate(lines):
        ly = hy + 34 + i * 32
        if col in (BLUE, GRN):
            rect(x + 20, ly - 4, w - 40, 30, stroke=NONE,
                 bg=BLUE_BG if col == BLUE else GRN_BG, g=g)
        txt(seq, x + 28, ly, size=12, color=SOFT, fam=CODE, g=g)
        txt(name, x + 118, ly, size=13, color=col, g=g)
        txt(cat, x + 508, ly, size=11, color=SOFT, fam=CODE, g=g)
        txt(amt, x + 808, ly, size=13, color=col, fam=CODE, g=g)
    ay = hy + 34 + 12 * 32 + 16
    rect(x + 28, ay, w - 56, 54, stroke=AMB, bg=AMB_BG, g=g)
    txt("SPECIAL resolved to 0.00 because wage was already exhausted by BASIC + HRA + DA + CONV",
        x + 46, ay + 17, size=12, color=AMB, g=g)
    txt("3  ·  Payslip breakdown", x, y + h + 18, size=15, color=MUTED)
    txt("Sequence column is visible on purpose - it is the proof of ordered evaluation.",
        x, y + h + 42, size=13, color=SOFT)

    # ---- 4. dashboard ---------------------------------------------------
    g = ["wf4"]
    dy = y + h + 110
    dw, dh = 2260, 660
    cy = window(0, dy, dw, dh, "Dashboard  ·  live aggregates", NAV, "Reports", g=g)
    txt("Payroll Dashboard", 28, cy + 22, size=22, color=INK, g=g)
    fx = 640
    for lbl in ["Period: Sep 2026  v", "Department: All  v", "Type: All  v"]:
        rect(fx, cy + 20, tw(lbl, 12) + 28, 30, stroke=HAIR, bg=NONE, g=g)
        txt(lbl, fx + 14, cy + 28, size=12, color=MUTED, g=g)
        fx += tw(lbl, 12) + 40
    kpi = [("Total net paid", "Rs 15,30,620", GRN), ("Payslips generated", "29", BLUE),
           ("Average salary", "Rs 52,780", INK), ("Approved time off", "34 days", VIO),
           ("Attendance health", "94%", AMB), ("Headcount", "30", INK)]
    for i, (k, v, c) in enumerate(kpi):
        kx = 28 + i * 368
        rect(kx, cy + 68, 348, 88, stroke=HAIR, bg=SURF, g=g)
        txt(k, kx + 18, cy + 84, size=11, color=SOFT, g=g)
        txt(v, kx + 18, cy + 104, size=24, color=c, g=g)

    # bar chart
    rect(28, cy + 176, 1080, 240, stroke=HAIR, bg=NONE, g=g)
    txt("Salary cost by department", 48, cy + 192, size=15, color=INK, g=g)
    bars = [("Engineering", 200), ("Sales", 140), ("Finance", 96), ("Operations", 118),
            ("Support", 72)]
    for i, (d, v) in enumerate(bars):
        bx = 68 + i * 200
        rect(bx, cy + 380 - v, 96, v, stroke=BLUE, bg=BLUE_F, g=g)
        centered(d, bx - 30, cy + 388, 156, size=11, color=SOFT, g=g)
    line([(52, cy + 380), (1088, cy + 380)], color=HAIR, op=70, g=g)

    # line chart
    rect(1136, cy + 176, 1096, 240, stroke=HAIR, bg=NONE, g=g)
    txt("Monthly net salary trend  ·  last 12 months", 1156, cy + 192, size=15, color=INK, g=g)
    pts = [(1176, 350), (1256, 336), (1336, 344), (1416, 318), (1496, 322),
           (1576, 300), (1656, 288), (1736, 296), (1816, 268), (1896, 262),
           (1976, 244), (2056, 232), (2136, 218)]
    line([(px, cy + py) for px, py in pts], color=GRN, sw=2, g=g)
    for px, py in pts[::3]:
        ellipse(px - 4, cy + py - 4, 8, 8, stroke=GRN, bg=GRN, g=g)
    line([(1160, cy + 380), (2212, cy + 380)], color=HAIR, op=70, g=g)
    txt("history comes from 3 seeded validated payruns - an empty chart on stage reads as broken",
        1156, cy + 388, size=11, color=AMB, g=g)

    # alerts
    rect(28, cy + 436, 2204, 176, stroke=RED, bg=NONE, g=g)
    txt("Alerts  ·  the same payroll_warning rows the payrun screen reads",
        48, cy + 452, size=15, color=INK, g=g)
    alerts = [("ERROR", "Rohan Patel has no RUNNING contract for Sep 2026", RED),
              ("WARNING", "3 employees are missing bank details", AMB),
              ("WARNING", "Leave balance below 2 days for 5 employees", AMB),
              ("INFO", "2 contracts expire within 30 days", BLUE)]
    for i, (sev, msg, c) in enumerate(alerts):
        ay2 = cy + 482 + i * 32
        pill(48, ay2, sev, stroke=c, bg=NONE, size=11, g=g, padx=9)
        txt(msg, 190, ay2 + 3, size=13, color=INK, g=g)
    txt("4  ·  Dashboard", 0, dy + dh + 18, size=15, color=MUTED)
    txt("Every number is a SQL aggregate over live tables. Change a filter and all of it moves.",
        0, dy + dh + 42, size=13, color=SOFT)

    sticky(2360, dy + 34, 1040, "WHAT THE SCREENS HAVE TO PROVE", [
        "Configuration screens are functional and integrated,",
        "  not static mockups - the brief says so twice.",
        "The dashboard reflects real-time live data instead of",
        "  relying on static charts.",
        "Smart buttons show real counts, from one",
        "  /employees/{id}/summary call - not five round trips.",
        "Salary rules actively drive payslip generation.",
    ])
    rect(2360, dy + 300, 1040, 250, stroke=BLUE, bg=BLUE_BG)
    txt("SHARED PRIMITIVES  ·  built once, reused ~15 times", 2386, dy + 322, size=13, color=BLUE)
    line([(2386, dy + 348), (3374, dy + 348)], color=BLUE, op=40)
    prims = ["DataTable", "FormLayout", "StatusBadge", "SmartButtonBar",
             "DateRangePicker", "ConfirmDialog"]
    for i, p in enumerate(prims):
        px, py = 2386 + (i % 3) * 336, dy + 366 + (i // 3) * 52
        rect(px, py, 312, 40, stroke=BLUE, bg="#ffffff")
        centered(p, px, py + 10, 312, size=14, color=BLUE, fam=CODE)
    txt("the highest-leverage five hours in the whole frontend track",
        2386, dy + 486, size=13, color=MUTED)
    return dy + dh + 110


# =========================================================== 08 · RBAC =====
def rbac(y):
    section(0, y, "08", "Role-based access",
            "Five roles, declared once as a matrix in core/rbac.py and enforced by a "
            "single FastAPI dependency.")
    y += 150
    rows = [
        ("Employees", "R  own", "CRUD", "CRUD", "CRUD", "CRUD"),
        ("Contracts", "R  own", "CRUD", "CRUD", "CRUD", "CRUD"),
        ("Working schedules", "R", "CRUD", "CRUD", "CRUD", "CRUD"),
        ("Attendance", "CR  own", "CRUD", "CRUD", "CRUD", "CRUD"),
        ("Time off requests", "CR  own", "CRUD", "CRUD", "CRUD", "CRUD"),
        ("Approve / refuse leave", "-", "yes", "yes", "yes", "yes"),
        ("Leave balances", "R  own", "CRUD", "CRUD", "CRUD", "CRUD"),
        ("Salary structures & rules", "-", "-", "R only", "CRUD", "CRUD"),
        ("Payruns & payslips", "-", "-", "CRU", "CRUD", "CRUD"),
        ("Dashboard", "-", "-", "R", "R", "R"),
        ("User & role management", "-", "-", "-", "-", "CRUD"),
    ]
    table(0, y, ["RESOURCE", "EMPLOYEE", "HR_MANAGER", "HR_PAYROLL_USER",
                 "HR_PAYROLL_MGR", "ADMIN"],
          [420, 220, 220, 280, 280, 180], rows, row_h=32, head_h=38, fs=13, mono=(1, 2, 3, 4, 5))

    nx = 1740
    rect(nx, y, 800, 220, stroke=GRN, bg=GRN_BG)
    txt("ROW-LEVEL SCOPING", nx + 26, y + 22, size=13, color=GRN)
    para("EMPLOYEE requests pass through a shared dependency that injects "
         "WHERE employee_id = current_user.employee_id.",
         nx + 26, y + 50, 748, size=15, color=INK)
    para("Enforced in the service layer, so no router can forget it.",
         nx + 26, y + 140, 748, size=15, color=MUTED)

    sticky(2600, y + 26, 800, "ONE SPEC AMBIGUITY, FLAGGED", [
        "Page 3 gives employees no payroll access and does not",
        "  list payslip viewing. So /payslips stays closed to",
        "  EMPLOYEE; they receive payslips by email instead.",
        "If we would rather they see their own in-app, it is a",
        "  one-line change to the matrix. The strict reading is",
        "  the default because it matches the brief.",
    ])
    return y + 38 + 11 * 32 + 110


# ======================================================= 09 · DELIVERY =====
def delivery(y):
    section(0, y, "09", "Delivery plan",
            "Two tracks, one frozen interface, six hard sync points. The payroll engine "
            "starts at hour 10 because it is the longest pole.")
    y += 150
    PX = 68            # pixels per hour
    rail_y = y + 40
    line([(0, rail_y), (48 * PX, rail_y)], color=HAIR, sw=2)
    gates = [(2, "OpenAPI frozen\nTS client generated"),
             (8, "Auth + Employee CRUD\nwired end to end"),
             (20, "Attendance, Time Off\npayroll config live"),
             (32, "Full payrun path\ncompute to PDF"),
             (40, "Dashboard live\nFEATURE FREEZE"),
             (44, "Stretch only\nRender + Vercel")]
    for h, label in gates:
        gx = h * PX
        line([(gx, rail_y - 16), (gx, rail_y + 300)], color=AMB, dash="dashed", op=55)
        ellipse(gx - 9, rail_y - 9, 18, 18, stroke=AMB, bg=AMB_F)
        txt("T+%dh" % h, gx - 26, rail_y - 46, size=15, color=AMB)
        txt(label, gx + 14, rail_y + 262, size=12, color=MUTED)

    def track(ty, name, colour, bg, blocks):
        txt(name, 0, ty - 26, size=17, color=colour)
        cx = 0
        for code, label, hrs, hot in blocks:
            w = hrs * PX
            rect(cx, ty, w - 6, 74, stroke=RED if hot else colour,
                 bg=RED_BG if hot else bg, sw=2 if hot else 1)
            centered(code, cx, ty + 12, w - 6, size=15, color=RED if hot else colour)
            centered(label, cx, ty + 36, w - 6, size=11, color=MUTED)
            cx += w

    track(rail_y + 60, "ADITYA  ·  backend", VIO, VIO_BG, [
        ("B0", "scaffold + auth", 4, False), ("B1", "employee + schedule", 4, False),
        ("B2", "contract + constraint", 3, False), ("B3", "attendance", 3, False),
        ("B4", "leave engine", 5, False), ("B5", "sandbox + engine", 6, True),
        ("B6", "rule CRUD", 3, False), ("B7", "payrun + warnings", 5, False),
        ("B8", "PDF + email", 3, False), ("B9", "dashboard", 3, False),
        ("B10", "seed", 3, False)])
    track(rail_y + 172, "PRANAV  ·  frontend", BLUE, BLUE_BG, [
        ("F0", "scaffold + auth", 4, False), ("F1", "shared primitives", 5, True),
        ("F2", "employee kanban", 5, False), ("F3", "contracts", 3, False),
        ("F4", "schedule grid", 3, False), ("F5", "attendance", 3, False),
        ("F6", "time off", 5, False), ("F7", "rules + reorder", 4, False),
        ("F8", "payrun wizard", 6, True), ("F9", "dashboard", 5, False)])

    ry = rail_y + 350
    txt("TOP RISKS  ·  each with the mitigation already designed in", 0, ry, size=13, color=INK)
    rows = [
        ("Payroll engine underestimated", "It is the brief's core and the longest pole",
         "Build at hour 10. Unit-test sequencing before any UI touches it."),
        ("Empty dashboard on demo day", "The trend chart needs history",
         "Seed 3 historical validated payruns. Non-negotiable."),
        ("API contract drift", "Two people, one interface",
         "openapi.json is the source of truth; changes logged in api-contract.md."),
        ("eval() as an injection hole", "A judge will ask about this",
         "AST allowlist sandbox, with the rejection list ready to show."),
        ("UI polish eats payroll time", "The classic hackathon death",
         "Feature freeze at T+40h, no exceptions."),
        ("Live demo failure while judging", "Networks, laptops, luck",
         "Local Compose is the primary demo; record a backup video at T+42h."),
    ]
    table(0, ry + 26, ["RISK", "WHY IT BITES", "MITIGATION"],
          [620, 620, 1060], rows, row_h=34, head_h=38, fs=13)
    return ry + 26 + 38 + 6 * 34 + 90


# =========================================================== assemble ======
def main():
    y = 0
    y = cover(y)
    y = hard_parts(y + 60)
    y = architecture(y + 40)
    y = data_model(y + 40)
    y = engine(y + 40)
    y = lifecycle(y + 40)
    y = flows(y + 40)
    y = wireframes(y + 40)
    y = rbac(y + 40)
    y = delivery(y + 40)

    line([(0, y + 20), (W, y + 20)], color=HAIR)
    txt("PeoplePay360  ·  system & product design  ·  next action: git init, Compose, "
        "models + first migration, openapi.json inside two hours",
        0, y + 40, size=15, color=SOFT)

    scene = {
        "type": "excalidraw",
        "version": 2,
        "source": "peoplepay360-design-board",
        "elements": ELS,
        "appState": {
            "gridSize": None,
            "gridStep": 5,
            "gridModeEnabled": False,
            "viewBackgroundColor": "#ffffff",
            "theme": "dark",
        },
        "files": {},
    }
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                       "PeoplePay360-System-Design.excalidraw")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(scene, f, ensure_ascii=False)
    print("elements:", len(ELS))
    print("canvas   : %d x %d" % (W, y + 80))
    print("written  :", out, os.path.getsize(out), "bytes")


if __name__ == "__main__":
    main()
