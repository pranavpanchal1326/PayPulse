/** P12's route. One screen; the role decides which variant of it. */
import { Navigate, Route, Routes } from "react-router-dom";
import { Dashboard } from "./Dashboard";

export function DashboardRoutes() {
  return (
    <Routes>
      <Route index element={<Dashboard />} />
      <Route path="*" element={<Navigate to="/reports" replace />} />
    </Routes>
  );
}
