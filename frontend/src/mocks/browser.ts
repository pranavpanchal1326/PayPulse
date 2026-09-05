/**
 * THE WORKER
 *
 * `mockServiceWorker.js` is already in `public/` (written by `msw init`), and
 * it is a build artefact — regenerate it with `npx msw init public/ --save`
 * after upgrading `msw`, rather than editing it.
 *
 * Three choices worth stating:
 *
 *   · **`onUnhandledRequest` warns, and warns loudly for our own API.** A call
 *     to a `/api/v1` route nobody has written a handler for is a hole in the
 *     contract, and it should say so by name — not fall through to a backend
 *     that has not built it and surface three layers up as a network error.
 *     Fonts, source maps and Vite's own traffic pass silently.
 *   · **`quiet: true`.** MSW logs every intercepted request by default, and
 *     one screen can make a dozen calls. The interesting failures are the
 *     unhandled ones, which still print.
 *   · **A failed registration does not stop the app booting.** Service workers
 *     are unavailable in more places than you would expect — embedded
 *     browsers, some corporate profiles, any non-localhost origin without
 *     TLS. Rejecting here would leave a blank page and no clue; the app boots,
 *     the console says exactly what happened, and `__mocks.selftest()` still
 *     runs because it never needed the worker.
 */
import { setupWorker } from "msw/browser";
import { handlers } from "./handlers";
import { db, reset } from "./db";
import { seed } from "./seed";

export const worker = setupWorker(...handlers);

/** Everything under here is ours; anything else is the toolchain's. */
const OUR_API = "/api/v1";

/**
 * The dev console surface. Installed **before** the worker starts, so it is
 * there to debug with even when the worker is the thing that failed.
 *
 * `reset()` is the one that earns its place: after approving forty leave
 * requests to see what a full list looks like, it puts the demo back in one
 * call.
 */
function installDevTools(): void {
  if (!import.meta.env.DEV) return;

  (window as unknown as Record<string, unknown>).__mocks = {
    db,
    seed,
    reset,
    worker,
    /** `__mocks.find("Kavya")` — the fastest route to the edge cases. */
    find: (q: string) =>
      db.employees.filter((e) => e.full_name.toLowerCase().includes(q.toLowerCase())),
    /** Every P3 exit criterion, checked against the handlers. See `selftest.ts`. */
    selftest: async () => (await import("./selftest")).runMockSelfTest(),
  };
}

export async function startMockServiceWorker(): Promise<void> {
  installDevTools();

  try {
    await worker.start({
      quiet: true,
      serviceWorker: { url: "/mockServiceWorker.js" },
      onUnhandledRequest(request, print) {
        if (new URL(request.url).pathname.startsWith(OUR_API)) {
          print.warning();
        }
      },
    });
  } catch (cause) {
    console.error(
      "[mocks] the service worker would not register, so the app is about to call a " +
        "backend that may not be running. Serve over http://localhost, or set " +
        "VITE_API_MODE=live and start the API.",
      cause,
    );
    return;
  }

  if (import.meta.env.DEV) {
    console.info(
      `%c[mocks]%c serving the PRD §5 API from fixtures · ${handlers.length} handlers · ` +
        `__mocks.reset() restores the demo · __mocks.selftest() checks the contract`,
      "font-weight:bold",
      "font-weight:normal",
    );
  }
}
