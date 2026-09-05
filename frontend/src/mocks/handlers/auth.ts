/**
 * AUTH — the three endpoints the backend has actually shipped (B0).
 *
 * These are mocked anyway, and deliberately so: `VITE_API_MODE=mock` has to
 * produce a *whole* product, and a mode where you cannot sign in is not a
 * mode. The five accounts, the password and the envelope shapes are identical
 * to `backend/app/db/seed.py`, so switching modes changes nothing you can see
 * from the login screen.
 *
 * Two behaviours here exist to keep P2's guarantees honest under the mocks:
 *
 *   · **Unknown user and wrong password answer identically** — byte for byte,
 *     so the form cannot be used to enumerate accounts.
 *   · **Refresh tokens rotate and are single-use**, which is what the client's
 *     single-flight refresh queue was built to survive.
 */
import { http } from "msw";
import { db } from "../db";
import {
  Refused, auth, body, fail, issueTokens, ok, revokeTokensFor, rootRoute, route, settle,
  spendRefreshToken, str,
} from "../http";
import type { MockUser } from "../seed/people";

/** Mirrors `schemas/auth.py::UserOut` — the password never leaves this file. */
const publicUser = (u: MockUser) => ({
  id: u.id,
  email: u.email,
  full_name: u.full_name,
  role: u.role,
  employee_id: u.employee_id,
  is_active: u.is_active,
});

/** One message for both failures. Different text here is an enumeration bug. */
const badCredentials = () =>
  fail(401, "invalid_credentials", "That email and password do not match an account.");

/**
 * FAILED-LOGIN THROTTLE — 5 per minute, mirroring B13.
 *
 * The real counter is a Postgres row keyed on the email *and* the source IP;
 * a browser mock has no source IP to key on, so the email alone stands in.
 * What matters for the UI is the shape it has to render: a 429 whose message
 * carries the remaining seconds, and a successful login that clears the count.
 */
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 5;
const attempts = new Map<string, number[]>();

function recentFailures(key: string): number[] {
  const cutoff = Date.now() - WINDOW_MS;
  const kept = (attempts.get(key) ?? []).filter((t) => t > cutoff);
  attempts.set(key, kept);
  return kept;
}

/** Seconds until the oldest attempt in the window ages out, or 0 if free. */
function blockedFor(key: string): number {
  const recent = recentFailures(key);
  if (recent.length < MAX_ATTEMPTS) return 0;
  return Math.max(1, Math.ceil((recent[0] + WINDOW_MS - Date.now()) / 1000));
}

const rateLimited = (seconds: number) =>
  fail(429, "rate_limited", `Too many attempts. Try again in ${seconds} second(s).`);

export const authHandlers = [
  http.get(rootRoute("/healthz"), async () => {
    await settle();
    return ok({ status: "ok", database: "mock" });
  }),

  http.post(route("/auth/login"), async ({ request }) => {
    await settle();
    const b = await body(request);
    const email = str(b.email)?.toLowerCase();
    const password = str(b.password);

    const key = email ?? "";
    const wait = blockedFor(key);
    if (wait > 0) return rateLimited(wait);

    const user = db.users.find((u) => u.email.toLowerCase() === email);
    // Note the shape: the miss and the mismatch land on the same line.
    if (!user || user.password !== password || !user.is_active) {
      attempts.set(key, [...recentFailures(key), Date.now()]);
      return badCredentials();
    }

    attempts.delete(key); // a success clears the counter, as it does in B13
    return ok({ ...issueTokens(user), user: publicUser(user) });
  }),

  /**
   * B12: revokes **every** token issued to the user, not just the one
   * presented — so the refresh token the client is holding is dead too, and
   * the next `/auth/refresh` 401s rather than renewing.
   */
  http.post(route("/auth/logout"), async ({ request }) => {
    await settle();
    const user = auth(request);
    if (user instanceof Refused) return user.response;
    revokeTokensFor(user.id);
    return ok({ message: "Signed out on every device." });
  }),

  http.post(route("/auth/refresh"), async ({ request }) => {
    await settle();
    const token = str((await body(request)).refresh_token);
    const user = token ? spendRefreshToken(token) : null;
    if (!user) {
      return fail(401, "invalid_token", "Your session has ended. Sign in again.");
    }
    return ok({ ...issueTokens(user), user: publicUser(user) });
  }),

  http.get(route("/auth/me"), async ({ request }) => {
    await settle();
    const user = auth(request);
    if (user instanceof Refused) return user.response;
    return ok(publicUser(user));
  }),
];
