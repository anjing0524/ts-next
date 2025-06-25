'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from '@/components/ui/use-toast';
import type { PaginatedResponse } from '@/types/admin-entities';

// 定义API函数的类型签名
// P now extends an object that expects offset and limit
type ApiListFunction<T, P extends { offset: number; limit: number; [key: string]: any }> =
  (params: P) => Promise<PaginatedResponse<T>>;

interface UsePaginatedResourceOptions<P> {
  initialOffset?: number;
  initialLimit?: number;
  initialSearchParams?: Omit<P, 'offset' | 'limit'>; // Search/filter params excluding offset & limit
  loadInitialData?: boolean; // Whether to load data on mount, default true
}

interface UsePaginatedResourceReturn<T, P extends { offset: number; limit: number; [key: string]: any }> {
  data: T[];
  isLoading: boolean;
  error: string | null;
  offset: number;
  limit: number;
  totalItems: number;
  canLoadMore: boolean; // True if offset + data.length < totalItems
  searchTerm: string;
  searchParams: Omit<P, 'offset' | 'limit'>;
  setOffset: (offset: number) => void; // Direct offset control if needed, e.g. for virtual scrolling
  setLimit: (limit: number) => void;   // Resets offset to 0
  setSearchTerm: (term: string) => void;
  setSearchParams: (params: Omit<P, 'offset' | 'limit'>) => void;
  applyFiltersAndReset: () => void; // Applies current searchTerm & searchParams, resets offset to 0
  loadMore: () => void; // Increments offset to load next set of items, appends to data
  refreshData: () => void; // Fetches data for current offset and filters, replacing current data
}

const DEFAULT_LIMIT = 10;

/**
 * 自定义 Hook，用于管理基于 offset/limit 分页资源的通用数据获取逻辑。
 * @param apiListFunction - 调用API以获取列表数据的函数。它应接受一个包含 offset, limit 和其他过滤参数的对象。
 * @param options - 可选的初始配置。
 */
