import { useCallback, useEffect, useRef, useState } from 'react';

export type Earmark = {
  id: string;
  fiscalYear: number;
  chamber: 'house';
  status: string;
  memberName: string;
  memberNameLower: string;
  state: string;
  district: string | null;
  party: string | null;
  recipientName: string;
  recipientAddress: string | null;
  projectTitle: string;
  amount_requested: number | null;
  amount_enacted: number | null;
  amount_obligated: number | null;
  agency: string | null;
  account: string | null;
  billName: string | null;
  publicLaw: string | null;
  sourceUrl: string;
};

export type EarmarkFilters = {
  fiscalYear?: number;
  state?: string;
  member?: string;
  status?: string;
  minAmount?: number;
  maxAmount?: number;
  limit?: number;
};

type QueryResponse = {
  results: Earmark[];
  nextCursor: string | null;
  total: number | null;
};

const BASE_URL = process.env.REACT_APP_EARMARKS_QUERY_URL;

function buildQueryString(filters: EarmarkFilters, cursor: string | null): string {
  const params = new URLSearchParams();
  if (filters.fiscalYear != null) params.set('fiscalYear', String(filters.fiscalYear));
  if (filters.state) params.set('state', filters.state.toUpperCase());
  if (filters.member) params.set('member', filters.member);
  if (filters.status) params.set('status', filters.status);
  if (filters.minAmount != null) params.set('minAmount', String(filters.minAmount));
  if (filters.maxAmount != null) params.set('maxAmount', String(filters.maxAmount));
  if (filters.limit != null) params.set('limit', String(filters.limit));
  if (cursor) params.set('cursor', cursor);
  const s = params.toString();
  return s ? `?${s}` : '';
}

/**
 * Fetches earmarks from the earmarksQuery Lambda Function URL.
 * Refetches automatically when filters change. Supports cursor-based pagination.
 */
export function useEarmarks(filters: EarmarkFilters) {
  const [earmarks, setEarmarks] = useState<Earmark[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [total, setTotal] = useState<number | null>(null);

  // Serialize filters for effect dep comparison
  const filtersKey = JSON.stringify(filters);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const fetchPage = useCallback(async (cursor: string | null, append: boolean) => {
    if (!BASE_URL) {
      setError('REACT_APP_EARMARKS_QUERY_URL not configured');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const qs = buildQueryString(filtersRef.current, cursor);
      const r = await fetch(`${BASE_URL}${qs}`);
      if (!r.ok) {
        const body = await r.text().catch(() => '');
        throw new Error(`Earmarks query ${r.status}: ${body.slice(0, 200)}`);
      }
      const data: QueryResponse = await r.json();
      setEarmarks((prev) => (append ? [...prev, ...data.results] : data.results));
      setNextCursor(data.nextCursor);
      if (data.total != null) setTotal(data.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load earmarks');
    } finally {
      setLoading(false);
    }
  }, []);

  // Reset + fetch whenever filters change
  useEffect(() => {
    setEarmarks([]);
    setNextCursor(null);
    setTotal(null);
    fetchPage(null, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey]);

  const loadMore = useCallback(() => {
    if (nextCursor && !loading) fetchPage(nextCursor, true);
  }, [nextCursor, loading, fetchPage]);

  return {
    earmarks,
    loading,
    error,
    total,
    hasMore: Boolean(nextCursor),
    loadMore,
    refetch: () => fetchPage(null, false),
  };
}
