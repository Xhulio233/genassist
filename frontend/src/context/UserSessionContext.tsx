import React, {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { apiRequest } from "@/config/api";
import { isServerDown } from "@/config/serverStatus";
import { applySentryUserFromMeResponse } from "@/plugins/sentryUserSync";
import { AuthMeResponse, isAuthenticated } from "@/services/auth";
import { Role } from "@/interfaces/role.interface";

/**
 * Centralized, in-memory user/session context.
 *
 * The backend (`GET /auth/me`) is the single source of truth for identity,
 * roles, and permissions. This provider loads that response once on mount
 * (i.e. on app startup and on every browser refresh) and keeps it in React
 * state only — nothing about identity or authorization is persisted to
 * localStorage. Client-side navigation reuses the already-loaded session.
 *
 * Only session tokens and `tenant_id` remain in localStorage (see
 * `services/auth.ts` / `config/api.ts`); they are required to attach auth and
 * tenant headers to requests before `/auth/me` resolves.
 */

export interface CurrentUser {
  id?: string;
  username?: string;
  email?: string;
}

interface UserSessionContextType {
  /** Identity from `/auth/me`, or null when unauthenticated / not yet loaded. */
  user: CurrentUser | null;
  permissions: string[];
  roles: Role[];
  roleNames: string[];
  isAdmin: boolean;
  /** Raw force-update date from the backend (ISO string) or null. */
  forceUpdPassDate: string | null;
  /** True when the backend requires a password change as of today. */
  passwordUpdateRequired: boolean;
  isLoading: boolean;
  hasPermission: (permission: string) => boolean;
  hasAnyPermission: (permissions: string[]) => boolean;
  hasAllPermissions: (permissions: string[]) => boolean;
  /** Re-fetch `/auth/me` (e.g. after a role/permission change). */
  refresh: () => Promise<void>;
}

interface UserSessionProviderProps {
  children: ReactNode;
}

const UserSessionContext = createContext<UserSessionContextType | undefined>(
  undefined
);

/**
 * Mirror of the previous `services/auth.isPasswordUpdateRequired` semantics:
 * a password update is required when the force-update date is today or earlier.
 */
const computePasswordUpdateRequired = (
  forceUpdPassDate: string | null
): boolean => {
  if (!forceUpdPassDate) return false;
  try {
    const forceUpdateDate = new Date(forceUpdPassDate);
    if (Number.isNaN(forceUpdateDate.getTime())) return false;
    const today = new Date();
    today.setHours(23, 59, 59, 999); // End of today
    return forceUpdateDate <= today;
  } catch {
    return false;
  }
};

export const UserSessionProvider: React.FC<UserSessionProviderProps> = ({
  children,
}) => {
  const [session, setSession] = useState<AuthMeResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchSession = useCallback(async () => {
    if (!isAuthenticated()) {
      setSession(null);
      setIsLoading(false);
      return;
    }

    // If the server is known to be down / offline, avoid the request.
    if (
      isServerDown() ||
      (typeof navigator !== "undefined" && !navigator.onLine)
    ) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const response = await apiRequest<AuthMeResponse>("GET", "/auth/me");
      if (response) {
        setSession(response);
        applySentryUserFromMeResponse(response);
      }
    } catch (error) {
      // Quiet known down-state errors; auth gating falls back to token checks.
      if ((error as Error)?.message !== "SERVER_DOWN") {
        // ignore
      }
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  const value = useMemo<UserSessionContextType>(() => {
    const permissions = session?.permissions ?? [];
    const roles = session?.roles ?? [];
    const roleNames = roles
      .map((r) => r.name)
      .filter((n): n is string => Boolean(n));
    const forceUpdPassDate = session?.force_upd_pass_date ?? null;

    const hasPermission = (permission: string): boolean =>
      permissions.includes("*") || permissions.includes(permission);

    const hasAnyPermission = (required: string[]): boolean => {
      if (!required || required.length === 0) return true;
      if (permissions.includes("*")) return true;
      return required.some((perm) => permissions.includes(perm));
    };

    const hasAllPermissions = (required: string[]): boolean => {
      if (!required || required.length === 0) return true;
      if (permissions.includes("*")) return true;
      return required.every((perm) => permissions.includes(perm));
    };

    const user: CurrentUser | null = session
      ? { id: session.id, username: session.username, email: session.email }
      : null;

    return {
      user,
      permissions,
      roles,
      roleNames,
      isAdmin: roleNames.includes("admin"),
      forceUpdPassDate,
      passwordUpdateRequired: computePasswordUpdateRequired(forceUpdPassDate),
      isLoading,
      hasPermission,
      hasAnyPermission,
      hasAllPermissions,
      refresh: fetchSession,
    };
  }, [session, isLoading, fetchSession]);

  return (
    <UserSessionContext.Provider value={value}>
      {children}
    </UserSessionContext.Provider>
  );
};

const useUserSessionContext = (): UserSessionContextType => {
  const context = useContext(UserSessionContext);
  if (!context) {
    throw new Error(
      "useUserSession hooks must be used within a UserSessionProvider"
    );
  }
  return context;
};

// --- Primary hooks -------------------------------------------------------

export const useUserSession = (): UserSessionContextType =>
  useUserSessionContext();

export const useCurrentUser = (): CurrentUser | null =>
  useUserSessionContext().user;

export const usePermissions = (): string[] =>
  useUserSessionContext().permissions;

export const useRoles = (): Role[] => useUserSessionContext().roles;

export const useRoleNames = (): string[] => useUserSessionContext().roleNames;

export const useIsAdmin = (): boolean => useUserSessionContext().isAdmin;

export const usePermissionChecks = (): Pick<
  UserSessionContextType,
  "hasPermission" | "hasAnyPermission" | "hasAllPermissions"
> => {
  const { hasPermission, hasAnyPermission, hasAllPermissions } =
    useUserSessionContext();
  return { hasPermission, hasAnyPermission, hasAllPermissions };
};

export const usePasswordUpdateRequired = (): boolean =>
  useUserSessionContext().passwordUpdateRequired;

export const useIsLoadingSession = (): boolean =>
  useUserSessionContext().isLoading;

export const useRefreshSession = (): (() => Promise<void>) =>
  useUserSessionContext().refresh;

// --- Backward-compatible aliases (used by existing consumers) ------------

/** @deprecated Prefer `useIsLoadingSession`. */
export const useIsLoadingPermissions = useIsLoadingSession;

/** @deprecated Prefer `useRefreshSession`. */
export const useRefreshPermissions = useRefreshSession;
