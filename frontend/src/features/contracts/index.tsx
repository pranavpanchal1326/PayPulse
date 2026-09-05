/**
 * P6's routes. `app/routes.tsx` owns the permission guard and mounts
 * `contracts/*` here, so the section can grow a screen without the router
 * file learning about it.
 *
 * The schedule editor is guarded separately: `contract` read is enough to see
 * the contract list, but the schedule *editor* writes a `working_schedule`,
 * and the two permissions genuinely differ for `EMPLOYEE`.
 */
import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { RequirePermission } from "@/app/guard";
import { Contracts } from "./Contracts";
import { Schedules } from "./Schedules";
import { ScheduleEditor } from "./ScheduleEditor";

function ScheduleRoute() {
  const { id } = useParams();
  if (id === "new") return <ScheduleEditor id="new" />;
  const numeric = Number(id);
  if (!Number.isInteger(numeric) || numeric <= 0) {
    return <Navigate to="/contracts/schedules" replace />;
  }
  return <ScheduleEditor id={numeric} />;
}

export function ContractRoutes() {
  return (
    <Routes>
      <Route index element={<Contracts />} />
      <Route
        path="schedules"
        element={
          <RequirePermission resource="working_schedule">
            <Schedules />
          </RequirePermission>
        }
      />
      <Route
        path="schedules/:id"
        element={
          <RequirePermission resource="working_schedule">
            <ScheduleRoute />
          </RequirePermission>
        }
      />
      <Route path=":id" element={<Contracts />} />
      <Route path="*" element={<Navigate to="/contracts" replace />} />
    </Routes>
  );
}
