import { useCallback, useEffect, useState } from "react";

/**
 * Minimal fetch+refetch hook — intentionally NOT react-query/SWR/redux.
 * Matches the 4 HAUS convention: "small custom hooks, simplicity first."
 *
 *   const { data, error, loading, refetch } = useQuery(() => listProjects());
 *
 * `deps` works like useEffect's dependency array — pass filter/search state
 * in there to refetch automatically when it changes.
 */
export function useQuery(queryFn, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await queryFn();
      setData(result);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    run();
  }, [run]);

  return { data, error, loading, refetch: run };
}
