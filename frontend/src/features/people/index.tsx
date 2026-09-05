/**
 * P5's routes, kept beside the screens they mount.
 *
 * `app/routes.tsx` owns the permission guard and mounts `people/*` here, so
 * the feature can add a sub-screen without the router file learning about it.
 */
import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { PageHeader } from "@/app/Shell";
import { Button, EmptyState, Well } from "@/components/system";
import { Employees } from "./Employees";
import { EmployeePage } from "./EmployeePage";
import { Reference } from "./Reference";

/** `/people/:id` — the id is a route parameter, so it has to be validated. */
function EmployeeRoute() {
  const { id } = useParams();
  const numeric = Number(id);
  if (!Number.isInteger(numeric) || numeric <= 0) return <Navigate to="/people" replace />;
  return <EmployeePage id={numeric} />;
}

export function PeopleRoutes() {
  return (
    <Routes>
      <Route index element={<Employees />} />
      <Route path="reference" element={<Reference />} />
      <Route path=":id" element={<EmployeeRoute />} />
      <Route path="*" element={<Navigate to="/people" replace />} />
    </Routes>
  );
}

/**
 * `/me` — the same S3 page, addressed by who you are rather than by id.
 *
 * An account with no employee record (a bare ADMIN) has nothing to show here,
 * and says so instead of requesting `/employees/null`.
 */
export function MyRecord() {
  const { user } = useAuth();
  if (!user) return null;

  if (user.employee_id === null) {
    return (
      <>
        <PageHeader title="Me" meta="This account is not linked to an employee record." />
        <Well style={{ padding: "var(--s-5)" }}>
          <EmptyState
            title="No employee record"
            body="Your sign-in exists, but it is not attached to a person in the directory — so there is no contract, attendance or leave to show. An administrator can link them."
            action={<Button variant="quiet" onClick={() => history.back()}>Go back</Button>}
          />
        </Well>
      </>
    );
  }

  return <EmployeePage id={user.employee_id} self />;
}
