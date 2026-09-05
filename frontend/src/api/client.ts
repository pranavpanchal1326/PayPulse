/**
 * THE API CLIENT
 *
 * Token strategy (locked in P2):
 *   - ACCESS token lives in **memory only**. It is never at rest, so a stale
 *     tab or a shared machine cannot leak it.
 *   - REFRESH token lives in localStorage, so a reload does not sign you out.
 *
 * Refresh is **single-flight**: the first 401 starts one refresh, every other
 * in-flight request waits on that same promise and then replays. Without this,
 * a dashboard firing six parallel calls against an expired token produces six
 * concurrent refreshes, five of which race and one of which wins — and the
 * backend rotates `jti` on each, so the losers can invalidate the winner.
 */
import { ApiError, NetworkError, type ErrorEnvelope } from "./errors";

const BASE = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000").replace(/\/$/, "");
const PREFIX = "/api/v1";
const REFRESH_KEY = "paypulse.refresh";

let accessToken: string | null = null;
let refreshInFlight: Promise<string> | null = null;
let onSessionLost: (() => void) | null = null;

/**
 * Bumped every time the access token changes.
 *
 * A single-flight lock alone is not enough: concurrent requests reach their
 * 401s in waves, so wave one refreshes and releases the lock, then wave two —
 * already in flight with the *old* token — 401s and refreshes again. Measured
 * in P2: six concurrent calls produced three refreshes.
 *
 * Comparing the generation a request was sent with against the current one
 * tells a late arrival that somebody has already refreshed, so it should
 * simply replay.
 */
let tokenGeneration = 0;

export const tokens = {
  get access() {
    return accessToken;
  },
  get refresh(): string | null {
    try {
      return localStorage.getItem(REFRESH_KEY);
    } catch {
      return null;
    }
  },
  set(access: string, refresh: string) {
    accessToken = access;
    tokenGeneration++;
    try {
      localStorage.setItem(REFRESH_KEY, refresh);
    } catch {
      /* private mode: the session still works, it just will not survive reload */
    }
  },
  clear() {
    accessToken = null;
    refreshInFlight = null;
    tokenGeneration++;
    try {
      localStorage.removeItem(REFRESH_KEY);
    } catch {
      /* ignore */
    }
  },
  /** The shell registers a handler so a dead session routes back to login. */
  onSessionLost(fn: () => void) {
    onSessionLost = fn;
  },
};

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  /** Endpoints that must not attempt a refresh — login and refresh itself. */
  anonymous?: boolean;
  query?: Record<string, string | number | boolean | undefined | null>;
}

async function parse(res: Response): Promise<unknown> {
  if (res.status === 204) return null;
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function toEnvelope(status: number, body: unknown): ErrorEnvelope {
  if (body && typeof body === "object" && "code" in body && "message" in body) {
    const e = body as Partial<ErrorEnvelope>;
    return {
      code: String(e.code),
      message: String(e.message),
      field_errors: e.field_errors ?? [],
    };
  }
  // A non-envelope failure means a proxy or an unhandled 500 — normalise it so
  // callers never have to branch on shape.
  return { code: "http_error", message: `Request failed (${status})`, field_errors: [] };
}

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const url = new URL(BASE + PREFIX + path);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      // Never put personal data in a query string; these are filters and pages.
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

async function raw(path: string, opts: RequestOptions): Promise<Response> {
  const headers = new Headers(opts.headers);
  if (opts.body !== undefined) headers.set("Content-Type", "application/json");
  if (!opts.anonymous && accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

  try {
    return await fetch(buildUrl(path, opts.query), {
      ...opts,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  } catch (cause) {
    throw new NetworkError(cause);
  }
}

/** Exchanges the refresh token. At most one of these runs at a time. */
function startRefresh(): Promise<string> {
  const token = tokens.refresh;
  if (!token) return Promise.reject(new ApiError(401, {
    code: "unauthenticated", message: "No session.", field_errors: [],
  }));

  return (async () => {
    const res = await raw("/auth/refresh", {
      method: "POST",
      body: { refresh_token: token },
      anonymous: true,
    });
    const body = await parse(res);
    if (!res.ok) {
      tokens.clear();
      onSessionLost?.();
      throw new ApiError(res.status, toEnvelope(res.status, body));
    }
    const pair = body as { access_token: string; refresh_token: string };
    tokens.set(pair.access_token, pair.refresh_token);
    return pair.access_token;
  })();
}

async function refreshOnce(): Promise<string> {
  // Single-flight: everyone awaits the same promise.
  refreshInFlight ??= startRefresh().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const sentWith = tokenGeneration;
  let res = await raw(path, opts);

  if (res.status === 401 && !opts.anonymous && tokens.refresh) {
    try {
      // Only refresh if nobody has already done it while we were in flight.
      if (tokenGeneration === sentWith) await refreshOnce();
      res = await raw(path, opts); // replay exactly once, with the live token
    } catch {
      tokens.clear();
      onSessionLost?.();
    }
  }

  const body = await parse(res);
  if (!res.ok) {
    const envelope = toEnvelope(res.status, body);
    if (res.status === 401) {
      tokens.clear();
      onSessionLost?.();
    }
    throw new ApiError(res.status, envelope);
  }
  return body as T;
}

export const api = {
  get: <T>(path: string, query?: RequestOptions["query"]) =>
    request<T>(path, { method: "GET", query }),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>(path, { ...opts, method: "POST", body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

/**
 * A binary body, with the same auth and the same single-flight refresh.
 *
 * The payslip PDF is the only endpoint in §5 that does not answer JSON, and it
 * still needs a Bearer token — so it cannot be a `window.open` on its URL: a
 * top-level navigation carries no Authorization header and would be refused.
 * The document is fetched here, handed to the browser as an object URL, and
 * the `Content-Disposition` filename the server chose is returned with it.
 */
export async function requestBlob(
  path: string,
  opts: RequestOptions = {},
): Promise<{ blob: Blob; filename: string | undefined }> {
  const sentWith = tokenGeneration;
  let res = await raw(path, opts);

  if (res.status === 401 && !opts.anonymous && tokens.refresh) {
    try {
      if (tokenGeneration === sentWith) await refreshOnce();
      res = await raw(path, opts);
    } catch {
      tokens.clear();
      onSessionLost?.();
    }
  }

  if (!res.ok) {
    const body = await parse(res);
    const envelope = toEnvelope(res.status, body);
    if (res.status === 401) {
      tokens.clear();
      onSessionLost?.();
    }
    throw new ApiError(res.status, envelope);
  }

  const disposition = res.headers.get("Content-Disposition") ?? "";
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1];
  return { blob: await res.blob(), filename };
}

/** Outside `/api/v1` — used by the shell's connection indicator. */
export async function healthz(): Promise<{ status: string; database: string }> {
  const res = await fetch(`${BASE}/healthz`).catch(() => null);
  if (!res?.ok) throw new NetworkError();
  return res.json();
}

/**
 * Dev-only debug surface. Stripped from production builds by the `DEV` guard,
 * which Vite resolves statically so the whole block is tree-shaken out.
 *
 * `expireAccess()` exists because the single-flight refresh queue is the one
 * piece of this module that cannot be verified from the outside — there is no
 * other way to force a 401 on a live session.
 */
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__pp = {
    api,
    tokens,
    request,
    expireAccess: () => {
      accessToken = "expired.invalid.token";
    },
    refreshPending: () => refreshInFlight !== null,
    generation: () => tokenGeneration,
  };
}
