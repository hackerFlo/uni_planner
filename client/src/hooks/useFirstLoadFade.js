import { useState } from 'react';
import { finishFade, nextFadePhase } from '../utils/fadePhase';

// Class and handler for the one-time fade that replaces a skeleton. Spread the
// class on the content wrapper and the handler on the same element.
export function useFirstLoadFade(showSkeleton) {
  const [phase, setPhase] = useState('idle');
  const next = nextFadePhase(phase, showSkeleton);
  if (next !== phase) setPhase(next);

  return {
    fadeClass: phase === 'fading' ? ' content-fade' : '',
    onFadeEnd: e => { if (e.target === e.currentTarget) setPhase(finishFade); },
  };
}
