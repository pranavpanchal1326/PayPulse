/**
 * The Payroll section's screens. Configuration sits beside the runs rather
 * than in a seventh sidebar item: a salary structure is only ever looked at
 * because of a payrun, and §11 keeps the shell at six.
 */
export const SECTION_NAV = [
  { to: "/payroll", label: "Payruns", end: true },
  { to: "/payroll/structures", label: "Salary structures" },
];
