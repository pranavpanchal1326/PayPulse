import {
  BarChart3, CalendarClock, Clock, FileSignature, Users, Wallet,
  type LucideIcon,
} from "lucide-react";
import type { Action, Resource, Role } from "@/auth/rbac";
import { can } from "@/auth/rbac";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** The permission that reveals this item. */
  needs: [Resource, Action];
}

/** Six items, per spec B1. Role decides which of them exist. */
export const NAV: NavItem[] = [
  { to: "/people",    label: "People",    icon: Users,         needs: ["employee", "read"] },
  { to: "/contracts", label: "Contracts", icon: FileSignature, needs: ["contract", "read"] },
  { to: "/time",      label: "Time",      icon: Clock,         needs: ["attendance", "read"] },
  { to: "/leave",     label: "Leave",     icon: CalendarClock, needs: ["time_off_request", "read"] },
  { to: "/payroll",   label: "Payroll",   icon: Wallet,        needs: ["payrun", "read"] },
  { to: "/reports",   label: "Reports",   icon: BarChart3,     needs: ["dashboard", "read"] },
];

/**
 * §11 — role shapes the shell, not just its contents. EMPLOYEE gets a
 * materially different, quieter product (Me · Time · Leave), not the full
 * shell with items hidden.
 */
export const EMPLOYEE_NAV: NavItem[] = [
  { to: "/me",    label: "Me",    icon: Users,         needs: ["employee", "read"] },
  { to: "/time",  label: "Time",  icon: Clock,         needs: ["attendance", "read"] },
  { to: "/leave", label: "Leave", icon: CalendarClock, needs: ["time_off_request", "read"] },
];

export function navFor(role: Role): NavItem[] {
  const source = role === "EMPLOYEE" ? EMPLOYEE_NAV : NAV;
  return source.filter((item) => can(role, item.needs[0], item.needs[1]));
}
