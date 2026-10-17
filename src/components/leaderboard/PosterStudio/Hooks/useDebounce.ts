import { useState, useEffect } from 'react';

/**
 * ADD-ON 1 — Debounced Input Hook
 * Raw input value updates local state instantly.
 * Debounced value propagates to layerStore after `delay`ms.
 */
export function useDebounce<T>(value: T, delay = 150): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
