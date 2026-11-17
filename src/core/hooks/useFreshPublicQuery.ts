import { useEffect, useState } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';

const MAX_AGE_MS = 30_000;

export function useFreshPublicQuery<T>(query: UseQueryResult<T>, enabled: boolean) {
  const [, setExpiryTick] = useState(0);
  useEffect(() => {
    if (!enabled || !query.dataUpdatedAt) return;
    const delay = query.dataUpdatedAt + MAX_AGE_MS - Date.now();
    if (delay <= 0) return;
    const timer = setTimeout(() => setExpiryTick((tick) => tick + 1), delay + 1);
    return () => clearTimeout(timer);
  }, [enabled, query.dataUpdatedAt]);

  const fresh = enabled && query.dataUpdatedAt > 0 && Date.now() < query.dataUpdatedAt + MAX_AGE_MS;
  return { ...query, data: fresh ? query.data : undefined, isLoading: enabled && !fresh };
}
