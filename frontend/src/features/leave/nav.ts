/** P8's four screens. Kept out of `index.tsx` so a screen can import it. */
export const SECTION_NAV = [
  { to: "/leave", label: "Requests", end: true },
  { to: "/leave/allocations", label: "Allocations" },
  { to: "/leave/balances", label: "Balances" },
  { to: "/leave/types", label: "Types" },
];
