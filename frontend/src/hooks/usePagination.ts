import { useMemo, useState } from "react";

interface UsePaginationOptions {
  pageSize?: number;
  initialPage?: number;
}

export interface UsePaginationResult<T> {
  page: number;
  pageSize: number;
  pageCount: number;
  /** The slice of `items` for the current page. */
  pageItems: T[];
  totalItems: number;
  setPage: (page: number) => void;
  next: () => void;
  prev: () => void;
  canPrev: boolean;
  canNext: boolean;
}

/**
 * Centralizes the PAGE_SIZE / slice / clamp logic duplicated across list views.
 * Operates on an in-memory array; for server-side pagination use the paginated
 * service endpoints directly.
 */
export function usePagination<T>(
  items: T[],
  options: UsePaginationOptions = {}
): UsePaginationResult<T> {
  const { pageSize = 10, initialPage = 1 } = options;
  const [page, setPage] = useState(initialPage);

  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  // Clamp so deleting the last item on the last page doesn't strand the view.
  const safePage = Math.min(Math.max(1, page), pageCount);

  const pageItems = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, safePage, pageSize]);

  const goToPage = (p: number) => setPage(Math.min(Math.max(1, p), pageCount));

  return {
    page: safePage,
    pageSize,
    pageCount,
    pageItems,
    totalItems: items.length,
    setPage: goToPage,
    next: () => goToPage(safePage + 1),
    prev: () => goToPage(safePage - 1),
    canPrev: safePage > 1,
    canNext: safePage < pageCount,
  };
}
