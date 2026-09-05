/**
 * P8's routes. Allocations and types are guarded on their own resources —
 * `EMPLOYEE` may read a request queue and its own balances but may not manage
 * the types those requests are filed against.
 */
import { Navigate, Route, Routes } from "react-router-dom";
import { RequirePermission } from "@/app/guard";
import { Requests } from "./Requests";
import { Allocations } from "./Allocations";
import { Balances } from "./Balances";
import { Types } from "./Types";

export function LeaveRoutes() {
  return (
    <Routes>
      <Route index element={<Requests />} />
      <Route
        path="allocations"
        element={
          <RequirePermission resource="leave_allocation">
            <Allocations />
          </RequirePermission>
        }
      />
      <Route
        path="balances"
        element={
          <RequirePermission resource="leave_allocation">
            <Balances />
          </RequirePermission>
        }
      />
      <Route
        path="types"
        element={
          <RequirePermission resource="time_off_type">
            <Types />
          </RequirePermission>
        }
      />
      <Route path="*" element={<Navigate to="/leave" replace />} />
    </Routes>
  );
}
