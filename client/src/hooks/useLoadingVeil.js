import { useEffect, useState } from 'react';
import { veilHoldMs, VEIL_FADE_MS } from '../utils/loadingVeil.js';

// 'shown' -> 'fading' -> 'gone'. Only a fresh page load starts shown: arriving
// here later (after signing in) must not put a skeleton in front of a ready app.
export function useLoadingVeil(loading) {
  const [phase, setPhase] = useState(() => (loading || veilHoldMs(performance.now()) > 0 ? 'shown' : 'gone'));

  useEffect(() => {
    if (loading || phase !== 'shown') return undefined;
    const hold = setTimeout(() => setPhase('fading'), veilHoldMs(performance.now()));
    return () => clearTimeout(hold);
  }, [loading, phase]);

  useEffect(() => {
    if (phase !== 'fading') return undefined;
    const done = setTimeout(() => setPhase('gone'), VEIL_FADE_MS);
    return () => clearTimeout(done);
  }, [phase]);

  return phase;
}
