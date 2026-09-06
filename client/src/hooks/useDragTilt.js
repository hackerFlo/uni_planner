import { useEffect, useRef, useState } from 'react';

const MAX_TILT_DEG = 12;
const TILT_PER_PX = 1.5;
const SETTLE_MS = 80;

// The lean a dragged card takes on, proportional to how fast the pointer is
// moving sideways. It lives in a hook because a divider has to drag exactly
// like a todo card -- one that stayed flat while the cards tilted would read
// as a different kind of object.
export function useDragTilt(isDragging) {
  const [rotation, setRotation] = useState(0);
  const prevXRef = useRef(null);
  const decayRef = useRef(null);

  useEffect(() => {
    if (!isDragging) {
      setRotation(0);
      prevXRef.current = null;
      return;
    }
    let rafId = null;
    let pendingX = null;
    function handleMove(e) {
      pendingX = e.clientX;
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (prevXRef.current !== null) {
          const dx = pendingX - prevXRef.current;
          setRotation(Math.max(-MAX_TILT_DEG, Math.min(MAX_TILT_DEG, dx * TILT_PER_PX)));
          clearTimeout(decayRef.current);
          decayRef.current = setTimeout(() => setRotation(0), SETTLE_MS);
        }
        prevXRef.current = pendingX;
      });
    }
    function handleUp() {
      setRotation(0);
      prevXRef.current = null;
      if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    }
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      clearTimeout(decayRef.current);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [isDragging]);

  return rotation;
}
