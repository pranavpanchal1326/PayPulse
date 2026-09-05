/**
 * THE MOCK SELF-TEST — `window.__mocks.selftest()`.
 *
 * P3's exit criteria are claims about *every* endpoint: they all return the
 * right envelope, money is a string everywhere, the role matrix is enforced,
 * the payrun state machine refuses what it should. Clicking through fifty
 * routes to check that by eye is how a contract quietly stops being true.
 *
 * So the handlers are exercised directly. `handler.run({ request })` is MSW's
 * own entry point — the same code path the service worker takes, minus the
 * worker — which means this runs anywhere the module loads, including the
 * embedded browsers and locked-down profiles where a service worker cannot be
 * registered at all. There is no separate test copy of the routing.
 *
 * Run it after touching a handler. It prints one line per failure and a count.
 */
import type { HttpHandler } from "msw";
import { handlers } from "./handlers";
import { reset } from "./db";
import { route, setMockLatency } from "./http";
import { DEMO_PASSWORD } from "./seed/people";

interface Reply {
  status: number;
  body: unknown;
  contentType: string | null;
}

/** The one thing a `Page<T>` must always be. */
const PAGE_KEYS = ["items", "total", "page", "pages", "page_size"];
const ERROR_KEYS = ["code", "message", "field_errors"];
const MONEY = /^-?\d+\.\d{2}$/;

async function call(
  method: string,
  path: string,
  options: { token?: string; body?: unknown; query?: Record<string, string> } = {},
): Promise<Reply> {
  const url = new URL(route(path));
  for (const [k, v] of Object.entries(options.query ?? {})) url.searchParams.set(k, v);

  const headers = new Headers();
  if (options.token) headers.set("Authorization", `Bearer ${options.token}`);
  if (options.body !== undefined) headers.set("Content-Type", "application/json");

  const request = new Request(url, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  for (const handler of handlers as HttpHandler[]) {
    const result = await handler.run({
      request: request.clone() as Parameters<HttpHandler["run"]>[0]["request"],
      requestId: crypto.randomUUID(),
    });
    const response = result?.response;
    if (!response) continue;

    const contentType = response.headers.get("Content-Type");
    const body = contentType?.includes("json")
      ? await response.json()
      : await response.arrayBuffer();
    return { status: response.status, body, contentType };
  }

  return { status: 0, body: null, contentType: null };
}

const signIn = async (email: string): Promise<string> => {
  const reply = await call("POST", "/auth/login", {
    // The constant, not the literal. A second copy of the password is how the
    // mock accounts drifted from `backend/app/db/seed.py` in the first place.
    body: { email, password: DEMO_PASSWORD },
  });
  return (reply.body as { access_token?: string })?.access_token ?? "";
};

/** Every money-shaped key found anywhere in a response, however deep. */
function moneyValues(value: unknown, key = ""): { key: string; value: unknown }[] {
  const MONEY_KEYS = /^(wage|basic|gross|net|amount|rate|total_[a-z_]+|contract_wage)$/;
  if (Array.isArray(value)) return value.flatMap((v) => moneyValues(v, key));
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => moneyValues(v, k));
  }
  return MONEY_KEYS.test(key) && value !== null ? [{ key, value }] : [];
}

