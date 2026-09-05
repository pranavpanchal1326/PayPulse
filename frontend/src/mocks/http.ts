/**
 * MOCK TRANSPORT — envelopes, paging, auth and latency.
 *
 * Everything a handler needs in order to be *shaped* like the real API. The
 * P3 exit criteria say lists return `{items, total, page, pages, page_size}`
 * and errors return `{code, message, field_errors}`; those two shapes are
 * constructed here and nowhere else, so a handler cannot invent a third.
 */
import { HttpResponse, type DefaultBodyType } from "msw";
import type { ErrorPayload, Page, PageQuery } from "@/api/contract";
import { can, type Action, type Resource, type Role } from "@/auth/rbac";
import { db } from "./db";
import type { MockUser } from "./seed/people";

/* ── Latency ─────────────────────────────────────────────────────────── */

/**
 * A mock that answers instantly teaches the UI that loading states are
 * optional, and then the first live call proves otherwise on stage. Real
 * latency, kept small enough not to slow the work down.
 *
 * `VITE_MOCK_LATENCY=0` turns it off for anyone running the mocks under a
 * test runner, where a hundred milliseconds a call is the whole suite.
 */
let latency = Number(import.meta.env.VITE_MOCK_LATENCY ?? 120);

/**
 * Turns the delay off for a caller that makes hundreds of requests in a row —
 * `selftest.ts` does, and a tenth of a second each turns a ten-second check
 * into a minute of watching nothing happen. Returns the previous value so the
 * caller can put it back, because leaving latency off would quietly delete the
 * loading states from the rest of the session.
 */
export function setMockLatency(ms: number): number {
  const previous = latency;
  latency = Math.max(0, ms);
  return previous;
}

export const settle = (): Promise<void> =>
  latency > 0
    ? new Promise((resolve) => setTimeout(resolve, latency + Math.random() * latency * 0.5))
    : Promise.resolve();

/* ── Responses ───────────────────────────────────────────────────────── */

export const ok = <T extends DefaultBodyType>(body: T, status = 200) =>
  HttpResponse.json(body, { status });

export const noContent = () => new HttpResponse(null, { status: 204 });

export function fail(
  status: number,
  code: string,
  message: string,
  fieldErrors: ErrorPayload["field_errors"] = [],
) {
  return HttpResponse.json<ErrorPayload>(
    { code, message, field_errors: fieldErrors },
    { status },
  );
}

export const notFound = (what = "That record") =>
  fail(404, "not_found", `${what} no longer exists.`);

export const conflict = (message: string) => fail(409, "conflict", message);

export const businessRule = (code: string, message: string) =>
  fail(422, code, message);

export const validation = (fieldErrors: ErrorPayload["field_errors"]) =>
  fail(422, "validation_error", "Some fields need attention.", fieldErrors);

/* ── Paging ──────────────────────────────────────────────────────────── */

const MAX_PAGE_SIZE = 200;

/** The one place a list envelope is built. Mirrors `common.py::Page.build`. */
export function paginate<T>(items: T[], url: URL): Page<T> {
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
  const requested = Number(url.searchParams.get("page_size") ?? 25) || 25;
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, requested));
  const start = (page - 1) * pageSize;

  return {
    items: items.slice(start, start + pageSize),
    total: items.length,
    page,
    pages: pageSize ? Math.ceil(items.length / pageSize) : 0,
    page_size: pageSize,
  };
}

/** Typed reader for query strings, so handlers stop writing `?? undefined`. */
export function query(url: URL) {
  const get = (key: string): string | undefined => url.searchParams.get(key) ?? undefined;
  return {
    get,
    num: (key: string): number | undefined => {
      const raw = get(key);
      if (raw === undefined || raw === "") return undefined;
      const n = Number(raw);
      return Number.isFinite(n) ? n : undefined;
    },
    bool: (key: string): boolean | undefined => {
      const raw = get(key);
      return raw === undefined ? undefined : raw === "true" || raw === "1";
    },
  };
}

export type QueryReader = ReturnType<typeof query>;

/** `PageQuery` is part of the contract; this proves the reader satisfies it. */
export const pageQueryOf = (url: URL): Required<PageQuery> => {
  const p = paginate([], url);
  return { page: p.page, page_size: p.page_size };
};

/* ── Sessions ────────────────────────────────────────────────────────── */

