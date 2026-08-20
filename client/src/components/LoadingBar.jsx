import { useEffect, useRef, useState } from 'react';
import { subscribeActivity, isBusy } from '../api/activity';

// A thin progress bar across the top, in the vein of YouTube's. Two delays do the
// real work: it only appears once a request has been slow enough to be worth
// mentioning, and it lingers briefly at full width so a completed request reads
// as finished rather than cancelled. Without them, every fast call would flash.
const APPEAR_AFTER_MS = 200;
const FADE_OUT_MS = 300;

export default function LoadingBar() {
  const [phase, setPhase] = useState('idle'); // 'idle' | 'running' | 'finishing'
  const appearTimer = useRef(null);
  const fadeTimer = useRef(null);

  useEffect(() => {
    const apply = (count) => {
      clearTimeout(appearTimer.current);
      clearTimeout(fadeTimer.current);

      if (count > 0) {
        appearTimer.current = setTimeout(() => setPhase('running'), APPEAR_AFTER_MS);
        return;
      }
      // Never went visible: drop straight back to idle with no flash.
      setPhase(prev => {
        if (prev === 'idle') return 'idle';
        fadeTimer.current = setTimeout(() => setPhase('idle'), FADE_OUT_MS);
        return 'finishing';
      });
    };

    const unsubscribe = subscribeActivity(apply);
    if (isBusy()) apply(1); // a request may already be open when we mount
    return () => {
      unsubscribe();
      clearTimeout(appearTimer.current);
      clearTimeout(fadeTimer.current);
    };
  }, []);

  if (phase === 'idle') return null;

  return (
    <div
      // Decorative: the outcome is announced by the toast, and a live region
      // firing on every request would be unusable with a screen reader.
      aria-hidden="true"
      className="fixed top-0 left-0 right-0 z-[100] h-0.5 pointer-events-none"
    >
      <div
        className={`h-full bg-indigo-500 loading-bar ${phase === 'finishing' ? 'loading-bar--done' : ''}`}
      />
    </div>
  );
}
