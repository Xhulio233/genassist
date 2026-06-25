import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFormState } from "./useFormState";

describe("useFormState", () => {
  it("updates a field and tracks dirty state", () => {
    const { result } = renderHook(() => useFormState({ name: "", age: 0 }));
    expect(result.current.isDirty).toBe(false);

    act(() => result.current.setField("name", "Ada"));
    expect(result.current.values.name).toBe("Ada");
    expect(result.current.isDirty).toBe(true);
  });

  it("merges a patch of fields", () => {
    const { result } = renderHook(() => useFormState({ a: 1, b: 2 }));
    act(() => result.current.setFields({ b: 9 }));
    expect(result.current.values).toEqual({ a: 1, b: 9 });
  });

  it("resets back to the baseline", () => {
    const { result } = renderHook(() => useFormState({ name: "" }));
    act(() => result.current.setField("name", "x"));
    act(() => result.current.reset());
    expect(result.current.values.name).toBe("");
    expect(result.current.isDirty).toBe(false);
  });

  it("reset(next) adopts a new baseline", () => {
    const { result } = renderHook(() => useFormState({ name: "" }));
    act(() => result.current.reset({ name: "seed" }));
    expect(result.current.values.name).toBe("seed");
    expect(result.current.isDirty).toBe(false);
  });
});
