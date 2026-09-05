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
import { MyRecord, PeopleRoutes } from "@/features/people";
import { ContractRoutes } from "@/features/contracts";
import { TimeRoutes } from "@/features/time";
import { LeaveRoutes } from "@/features/leave";
import { Gallery } from "@/gallery/Gallery";
import { ProvingGround } from "@/proving/ProvingGround";
import { DevChrome } from "./DevChrome";

/**
 * The P4 showcase drives every signature system from the **P3 fixture
 * dataset**, so a static import would pull thirty employees and three thousand
 * attendance rows into the production bundle for the sake of a dev route.
 * Lazy, and it stays in its own chunk.
 */
const SignatureShowcase = lazy(() =>
  import("@/signature/Showcase").then((m) => ({ default: m.SignatureShowcase })),
);

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

function AnonymousOnly() {
  const { status } = useAuth();
  if (status === "loading") return <Booting />;
  if (status === "authenticated") return <Navigate to="/" replace />;
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
      { path: "/dev/gallery", element: <Gallery /> },
      { path: "/dev/material", element: <ProvingGround /> },
      {
        path: "/dev/signature",
        element: (
          <Suspense fallback={<Booting />}>
            <SignatureShowcase />
          </Suspense>
        ),
      },
    ],
  },
  {
    element: <AnonymousOnly />,
    children: [{ path: "/login", element: <Login /> }],
  },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <Shell />,
        children: [
          { index: true, element: <Home /> },
          { path: "people/*",    element: guarded("employee", <PeopleRoutes />) },
          { path: "me",          element: guarded("employee", <MyRecord />) },
          { path: "contracts/*", element: guarded("contract", <ContractRoutes />) },
          { path: "time/*",      element: guarded("attendance", <TimeRoutes />) },
          { path: "leave/*",     element: guarded("time_off_request", <LeaveRoutes />) },
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
