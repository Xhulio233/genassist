/**
 * Single typed entry point for browser localStorage. Centralizes the ~15 raw
 * key strings that were previously read/written via `localStorage.getItem/
 * setItem` across services, contexts, and components — eliminating typos and
 * giving each value a parsed, typed accessor.
 *
 * All access is wrapped in try/catch so a disabled/unavailable storage (private
 * mode, SSR, quota) degrades gracefully instead of throwing.
 */

export const STORAGE_KEYS = {
  accessToken: "access_token",
  refreshToken: "refresh_token",
  tokenType: "token_type",
  tenantId: "tenant_id",
  isAuthenticated: "isAuthenticated",
  forceUpdatePassDate: "force_upd_pass_date",
  skipOnboarding: "skip_onboarding",
  userRoles: "user_roles",
  authUsername: "auth_username",
  permissions: "permissions",
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

function getRaw(key: StorageKey): string | null {
  try {
    return typeof window !== "undefined"
      ? window.localStorage.getItem(key)
      : null;
  } catch {
    return null;
  }
}

function setRaw(key: StorageKey, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage unavailable — ignore */
  }
}

function removeRaw(key: StorageKey): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* storage unavailable — ignore */
  }
}

function getJSON<T>(key: StorageKey, fallback: T): T {
  const raw = getRaw(key);
  if (raw == null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export const storage = {
  // --- raw escape hatches (use the typed accessors below where possible) ---
  getRaw,
  setRaw,
  removeRaw,

  // --- auth tokens ---
  getAccessToken: (): string | null => getRaw(STORAGE_KEYS.accessToken),
  setAccessToken: (token: string): void => setRaw(STORAGE_KEYS.accessToken, token),
  getRefreshToken: (): string | null => getRaw(STORAGE_KEYS.refreshToken),
  setRefreshToken: (token: string): void =>
    setRaw(STORAGE_KEYS.refreshToken, token),
  getTokenType: (): string | null => getRaw(STORAGE_KEYS.tokenType),
  setTokenType: (type: string): void => setRaw(STORAGE_KEYS.tokenType, type),

  // --- tenant / session ---
  getTenantId: (): string | null => getRaw(STORAGE_KEYS.tenantId),
  setTenantId: (id: string): void => setRaw(STORAGE_KEYS.tenantId, id),
  getAuthUsername: (): string | null => getRaw(STORAGE_KEYS.authUsername),
  setAuthUsername: (name: string): void =>
    setRaw(STORAGE_KEYS.authUsername, name),

  // --- flags ---
  isAuthenticated: (): boolean => getRaw(STORAGE_KEYS.isAuthenticated) === "true",
  setAuthenticated: (value: boolean): void =>
    setRaw(STORAGE_KEYS.isAuthenticated, String(value)),
  shouldSkipOnboarding: (): boolean =>
    getRaw(STORAGE_KEYS.skipOnboarding) === "true",
  setSkipOnboarding: (value: boolean): void =>
    setRaw(STORAGE_KEYS.skipOnboarding, String(value)),
  getForceUpdatePassDate: (): string | null =>
    getRaw(STORAGE_KEYS.forceUpdatePassDate),
  setForceUpdatePassDate: (date: string): void =>
    setRaw(STORAGE_KEYS.forceUpdatePassDate, date),

  // --- roles / permissions (JSON arrays) ---
  getUserRoles: (): string[] => getJSON<string[]>(STORAGE_KEYS.userRoles, []),
  setUserRoles: (roles: string[]): void =>
    setRaw(STORAGE_KEYS.userRoles, JSON.stringify(roles)),
  getPermissions: (): string[] =>
    getJSON<string[]>(STORAGE_KEYS.permissions, []),
  setPermissions: (permissions: string[]): void =>
    setRaw(STORAGE_KEYS.permissions, JSON.stringify(permissions)),

  /** Clear all known auth/session keys (e.g. on logout). */
  clearSession(): void {
    Object.values(STORAGE_KEYS).forEach((key) => removeRaw(key));
  },
};
