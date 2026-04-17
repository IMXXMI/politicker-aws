import { useCallback, useEffect, useRef, useState } from 'react';

export type StateOfficial = {
  id: string;
  category: string;            // 'sheriff' | 'state-judge' | 'school-board' | 'county-board' | ...
  state: string;
  locality: string | null;
  office: string;
  name: string;
  nameTokens?: string[];
  party: string | null;
  tookOffice: string | null;
  termEnds: string | null;
  contact?: { email?: string; phone?: string; website?: string };
  photo: string | null;
  sourceUrl: string;
  castsVotes: boolean;
  voteRecordsUrl: string | null;
  // Optional extras added by specific scrapers
  seniorityNumber?: number | null;
  courtListenerPersonId?: number | string;
  courtId?: string;
};

export type StateOfficialFilters = {
  state?: string;
  category?: string;
  locality?: string;
  member?: string;
  limit?: number;
};

type QueryResponse = {
  results: StateOfficial[];
  nextCursor: string | null;
  total: number | null;
};

const BASE_URL = process.env.REACT_APP_STATE_OFFICIALS_QUERY_URL;

function buildQueryString(filters: StateOfficialFilters, cursor: string | null): string {
  const p = new URLSearchParams();
  if (filters.state) p.set('state', filters.state.toUpperCase());
  if (filters.category) p.set('category', filters.category);
  if (filters.locality) p.set('locality', filters.locality);
  if (filters.member) p.set('member', filters.member);
  if (filters.limit != null) p.set('limit', String(filters.limit));
  if (cursor) p.set('cursor', cursor);
  const s = p.toString();
  return s ? `?${s}` : '';
}

export function useStateOfficials(filters: StateOfficialFilters) {
  const [officials, setOfficials] = useState<StateOfficial[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const filtersKey = JSON.stringify(filters);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const fetchPage = useCallback(async (cursor: string | null, append: boolean) => {
    if (!BASE_URL) {
      console.warn('[useStateOfficials] BASE_URL is:', BASE_URL);
      setError('REACT_APP_STATE_OFFICIALS_QUERY_URL not configured');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const qs = buildQueryString(filtersRef.current, cursor);
      console.log(`[useStateOfficials] fetching: ${BASE_URL}${qs}`);
      const r = await fetch(`${BASE_URL}${qs}`);
      if (!r.ok) {
        const body = await r.text().catch(() => '');
        throw new Error(`State officials query ${r.status}: ${body.slice(0, 200)}`);
      }
      let data: QueryResponse = await r.json();

      // Fallback: if locality filter returned 0 results, retry WITHOUT locality to show statewide
      if (data.results.length === 0 && filtersRef.current.locality) {
        const fallbackFilters = { ...filtersRef.current, locality: undefined };
        const fbQs = buildQueryString(fallbackFilters, cursor);
        console.log(`[useStateOfficials] locality returned 0, fallback to statewide: ${BASE_URL}${fbQs}`);
        const fbR = await fetch(`${BASE_URL}${fbQs}`);
        if (fbR.ok) data = await fbR.json();
      }

      console.log(`[useStateOfficials] got ${data.results?.length} results, nextCursor: ${data.nextCursor}`);
      setOfficials((prev) => (append ? [...prev, ...data.results] : data.results));
      setNextCursor(data.nextCursor);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load state officials');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setOfficials([]);
    setNextCursor(null);
    fetchPage(null, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey]);

  const loadMore = useCallback(() => {
    if (nextCursor && !loading) fetchPage(nextCursor, true);
  }, [nextCursor, loading, fetchPage]);

  return {
    officials,
    loading,
    error,
    hasMore: Boolean(nextCursor),
    loadMore,
    refetch: () => fetchPage(null, false),
  };
}