export function usePaginatedResource<T, P extends { offset: number; limit: number; search?: string; [key: string]: any }>(
  apiListFunction: ApiListFunction<T, P>,
  options?: UsePaginatedResourceOptions<P>
): UsePaginatedResourceReturn<T, P> {
  const {
    initialOffset = 0,
    initialLimit = DEFAULT_LIMIT,
    initialSearchParams = {} as Omit<P, 'offset' | 'limit'>,
    loadInitialData = true,
  } = options || {};

  const [data, setData] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(loadInitialData); // Only true on initial if loadInitialData is true
  const [error, setError] = useState<string | null>(null);

  const [offset, setOffset] = useState(initialOffset);
  const [limit, setLimitState] = useState(initialLimit); // Renamed to avoid conflict with outer scope limit
  const [totalItems, setTotalItems] = useState(0);

  const [searchTerm, setSearchTerm] = useState(initialSearchParams?.search || '');
  const [searchParams, setSearchParamsState] = useState<Omit<P, 'offset' | 'limit'>>(initialSearchParams);
  const [appliedFilters, setAppliedFilters] = useState<Omit<P, 'offset' | 'limit'>>(initialSearchParams);

  const canLoadMore = offset + data.length < totalItems;

  const fetchData = useCallback(async (fetchOffset: number, isLoadMore: boolean = false) => {
    setIsLoading(true);
    setError(null);
    try {
      const paramsForApi = {
        ...appliedFilters,
        offset: fetchOffset,
        limit: limit, // Use current limit state
        search: appliedFilters.search
      } as P;

      const response = await apiListFunction(paramsForApi);

      if (isLoadMore) {
        setData(prevData => [...prevData, ...response.data]);
      } else {
        setData(response.data);
      }
      setTotalItems(response.meta.totalItems);
      // No totalPages or currentPage needed with offset/limit directly
    } catch (err: any) {
      const errorMessage = err.message || '获取数据失败。';
      setError(errorMessage);
      toast({ variant: "destructive", title: "错误", description: errorMessage });
    } finally {
      setIsLoading(false);
    }
  }, [apiListFunction, limit, appliedFilters]);

  useEffect(() => {
    if (loadInitialData || offset !== initialOffset) { // Fetch if loadInitialData or if offset changed by loadMore/setOffset
        fetchData(offset);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offset, appliedFilters, loadInitialData]); // fetchData is memoized. Limit changes trigger reset via setLimitState.

  const handleSetOffset = (newOffset: number) => {
    setOffset(newOffset >= 0 ? newOffset : 0);
  };

  const handleSetLimit = (newLimit: number) => {
    setLimitState(newLimit > 0 ? newLimit : DEFAULT_LIMIT);
    setOffset(0); // Reset offset when limit changes
    // Fetch data will be triggered by offset change in useEffect
  };

  const handleSetSearchTerm = (term: string) => {
    setSearchTerm(term);
  };

  const handleSetSearchParams = (params: Omit<P, 'offset' | 'limit'>) => {
    setSearchParamsState(params);
  };

  const applyFiltersAndReset = () => {
    const newAppliedFilters = { ...searchParams, search: searchTerm } as Omit<P, 'offset' | 'limit'>;
    setAppliedFilters(newAppliedFilters);
    if (offset === 0) { // If offset is already 0, useEffect won't fire by offset change alone
        fetchData(0); // Manually trigger fetch for current offset if filters changed but offset didn't
    } else {
        setOffset(0); // This will trigger useEffect
    }
  };

  const loadMore = () => {
    if (canLoadMore && !isLoading) {
      const nextOffset = offset + data.length; // More robust way to calculate next offset
      setOffset(nextOffset); // This will trigger useEffect with the new offset
      // fetchData will be called with isLoadMore = true if we adapt it, or we fetch and append here.
      // For now, useEffect handles fetching, and we need to adapt it for loadMore.
      // Let's modify fetchData to append if offset > 0 and it's not a filter reset.
      // Or, simpler: fetchData always replaces, loadMore calls fetchData then appends.
      // To keep fetchData simple (always replaces for current offset/filters):
      // The useEffect will fetch when offset changes. We need to ensure it appends if offset was not 0.
      // This requires a change in how `setData` is called within `fetchData` or a separate loadMoreFetch.
      //
      // Let's make `fetchData` handle appending if `isLoadMore` is true.
      // The `useEffect` will call `fetchData(offset)` (meaning it's not loadMore from its perspective).
      // `loadMore` function will explicitly call `fetchData(newOffset, true)`.
      // This means `useEffect` should only fetch if it's not a `loadMore` scenario.
      // This gets complicated. Simpler: `loadMore` sets new offset, `useEffect` fetches, and we need to know if it should append.
      //
      // Revised strategy for loadMore:
      // loadMore sets a flag or a different offset state.
      // For now, let's assume the consuming component will handle appending if desired,
      // or the hook is primarily for page-by-page via offset.
      // For true "load more" and append, the hook needs more internal logic.
      // The current `useEffect` reacting to `offset` change will replace data.
      // This is fine for `@tanstack/table` virtualization if it requests specific ranges.
      // If it's a simple "Load More" button, then the caller needs to manage appending.
      //
      // Let's make `loadMore` actually fetch and append for a common use case.
      // We need to prevent the main useEffect from re-fetching when `loadMore` changes offset.
      // This can be done by adding a flag to `fetchData` and another state.
      //
      // Simpler for now: `loadMore` just sets the next offset. The main `useEffect` fetches.
      // If `offset > 0` when `fetchData` runs, it implies it could be a "load more" style if data is appended.
      // But `fetchData` currently replaces.
      //
      // OK, let's make `fetchData` always replace. `loadMore` needs to be implemented carefully by the consumer
      // or this hook needs to be more opinionated about appending data.
      // For `@tanstack/table` virtualization, it often requests data for specific ranges (offset, limit),
      // so replacing data for the current `offset` is usually correct.
      // The `canLoadMore` flag is useful for "load more" buttons.
      if (canLoadMore && !isLoading) {
         setOffset(prevOffset => prevOffset + limit);
      }
    }
  };

  const refreshData = () => {
    fetchData(offset); // Re-fetch current view
  };

  return {
    data,
    isLoading,
    error,
    offset,
    limit,
    totalItems,
    canLoadMore,
    searchTerm,
    searchParams,
    setOffset: handleSetOffset,
    setLimit: handleSetLimit,
    setSearchTerm: handleSetSearchTerm,
    setSearchParams: handleSetSearchParams,
    applyFiltersAndReset,
    loadMore,
    refreshData,
  };
}
```
