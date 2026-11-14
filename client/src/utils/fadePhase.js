// The one-time fade that hands a skeleton over to real content. It runs once per
// mount and ends when the animation does, rather than leaving the class on: an
// element that keeps a finished opacity animation keeps a stacking context, and
// a card being dragged out of it would paint beneath the next column.
export function nextFadePhase(phase, showSkeleton) {
  if (phase === 'idle' && showSkeleton) return 'skeleton';
  if (phase === 'skeleton' && !showSkeleton) return 'fading';
  return phase;
}

export function finishFade(phase) {
  return phase === 'fading' ? 'done' : phase;
}
