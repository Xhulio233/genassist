import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePagination } from "./usePagination";

describe("usePagination", () => {
  const items = Array.from({ length: 25 }, (_, i) => i);

  it("slices the first page by pageSize", () => {
    const { result } = renderHook(() => usePagination(items, { pageSize: 10 }));
    expect(result.current.pageItems).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(result.current.pageCount).toBe(3);
    expect(result.current.totalItems).toBe(25);
    expect(result.current.canPrev).toBe(false);
    expect(result.current.canNext).toBe(true);
  });

  it("navigates pages and clamps out-of-range requests", () => {
    const { result } = renderHook(() => usePagination(items, { pageSize: 10 }));
    act(() => result.current.next());
    expect(result.current.page).toBe(2);
    act(() => result.current.setPage(99));
    expect(result.current.page).toBe(3);
    expect(result.current.pageItems).toEqual([20, 21, 22, 23, 24]);
    expect(result.current.canNext).toBe(false);
  });

  it("handles an empty list without stranding the view", () => {
    const { result } = renderHook(() =>
      usePagination<number>([], { pageSize: 10 })
    );
    expect(result.current.pageCount).toBe(1);
    expect(result.current.page).toBe(1);
    expect(result.current.pageItems).toEqual([]);
  });
});
