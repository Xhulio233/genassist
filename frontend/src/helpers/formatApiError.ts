import axios from "axios";

function pickString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

/**
 * Best-effort extraction of a human-readable message from any thrown value.
 * Handles Axios errors (reading `detail` / `error` / `message` from the response
 * body, then the Axios message), plain `Error`s, and raw strings.
 *
 * Use this everywhere instead of ad-hoc `err?.response?.data?.detail` digging or
 * `err.message` access on `any`.
 *
 * @example
 * try { await save(); }
 * catch (e) { toast.error(formatApiError(e, "Failed to save")); }
 */
export function formatApiError(
  error: unknown,
  fallback = "Something went wrong"
): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as
      | { detail?: unknown; error?: unknown; message?: unknown }
      | undefined;
    const fromBody =
      pickString(data?.detail) ??
      pickString(data?.error) ??
      pickString(data?.message);
    if (fromBody) return fromBody;
    if (error.message) return error.message;
  }
  if (error instanceof Error && error.message) return error.message;
  return pickString(error) ?? fallback;
}
