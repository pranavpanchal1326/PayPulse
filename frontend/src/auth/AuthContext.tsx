import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from "react";
import { api, tokens } from "@/api/client";
import { ApiError } from "@/api/errors";
import { can, type Action, type Resource, type Role } from "./rbac";

/** Mirrors `schemas/auth.py::UserOut`. */
export interface User {
  id: number;
  email: string;
  full_name: string;
  role: Role;
  employee_id: number | null;
  is_active: boolean;
}

interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: User;
}

type Status = "loading" | "authenticated" | "anonymous";

interface AuthValue {
  status: Status;
  user: User | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** `can("payrun", "create")` — the matrix, bound to the current role. */
  can: (resource: Resource, action: Action) => boolean;
}

const Ctx = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<User | null>(null);

  /**
   * `POST /auth/logout` revokes **every** token ever issued to the user, not
   * just the one presented — so the refresh token in localStorage is dead the
   * moment it returns, and keeping it would only produce a 401 on next boot.
   * Both are cleared together, unconditionally.
   *
   * The call is best-effort: it is sent with the access token, and if it fails
   * (offline, already-expired token) the local session is still torn down.
   * Refusing to sign out because the server could not be told is the wrong
   * trade on a shared machine.
   */
  const signOut = useCallback(async () => {
    try {
      if (tokens.access) await api.post<{ message: string }>("/auth/logout");
    } catch {
      /* server-side revocation is best-effort; the local clear below is not */
    } finally {
      tokens.clear();
      setUser(null);
      setStatus("anonymous");
    }
  }, []);

  // A dead session anywhere in the app lands here, not in a random catch block.
  useEffect(() => {
    tokens.onSessionLost(() => {
      setUser(null);
      setStatus("anonymous");
    });
  }, []);

  /**
   * On boot the access token is gone (memory only), but the refresh token may
   * have survived. One `/auth/me` is enough: the client's 401 interceptor
   * spends the refresh token transparently, so this both restores the session
   * and proves it is still valid.
   */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!tokens.refresh) {
        setStatus("anonymous");
        return;
      }
      try {
        const me = await api.get<User>("/auth/me");
        if (cancelled) return;
        setUser(me);
        setStatus("authenticated");
      } catch {
        if (cancelled) return;
        tokens.clear();
        setStatus("anonymous");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    // `anonymous` so a failed login never triggers a refresh attempt.
    const pair = await api.post<TokenPair>(
      "/auth/login",
      { email: email.trim().toLowerCase(), password },
      { anonymous: true },
    );
    tokens.set(pair.access_token, pair.refresh_token);
    setUser(pair.user);
    setStatus("authenticated");
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      status,
      user,
      signIn,
      signOut,
      can: (resource, action) => (user ? can(user.role, resource, action) : false),
    }),
    [status, user, signIn, signOut],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside <AuthProvider>");
  return v;
}

/** `usePermission("payrun", "create")` */
export function usePermission(resource: Resource, action: Action): boolean {
  return useAuth().can(resource, action);
}

export { ApiError };