export async function runMockSelfTest(): Promise<{ passed: number; failed: number }> {
  const failures: string[] = [];
  let checks = 0;
  const started = performance.now();

  // Hundreds of requests at a tenth of a second each is a minute of nothing.
  const latency = setMockLatency(0);

  const check = (ok: boolean, what: string) => {
    checks++;
    if (!ok) failures.push(what);
  };

  reset();

  const admin = await signIn("admin@paypulse.app");
  const manager = await signIn("payroll.manager@paypulse.app");
  const hr = await signIn("hr.manager@paypulse.app");
  const employee = await signIn("employee@paypulse.app");

  /* ── Auth ──────────────────────────────────────────────────────────── */

  check(admin.length > 0, "admin cannot sign in");

  const wrongPassword = await call("POST", "/auth/login", {
    body: { email: "admin@paypulse.app", password: "nope" },
  });
  const unknownUser = await call("POST", "/auth/login", {
    body: { email: "nobody@paypulse.app", password: "nope" },
  });
  check(
    JSON.stringify(wrongPassword.body) === JSON.stringify(unknownUser.body),
    "wrong password and unknown user answer differently — the form enumerates accounts",
  );

  check((await call("GET", "/auth/me")).status === 401, "/auth/me is readable without a token");

  /* ── Envelopes ─────────────────────────────────────────────────────── */

  const lists = [
    "/employees", "/departments", "/job-positions", "/working-schedules", "/contracts",
    "/attendances", "/time-off/types", "/time-off/allocations", "/time-off/requests",
    "/salary-structures", "/salary-rules", "/payruns", "/payslips",
  ];

  for (const path of lists) {
    const reply = await call("GET", path, { token: admin });
    check(reply.status === 200, `GET ${path} answered ${reply.status}`);
    const body = reply.body as Record<string, unknown>;
    check(
      PAGE_KEYS.every((k) => k in (body ?? {})),
      `GET ${path} is not a Page envelope`,
    );
    check(Array.isArray(body?.items), `GET ${path} has no items array`);
  }

  const missing = await call("GET", "/employees/9999", { token: admin });
  check(missing.status === 404, "a missing employee is not a 404");
  check(
    ERROR_KEYS.every((k) => k in (missing.body as Record<string, unknown>)),
    "a 404 is not an error envelope",
  );

  const badEmployee = await call("POST", "/employees", {
    token: admin,
    body: { full_name: "Test", email: "not-an-email", date_of_joining: "2026-01-01" },
  });
  check(badEmployee.status === 422, "an invalid employee is not a 422");
  check(
    ((badEmployee.body as { field_errors?: unknown[] }).field_errors?.length ?? 0) > 0,
    "a 422 carries no field_errors",
  );

  /* ── Money is a string ─────────────────────────────────────────────── */

  const moneyBearing = ["/contracts", "/payruns", "/payslips", "/salary-rules"];
  for (const path of moneyBearing) {
    const reply = await call("GET", path, { token: admin, query: { page_size: "200" } });
    const bad = moneyValues(reply.body).filter(
      (m) => typeof m.value !== "string" || !MONEY.test(m.value),
    );
    check(bad.length === 0, `${path} has ${bad.length} money values that are not 2dp strings`);
  }

  /* ── Role matrix ───────────────────────────────────────────────────── */

  check(
    (await call("GET", "/payruns", { token: hr })).status === 403,
    "HR_MANAGER can read payruns",
  );
  check(
    (await call("GET", "/dashboard", { token: hr })).status === 403,
    "HR_MANAGER can read the dashboard — rbac.ts and the backend disagree",
  );
  check(
    (await call("GET", "/payslips", { token: employee })).status === 403,
    "EMPLOYEE can read payslips",
  );

  const ownEmployees = await call("GET", "/employees", { token: employee });
  check(
    (ownEmployees.body as { total: number }).total === 1,
    "EMPLOYEE sees more than their own row",
  );

  const someoneElse = await call("GET", "/employees/1", { token: employee });
  check(someoneElse.status === 404, "EMPLOYEE can read another employee's record");

  /* ── The dashboard, and the money it hides ─────────────────────────── */

  const dashboard = await call("GET", "/dashboard", { token: manager });
  check(dashboard.status === 200, "the payroll manager cannot read the dashboard");
  const kpis = (dashboard.body as { kpis: Record<string, unknown> })?.kpis;
  check(typeof kpis?.total_net_paid === "string", "total_net_paid is not a money string");
  check(
    ((dashboard.body as { monthly_net_trend: unknown[] }).monthly_net_trend?.length ?? 0) >= 6,
    "the trend chart has fewer than six points",
  );

  /* ── The two-step wizard ───────────────────────────────────────────── */

  const before = (await call("GET", "/payruns", { token: manager })).body as { total: number };

  /**
   * Asked for the **open period**, because that is where the interesting rows
   * live: the joiner, the leaver, the lapsed contract and the mid-month raise
   * are all placed inside it (PRD §9). A later month resolves to one contract
   * each and would prove nothing.
   */
  const step1 = await call("POST", "/payruns/eligible-employees", {
    token: manager,
    body: { salary_structure_id: 1, period_start: "2026-08-01", period_end: "2026-08-31" },
  });
  check(step1.status === 200, "step 1 of the wizard failed");
  check(Array.isArray(step1.body), "step 1 does not return a flat list");

  const after = (await call("GET", "/payruns", { token: manager })).body as { total: number };
  check(before.total === after.total, "step 1 created a payrun — it must create nothing");

  const rows = (step1.body ?? []) as { eligible: boolean; blockers: string[]; notes: string[] }[];
  check(rows.some((r) => !r.eligible), "nobody is blocked — the ineligible state is undesignable");
  check(
    rows.some((r) => r.notes.includes("MULTI_CONTRACT_PERIOD")),
    "no MULTI_CONTRACT_PERIOD note — the adjacent contract pair is not reaching eligibility",
  );

  check(
    rows.some((r) => r.notes.includes("PRORATED_PERIOD")),
    "nobody is prorated — the joiner and the leaver are not reaching eligibility",
  );

  // The run itself is created for a *later* month, so the self-test never
  // competes with the seeded August payrun the cockpit demo lands on.
  const forSeptember = (await call("POST", "/payruns/eligible-employees", {
    token: manager,
    body: { salary_structure_id: 1, period_start: "2026-09-01", period_end: "2026-09-30" },
  })).body as { employee_id: number; eligible: boolean }[];

  const eligibleIds = forSeptember.filter((r) => r.eligible).map((r) => r.employee_id);

  const created = await call("POST", "/payruns", {
    token: manager,
    body: {
      name: "Self-test run",
      salary_structure_id: 1,
      period_start: "2026-09-01",
      period_end: "2026-09-30",
      employee_ids: eligibleIds,
    },
  });
  check(created.status === 201, `step 2 answered ${created.status}`);

  const run = created.body as { id: number; state: string; payslip_count: number };
  check(run?.state === "DRAFT", "a new payrun is not DRAFT");

  /* ── The state machine ─────────────────────────────────────────────── */

  const tooEarly = await call("POST", `/payruns/${run.id}/validate`, { token: manager });
  check(tooEarly.status === 422, "a DRAFT payrun can be validated without computing");

  const computed = await call("POST", `/payruns/${run.id}/compute`, { token: manager });
  check(computed.status === 200, `compute answered ${computed.status}`);

  const twice = await call("POST", `/payruns/${run.id}/compute`, { token: manager });
  const first = computed.body as { payslip_count: number; total_net: string };
  const second = twice.body as { payslip_count: number; total_net: string };
  check(
    first.payslip_count === second.payslip_count && first.total_net === second.total_net,
    "compute is not idempotent — running it twice changed the payroll",
  );

  const paidTooEarly = await call("POST", `/payruns/${run.id}/mark-paid`, { token: manager });
  check(paidTooEarly.status === 422, "a COMPUTED payrun can be marked paid");

  /* ── The blocked run PRD §9 asks for ───────────────────────────────── */

  const openRun = ((await call("GET", "/payruns", { token: manager })).body as {
    items: { id: number; state: string }[];
  }).items.find((p) => p.state === "COMPUTED" && p.id !== run.id);

  if (!openRun) {
    check(false, "the seeded COMPUTED payrun is missing");
  } else {
    const blocked = await call("POST", `/payruns/${openRun.id}/validate`, { token: manager });
    check(
      blocked.status === 422 &&
        (blocked.body as { code: string }).code === "blocked_by_errors",
      "the seeded payrun with an open ERROR can be validated",
    );
  }

  /* ── The formula sandbox ───────────────────────────────────────────── */

  const good = await call("POST", "/salary-rules/validate-formula", {
    token: manager,
    body: { expression: "round(contract.wage * 0.5 * contract_days / period_days, 2)" },
  });
  check((good.body as { valid: boolean }).valid === true, "a valid formula was rejected");
  check(
    MONEY.test((good.body as { amount: string }).amount ?? ""),
    "a formula amount is not a money string",
  );

  const typo = await call("POST", "/salary-rules/validate-formula", {
    token: manager,
    body: { expression: "contract.waeg * 2" },
  });
  check(typo.status === 200, "an invalid formula is not a 200");
  check((typo.body as { valid: boolean }).valid === false, "a typo passed validation");

  const conditional = await call("POST", "/salary-rules/validate-formula", {
    token: manager,
    body: { expression: "200 if rules.GROSS > 21000 else 0" },
  });
  check(
    (conditional.body as { amount: string }).amount === "200.00",
    "the conditional form of a rule does not evaluate",
  );

  /* ── The PDF ───────────────────────────────────────────────────────── */

  const anyPayslip = ((await call("GET", "/payslips", { token: manager })).body as {
    items: { id: number }[];
  }).items[0];
  const pdf = await call("GET", `/payslips/${anyPayslip.id}/pdf`, { token: manager });
  check(pdf.contentType === "application/pdf", "the payslip PDF is not served as a PDF");
  check(
    new TextDecoder().decode((pdf.body as ArrayBuffer).slice(0, 5)) === "%PDF-",
    "the payslip PDF is not a PDF",
  );

  /* ── Time off ──────────────────────────────────────────────────────── */

  // Friday to Monday on a five-day week is two days, not four (§3.6).
  const filed = await call("POST", "/time-off/requests", {
    token: admin,
    body: {
      employee_id: 18,
      time_off_type_id: 1,
      date_from: "2026-10-02",
      date_to: "2026-10-05",
      reason: "Self-test",
    },
  });
  check(filed.status === 201, `filing a request answered ${filed.status}`);
  check(
    (filed.body as { duration_days: string }).duration_days === "2.00",
    "a Friday-to-Monday request is not two days — the day count ignores the schedule",
  );

  const clash = await call("POST", "/time-off/requests", {
    token: admin,
    body: {
      employee_id: 18,
      time_off_type_id: 1,
      date_from: "2026-10-05",
      date_to: "2026-10-06",
    },
  });
  check(clash.status === 422, "an overlapping leave request was accepted");

  /* ── Contracts: adjacent is legal, overlapping is not ──────────────── */

  const adjacent = await call("POST", "/contracts", {
    token: admin,
    body: {
      employee_id: 18,
      name: "Self-test · adjacent",
      state: "RUNNING",
      date_start: "2027-01-01",
      wage: "60000.00",
      working_schedule_id: 1,
    },
  });
  check(adjacent.status === 409, "a contract overlapping an open-ended one was accepted");

  reset();
  setMockLatency(latency);

  /* ── Report ────────────────────────────────────────────────────────── */

  const elapsed = Math.round(performance.now() - started);

  if (failures.length === 0) {
    console.info(
      `%c[mocks] self-test: ${checks} checks, all passing (${elapsed} ms)`,
      "color:#1a7f4b",
    );
  } else {
    console.error(
      `[mocks] self-test: ${failures.length} of ${checks} checks failed\n  · ` +
        failures.join("\n  · "),
    );
  }

  return { passed: checks - failures.length, failed: failures.length };
}
