/** P7's routes. One screen and its two overlays; the section needs no sub-nav. */
import { Navigate, Route, Routes } from "react-router-dom";
import { Attendance } from "./Attendance";

export function TimeRoutes() {
  return (
    <Routes>
      <Route index element={<Attendance />} />
      <Route path="*" element={<Navigate to="/time" replace />} />
    </Routes>
  );
}
