import { useCallback, useEffect, useState } from "react";

export function useApiResource<T>(loader: () => Promise<T>, dependencies: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  const reload = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError("");
    loader()
      .then((value) => { if (current) setData(value); })
      .catch((reason: unknown) => { if (current) setError(reason instanceof Error ? reason.message : "Unable to load data"); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  // The caller owns the dependency list, matching React's built-in effect contract.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...dependencies, revision]);

  return { data, loading, error, reload, setData };
}
