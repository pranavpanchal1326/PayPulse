/**
 * DASHBOARD — B9's swap happens here.
 *
 * One endpoint, one round-trip, on purpose: §5 marks `/dashboard` as returning
 * the KPIs, both charts, both overviews and the alerts together. Six calls
 * would be six different instants, and a headcount that disagreed with its own
 * payslip count is how a dashboard stops being believed.
 */
import { api } from "@/api/client";
import type { Dashboard, DashboardQuery, Department } from "@/api/contract";

export const getDashboard = (q: DashboardQuery) => api.get<Dashboard>("/dashboard", { ...q });

export const listDepartments = () =>
  api.get<Department[]>("/departments", { page_size: 200 });
