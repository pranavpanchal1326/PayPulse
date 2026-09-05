/**
 * P9 · P10 · P11's routes.
 *
 * `app/routes.tsx` guards the section on `payrun` read; the configuration
 * screens are guarded again on `salary_structure`, because the two genuinely
 * differ — a payroll executive reads structures and cannot edit them, and the
 * editor's own controls check `salary_rule` update on top of that.
 */
import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { RequirePermission } from "@/app/guard";
import { Payruns } from "./Payruns";
import { Wizard } from "./Wizard";
import { Cockpit } from "./Cockpit";
import { Structures } from "./Structures";
import { Rules } from "./Rules";
import { PayslipScreen } from "./PayslipScreen";

/** A route parameter is user input, so it is validated before it is used. */
function numericRoute(
  id: string | undefined,
  render: (id: number) => React.ReactElement,
  fallback: string,
) {
  const numeric = Number(id);
  if (!Number.isInteger(numeric) || numeric <= 0) return <Navigate to={fallback} replace />;
  return render(numeric);
}

function CockpitRoute() {
  const { id } = useParams();
  return numericRoute(id, (n) => <Cockpit id={n} />, "/payroll");
}

function RulesRoute() {
  const { id } = useParams();
  return numericRoute(id, (n) => <Rules structureId={n} />, "/payroll/structures");
}

function PayslipRoute() {
  const { id } = useParams();
  return numericRoute(id, (n) => <PayslipScreen id={n} />, "/payroll");
}

export function PayrollRoutes() {
  return (
    <Routes>
      <Route index element={<Payruns />} />
      <Route
        path="new"
        element={
          <RequirePermission resource="payrun" action="create">
            <Wizard />
          </RequirePermission>
        }
      />
      <Route
        path="structures"
        element={
          <RequirePermission resource="salary_structure">
            <Structures />
          </RequirePermission>
        }
      />
      <Route
        path="structures/:id"
        element={
          <RequirePermission resource="salary_structure">
            <RulesRoute />
          </RequirePermission>
        }
      />
      <Route
        path="payslips/:id"
        element={
          <RequirePermission resource="payslip">
            <PayslipRoute />
          </RequirePermission>
        }
      />
      <Route path=":id" element={<CockpitRoute />} />
      <Route path="*" element={<Navigate to="/payroll" replace />} />
    </Routes>
  );
}
