/**
 * THE ONE FLAG — mock fixtures, or the live backend.
 *
 * `VITE_API_MODE=mock` (the default in development) serves every PRD §5
 * endpoint from `src/mocks`. `VITE_API_MODE=live` turns the whole thing off
 * and lets `api/client.ts` talk to `VITE_API_BASE_URL`.
 *
 * **Binary on purpose.** A per-endpoint switch — auth live, everything else
 * mocked — is the tempting version, and it is the one that rots: two
 * half-configurations, neither exercised, and a demo where the thing that
 * breaks is the seam. Both modes serve the same five accounts with the same
 * password, so switching changes what the data *is*, never how the app
 * behaves. The mock's auth handlers exist for exactly this reason.
 *
 * The default is `mock` in dev because the backend is at B0 — only `/auth`
 * exists, and every screen from P5 onward would be an empty state. It is
 * `live` in a production build, so a deployed bundle can never quietly serve
 * fixtures. Both are overridden by setting the variable.
 */

export type ApiMode = "mock" | "live";

const configured = import.meta.env.VITE_API_MODE as string | undefined;

export const API_MODE: ApiMode =
  configured === "mock" || configured === "live"
    ? configured
    : import.meta.env.DEV
      ? "mock"
      : "live";

export const usingMocks = API_MODE === "mock";

/**
 * Starts MSW when the flag says so, and resolves once the worker is ready.
 *
 * **Awaited before the app renders.** `AuthProvider` fires `/auth/me` on its
 * first effect; a worker still registering at that moment lets the call escape
 * to the network, and the app boots signed-out against a backend that is not
 * running. The cost is one dynamic import before first paint.
 *
 * The import is dynamic so the fixtures — several thousand generated rows and
 * the whole handler tree — are a separate chunk that a `live` build never
 * downloads and never parses.
 */
export async function startApiMode(): Promise<void> {
  if (!usingMocks) return;
  const { startMockServiceWorker } = await import("@/mocks/browser");
  await startMockServiceWorker();
}
