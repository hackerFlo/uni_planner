import { useEffect, useState } from 'react';
import { advanceFresh, expireFresh, EMPTY_IDS, INITIAL_FRESH_STATE, PLOP_MS } from '../utils/freshIds';

const EXPIRY_SLACK_MS = 100;

function prefersReducedMotion() {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// The ids of todos created during this session that have just appeared, for the
// length of their enter animation only. State is derived during render (the
// pattern TodoList already uses for its skeleton hand-off) so the card renders
// with the animation in its very first frame instead of a frame late.
export function useFreshIds(todos, ready) {
  const [state, setState] = useState(INITIAL_FRESH_STATE);
  if (ready) {
    const next = advanceFresh(state, todos, Date.now());
    if (next !== state) setState(next);
  }

  useEffect(() => {
    if (state.fresh.size === 0) return undefined;
    const timer = setTimeout(() => setState(expireFresh), PLOP_MS + EXPIRY_SLACK_MS);
    return () => clearTimeout(timer);
  }, [state.fresh]);

  return state.fresh.size > 0 && prefersReducedMotion() ? EMPTY_IDS : state.fresh;
}
