/**
 * THE ROUTE TREE
 *
 * Guards are declarative and live here, so no screen can forget one. The
 * backend enforces the same matrix — this only stops the UI offering a route
 * the API would refuse.
 */
import { Suspense, lazy } from "react";
import { Navigate, Outlet, createBrowserRouter } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import type { Resource } from "@/auth/rbac";
import { RequirePermission } from "./guard";
import { Login } from "@/features/auth/Login";
import { Shell, PageHeader } from "./Shell";
import { Placeholder } from "./Placeholder";
import { DevChrome } from "./DevChrome";

/**
 * **Payroll and Reports are split out.** Not for the sake of a smaller number:
 * two of the five roles cannot open either of them, and a `HR_MANAGER` should
 * not download the payrun cockpit, the rule editor, the payslip renderer and
 * two chart implementations in order to be told the section is not theirs.
 *
 * They are also the two heaviest sections in the product, which is what took
 * the first pass of Stage III past §19's 220 kB budget. Splitting them puts
 * the shell back under it and leaves the code where it belongs.
 */
const PayrollRoutes = lazy(() =>
  import("@/features/payroll").then((m) => ({ default: m.PayrollRoutes })),
);
const DashboardRoutes = lazy(() =>
  import("@/features/dashboard").then((m) => ({ default: m.DashboardRoutes })),
);

/**
 * **And so is every other section.** P13 is what forced this: with the four
 * remaining feature sections imported eagerly, the entry chunk was
 * 191.30 kB gzipped, and a visitor who had only asked for the landing page
 * downloaded the employee directory, the contract editor, the attendance
 * grid and the leave queue to look at it. §19 budgets the landing at 180 kB
 * of initial JS, and that alone was over.
 *
 * Splitting them costs a `Suspense` boundary per section — which each one
 * already needed — and buys a front door that loads the front door.
 */
const PeopleRoutes = lazy(() =>
  import("@/features/people").then((m) => ({ default: m.PeopleRoutes })),
);
const MyRecord = lazy(() =>
  import("@/features/people").then((m) => ({ default: m.MyRecord })),
);
const ContractRoutes = lazy(() =>
  import("@/features/contracts").then((m) => ({ default: m.ContractRoutes })),
);
const TimeRoutes = lazy(() =>
  import("@/features/time").then((m) => ({ default: m.TimeRoutes })),
);
const LeaveRoutes = lazy(() =>
  import("@/features/leave").then((m) => ({ default: m.LeaveRoutes })),
);

/**
 * The design-system surfaces are dev-only and the heaviest thing about them
 * is the fixture dataset they render. They have no business in the bundle a
 * visitor downloads.
 */
const Gallery = lazy(() => import("@/gallery/Gallery").then((m) => ({ default: m.Gallery })));
const ProvingGround = lazy(() =>
  import("@/proving/ProvingGround").then((m) => ({ default: m.ProvingGround })),
);

/**
 * **The landing page is one lazy chunk, and it must stay that way.** It
 * imports the P3 fixture dataset — thirty employees, three thousand
 * attendance rows, seven payruns — because that is where the honest figures
 * live, and it lazily pulls `three` + `@react-three/fiber` on top of that.
 * None of that may reach the application shell, which has its own §19
 * budget to keep. This route loads the module; nothing else imports it.
 */
const Landing = lazy(() => import("@/landing/Landing"));

/** A lazy section needs a boundary, and the boundary needs to look like the app. */
const section = (element: React.ReactNode) => (
  <Suspense fallback={<Booting />}>{element}</Suspense>
);

function Booting() {
  return (
    <div className="pp-denied">
      <p className="t-micro" style={{ color: "var(--ink-400)" }}>PayPulse</p>
      <p className="t-body" style={{ color: "var(--ink-500)" }}>Restoring your session…</p>
    </div>
  );
}

function RequireAuth() {
  const { status } = useAuth();
  if (status === "loading") return <Booting />;
  if (status === "anonymous") return <Navigate to="/login" replace />;
  return <Outlet />;
}

/**
 * Guards the two anonymous surfaces: the landing page and the login screen.
 *
 * The redirect target is `/home` and **not** `/` — `/` is now one of the
 * routes this component guards, so sending an authenticated reader there
 * would re-enter `AnonymousOnly` and redirect forever.
 */
function AnonymousOnly() {
  const { status } = useAuth();
  if (status === "loading") return <Booting />;
  if (status === "authenticated") return <Navigate to="/home" replace />;
  return <Outlet />;
}

const guarded = (resource: Resource, element: React.ReactNode) => (
  <RequirePermission resource={resource}>{element}</RequirePermission>
);

/** Landing route differs by role — EMPLOYEE has no dashboard. */
function Home() {
  const { user, can } = useAuth();
  if (!user) return null;
  if (user.role === "EMPLOYEE") return <Navigate to="/me" replace />;
  return <Navigate to={can("dashboard", "read") ? "/reports" : "/people"} replace />;
}

export const router = createBrowserRouter([
  // Design-system surfaces. Unauthenticated on purpose: they are the visual
  // regression reference for every phase and must stay openable during review.
  {
    element: <DevChrome />,
    children: [
      { path: "/dev/gallery", element: section(<Gallery />) },
      { path: "/dev/material", element: section(<ProvingGround />) },
    ],
  },
  {
    element: <AnonymousOnly />,
    children: [
      /*
        The front door. Someone who already has an account is sent to `/home`
        instead — they want the product, not the pitch.
      */
      { path: "/", element: section(<Landing />) },
      { path: "/login", element: <Login /> },
    ],
  },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <Shell />,
        children: [
          /*
            "/" belongs to the landing page now, so the authenticated home is
            an explicit route. `Home` still does the role-dependent redirect
            from here — EMPLOYEE to /me, everyone else to their landing
            section — so what a member sees after signing in is unchanged.
          */
          { path: "home", element: <Home /> },
          { path: "people/*",    element: guarded("employee", section(<PeopleRoutes />)) },
          { path: "me",          element: guarded("employee", section(<MyRecord />)) },
          { path: "contracts/*", element: guarded("contract", section(<ContractRoutes />)) },
          { path: "time/*",      element: guarded("attendance", section(<TimeRoutes />)) },
          { path: "leave/*",     element: guarded("time_off_request", section(<LeaveRoutes />)) },
          { path: "payroll/*",   element: guarded("payrun", section(<PayrollRoutes />)) },
          { path: "reports/*",   element: guarded("dashboard", section(<DashboardRoutes />)) },
          { path: "why",         element: <Placeholder title="Why this number?" block="P4" /> },
          {
            path: "*",
            element: (
              <>
                <PageHeader title="Not found" meta="That page does not exist." />
              </>
            ),
          },
        ],
      },
    ],
  },
]);
