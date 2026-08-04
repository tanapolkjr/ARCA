import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Minimal fetch-and-refetch hook — deliberately not a caching library.
 * Four users, direct Supabase reads; simplicity beats infrastructure
 * (project rule 1).
 */
export function useQuery<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const refetch = useCallback(async () => {
    try {
      setError(null);
      const result = await fnRef.current();
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong loading this data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error, refetch };
}
