import { useCallback, useRef } from 'react';

// A function with a fixed identity that always runs the latest closure, so a
// memoised child keeps skipping renders while the handler reads current state.
export function useStableCallback(fn) {
  const latest = useRef(fn);
  latest.current = fn;
  return useCallback((...args) => latest.current(...args), []);
}