/**
 * Opaque tokens, not JWTs.
 *
 * The client (`api/client.ts`) never inspects a token — it holds the access
 * token in memory, keeps the refresh token in localStorage, and refreshes on
 * 401. Signing something it does not read would be theatre, and worse than
 * theatre: a hand-rolled JWT in a fixture is a thing somebody eventually tries
 * to verify.
 *
 * Refresh tokens **rotate**, because the real backend rotates `jti` on refresh
 * and the client's single-flight queue exists specifically to survive that. If
 * the mock handed back the same refresh token forever, the one piece of P2 that
 * is hard to get right would never be exercised.
 */
interface Session {
  userId: number;
  issuedAt: number;
}

const accessTokens = new Map<string, Session>();

/**
 * **Refresh tokens outlive the page, because against the real API they do.**
 *
 * `api/client.ts` keeps the refresh token in `localStorage` precisely so a
 * reload can re-mint an access token, and P2 verified that against the
 * backend. Held in a plain `Map`, the mock could not honour it: the module
 * re-initialises on every reload, so the client presented a perfectly valid
 * token to a server that had just forgotten every session it ever issued —
 * and the whole product signed you out on F5.
 *
 * That is not a fixture, so it does not belong in `seed/`; it is session
 * state, and `sessionStorage` is exactly its lifetime — it survives a reload
 * and dies with the tab, which is the closest a mock gets to a server that
 * outlives the page. Rotation is unaffected: the token is still burned on use.
 */
const REFRESH_STORE = "paypulse.mock.refresh";

function loadRefreshTokens(): Map<string, Session> {
  try {
    const raw = sessionStorage.getItem(REFRESH_STORE);
    if (!raw) return new Map();
    return new Map(Object.entries(JSON.parse(raw) as Record<string, Session>));
  } catch {
    // Private mode, or a storage shape from an older build. Start clean.
    return new Map();
  }
}

const refreshTokens = loadRefreshTokens();

function persistRefreshTokens() {
  try {
    sessionStorage.setItem(REFRESH_STORE, JSON.stringify(Object.fromEntries(refreshTokens)));
  } catch {
    /* the session simply will not survive a reload — the same as before */
  }
}

let tokenCounter = 0;
const mint = (kind: string) => `mock.${kind}.${++tokenCounter}.${Date.now().toString(36)}`;

export function issueTokens(user: MockUser) {
  const session: Session = { userId: user.id, issuedAt: Date.now() };
  const access = mint("access");
  const refresh = mint("refresh");
  accessTokens.set(access, session);
  refreshTokens.set(refresh, session);
  persistRefreshTokens();
  return { access_token: access, refresh_token: refresh, token_type: "bearer" };
}

/** Single use: the old token is burned, exactly as rotation implies. */
export function spendRefreshToken(token: string): MockUser | null {
  const session = refreshTokens.get(token);
  if (!session) return null;
  refreshTokens.delete(token);
  persistRefreshTokens();
  return db.users.find((u) => u.id === session.userId) ?? null;
}

/**
 * B12 · REVOCATION — every token the user holds, not just the presented one.
 *
 * The real backend stamps `app_user.tokens_valid_from` and refuses anything
 * issued before it; there are no token records to walk. The mock keeps its
 * sessions in maps, so it achieves the same observable outcome by dropping
 * every entry pointing at the user — which is what the client can actually
 * see: the old refresh token now 401s instead of renewing.
 */
export function revokeTokensFor(userId: number): void {
  for (const [token, session] of accessTokens) {
    if (session.userId === userId) accessTokens.delete(token);
  }
  for (const [token, session] of refreshTokens) {
    if (session.userId === userId) refreshTokens.delete(token);
  }
  persistRefreshTokens();
}

/**
 * Access tokens can be expired on demand: `client.ts` ships an
 * `expireAccess()` debug hook precisely because a 401 is otherwise impossible
 * to provoke on a live session. Against the mocks, that hook sets a token the
 * map has never heard of — which lands here and 401s, so the refresh queue is
 * exercised the same way it is against the real API.
 */
export function userForRequest(request: Request): MockUser | null {
  const header = request.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const session = accessTokens.get(header.slice(7));
  if (!session) return null;
  return db.users.find((u) => u.id === session.userId) ?? null;
}

/* ── Authorisation ───────────────────────────────────────────────────── */

