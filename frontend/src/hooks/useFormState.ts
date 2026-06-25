import { useCallback, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

export interface UseFormStateResult<T> {
  values: T;
  setValues: Dispatch<SetStateAction<T>>;
  /** Update a single field by key. */
  setField: <K extends keyof T>(key: K, value: T[K]) => void;
  /** Shallow-merge a patch of fields. */
  setFields: (patch: Partial<T>) => void;
  /** Reset to the initial values, or to `next` (which becomes the new baseline). */
  reset: (next?: T) => void;
  /** True when `values` differ from the current baseline. */
  isDirty: boolean;
}

/**
 * Centralizes field state, reset, and dirty tracking for dialogs/forms — the
 * per-field `useState` soup repeated across ~44 CRUD dialogs.
 *
 * @example
 * const { values, setField, reset, isDirty } = useFormState({ name: "", email: "" });
 */
export function useFormState<T extends Record<string, unknown>>(
  initialValues: T
): UseFormStateResult<T> {
  const baselineRef = useRef(initialValues);
  const [values, setValues] = useState<T>(initialValues);

  const setField = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const setFields = useCallback((patch: Partial<T>) => {
    setValues((prev) => ({ ...prev, ...patch }));
  }, []);

  const reset = useCallback((next?: T) => {
    const base = next ?? baselineRef.current;
    baselineRef.current = base;
    setValues(base);
  }, []);

  const isDirty = useMemo(
    () => JSON.stringify(values) !== JSON.stringify(baselineRef.current),
    [values]
  );

  return { values, setValues, setField, setFields, reset, isDirty };
}
