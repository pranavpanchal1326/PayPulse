/**
 * The Contracts section's own two screens. Kept out of `index.tsx` so a screen
 * can import it without importing the route tree that mounts that screen.
 */
export const SECTION_NAV = [
  { to: "/contracts", label: "Contracts", end: true },
  { to: "/contracts/schedules", label: "Working schedules" },
];