export class Refused {
  constructor(readonly response: Response) {}
}

/**
 * The mock enforces the same matrix the UI reads from, because a mock that
 * lets everything through cannot show the shape of a role. `rbac.ts` is the
 * single copy — imported, never re-stated.
 *
 * Handlers use it as: `const user = auth(request, "payrun", "create"); if
 * (user instanceof Refused) return user.response;`
 */
export function auth(
  request: Request,
  resource?: Resource,
  action: Action = "read",
): MockUser | Refused {
  const user = userForRequest(request);
  if (!user) {
    return new Refused(fail(401, "unauthenticated", "Your session has ended. Sign in again."));
  }
  if (resource && !can(user.role as Role, resource, action)) {
    return new Refused(fail(403, "permission_denied", "Your role does not allow that."));
  }
  return user;
}

/** `EMPLOYEE` sees only its own rows — PRD §6, row-level scoping. */
export const ownScopeId = (user: MockUser): number | null =>
  user.role === "EMPLOYEE" ? user.employee_id : null;

/* ── Routing ─────────────────────────────────────────────────────────── */

/**
 * Handlers are registered against the **absolute** URL the client actually
 * calls, not a relative path.
 *
 * `api/client.ts` builds `VITE_API_BASE_URL + /api/v1 + path`, which in this
 * project is another origin (`http://localhost:8100`). A relative MSW pattern
 * would resolve against the page origin (`:5173`) and match nothing, and the
 * failure mode is a silent pass-through to a server that is not running. One
 * helper, derived from the same env var, removes the class of bug.
 */
const BASE = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000").replace(/\/$/, "");

/** `route("/employees/:id")` → `http://localhost:8100/api/v1/employees/:id`. */
export const route = (path: string): string => `${BASE}/api/v1${path}`;

/** Outside `/api/v1` — only `/healthz` lives there. */
export const rootRoute = (path: string): string => `${BASE}${path}`;

/* ── Bodies ──────────────────────────────────────────────────────────── */

/**
 * A request body as a plain bag. Handlers validate the fields they care about
 * and ignore the rest, which is how FastAPI behaves with an unknown key too.
 */
export async function body(request: Request): Promise<Record<string, unknown>> {
  try {
    const parsed = await request.json();
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;

export const int = (v: unknown): number | undefined => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
};

/**
 * `id` out of `params`, or `NaN` — every `/{id}` route starts here. Typed
 * against MSW's own `PathParams`, where a segment may be absent or repeated.
 */
export const idOf = (
  params: Record<string, string | readonly string[] | undefined>,
): number => {
  const raw = params.id;
  return Number(Array.isArray(raw) ? raw[0] : raw);
};

/* ── Field validation ────────────────────────────────────────────────── */

/**
 * Collects field errors rather than throwing on the first one, because a form
 * that reveals its problems one at a time is the worst kind of form. Mirrors
 * how FastAPI reports a 422: every offending field, in one response.
 */
export class Fields {
  private readonly errors: ErrorPayload["field_errors"] = [];

  require(field: string, value: unknown, message = "This field is required."): this {
    if (value === undefined || value === null || value === "") this.add(field, message);
    return this;
  }

  check(condition: boolean, field: string, message: string): this {
    if (!condition) this.add(field, message);
    return this;
  }

  add(field: string, message: string): this {
    this.errors.push({ field, message });
    return this;
  }

  get failed(): boolean {
    return this.errors.length > 0;
  }

  /** `if (f.failed) return f.response();` */
  response() {
    return validation(this.errors);
  }
}

/* ── Sorting ─────────────────────────────────────────────────────────── */

/** Stable, locale-aware, and `null`s last — the order every list wants. */
export function sortBy<T>(rows: T[], key: (row: T) => string | number | null): T[] {
  return [...rows].sort((a, b) => {
    const x = key(a);
    const y = key(b);
    if (x === null) return y === null ? 0 : 1;
    if (y === null) return -1;
    return typeof x === "number" && typeof y === "number"
      ? x - y
      : String(x).localeCompare(String(y));
  });
}

/** Newest first — payruns, requests, attendance all read this way. */
export const descBy = <T,>(rows: T[], key: (row: T) => string | number): T[] =>
  [...rows].sort((a, b) => (key(b) > key(a) ? 1 : key(b) < key(a) ? -1 : 0));
