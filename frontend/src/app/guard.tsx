/**
 * THE PERMISSION GUARD, on its own.
 *
 * It lives here rather than in `routes.tsx` because feature route trees use it
 * for their sub-screens, and importing it from the router meant every feature
 * imported the router that mounts it. That cycle worked — function
 * declarations hoist — but it also defeated code splitting: a lazily loaded
 * section that reaches back into `routes.tsx` drags the whole route tree into
 * its own chunk.
 */
import { useAuth } from "@/auth/AuthContext";
import type { Action, Resource } from "@/auth/rbac";

/** Fails loudly and readably rather than rendering an empty screen. */
export function RequirePermission({
  resource,
  action = "read",
  children,
}: {
  resource: Resource;
  action?: Action;
  children: React.ReactNode;
}) {
  const { can } = useAuth();
  if (!can(resource, action)) {
    return (
      <div className="pp-denied">
        <h1 className="t-h1" style={{ margin: 0 }}>Not available to your role</h1>
        <p className="t-body" style={{ color: "var(--ink-500)", maxWidth: "44ch" }}>
          Your account does not have access to this section. If that looks
          wrong, an administrator can change your role.
        </p>
      </div>
    );
  }
  return <>{children}</>;
}
