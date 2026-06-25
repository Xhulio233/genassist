import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

interface UseFetchDataOptions<T> {
  /** Fetch immediately on mount. Defaults to true. */
  immediate?: boolean;
  /** Re-run the fetch whenever any of these values change. */
  deps?: unknown[];
  /** Called when the fetcher rejects. */
  onError?: (error: unknown) => void;
  /** Called with the resolved value on success. */
  onSuccess?: (data: T) => void;
}

interface UseFetchDataResult<T> {
  data: T | null;
  loading: boolean;
  error: unknown;
  /** Imperatively (re)run the fetch. Resolves to the data, or null on error. */
  refetch: () => Promise<T | null>;
  /** Escape hatch for optimistic updates. */
  setData: Dispatch<SetStateAction<T | null>>;
}

/**
 * Replaces the hand-rolled `useState` + `useEffect` + `try/catch` fetch block
 * repeated across ~50 cards and dialogs. Tracks loading/error/data and guards
 * against state updates from stale or unmounted requests.
 *
 * For server state that benefits from caching/dedup/background refetch, prefer
 * a TanStack Query hook directly over this thin wrapper.
 *
 * @example
 * const { data, loading, error, refetch } = useFetchData(
 *   () => getAllUsers(),
 *   { onError: (e) => toast.error(formatApiError(e)) }
 * );
 */
export function useFetchData<T>(
  fetcher: () => Promise<T>,
  options: UseFetchDataOptions<T> = {}
): UseFetchDataResult<T> {
  const { immediate = true, deps = [], onError, onSuccess } = options;

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(immediate);
  const [error, setError] = useState<unknown>(null);

  // Keep the latest fetcher/callbacks in refs so `refetch` stays referentially
  // stable and effects don't re-run just because a closure changed.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;

  // Monotonic id so only the most recent in-flight request can set state.
  const requestIdRef = useRef(0);

  const refetch = useCallback(async (): Promise<T | null> => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const result = await fetcherRef.current();
      if (requestId !== requestIdRef.current) return result;
      setData(result);
      onSuccessRef.current?.(result);
      return result;
    } catch (err) {
      if (requestId === requestIdRef.current) {
        setError(err);
        onErrorRef.current?.(err);
      }
      return null;
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (immediate) void refetch();
    return () => {
      // Invalidate any in-flight request on unmount / before a deps-driven refetch.
      requestIdRef.current++;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error, refetch, setData };
}
