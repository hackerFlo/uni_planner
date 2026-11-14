import { useCallback, useEffect, useRef } from 'react';
import { TILT_VAR, tiltFromDelta } from '../utils/dropTransition';

const SETTLE_MS = 80;

// Follows the pointer and writes the lean onto the element as a CSS custom
// property each frame. Nothing here touches React state: the dragged card used
// to re-render sixty times a second just to change one number.
function trackTilt(node) {
  let prevX = null;
  let pendingX = 0;
  let rafId = null;
  let lastMoveAt = 0;
  let settleTimer = null;
  const setTilt = deg => node.style.setProperty(TILT_VAR, `${deg}deg`);

  // One timer covers the whole drag: it re-arms for whatever is left of the
  // quiet period instead of being cleared and recreated on every frame.
  function settle() {
    const remaining = SETTLE_MS - (performance.now() - lastMoveAt);
    settleTimer = remaining > 0 ? setTimeout(settle, remaining) : null;
    if (remaining <= 0) setTilt(0);
  }

  function applyFrame() {
    rafId = null;
    if (prevX !== null) {
      setTilt(tiltFromDelta(pendingX - prevX));
      lastMoveAt = performance.now();
      if (settleTimer === null) settleTimer = setTimeout(settle, SETTLE_MS);
    }
    prevX = pendingX;
  }

  function handleMove(e) {
    pendingX = e.clientX;
    if (rafId === null) rafId = requestAnimationFrame(applyFrame);
  }

  function stop() {
    window.removeEventListener('pointermove', handleMove);
    window.removeEventListener('pointerup', stop);
    clearTimeout(settleTimer);
    settleTimer = null;
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = null;
    prevX = null;
    setTilt(0);
  }

  window.addEventListener('pointermove', handleMove);
  window.addEventListener('pointerup', stop);
  return stop;
}

// The lean a dragged card takes on, proportional to how fast the pointer is
// moving sideways. It lives in a hook because a divider has to drag exactly
// like a todo card -- one that stayed flat while the cards tilted would read
// as a different kind of object. The hook needs the element, so it hands back a
// ref callback that also forwards to the library's `provided.innerRef`.
export function useDragTilt(isDragging, innerRef) {
  const nodeRef = useRef(null);
  const setNode = useCallback(node => {
    nodeRef.current = node;
    innerRef(node);
  }, [innerRef]);

  useEffect(() => {
    const node = nodeRef.current;
    return isDragging && node ? trackTilt(node) : undefined;
  }, [isDragging]);

  return setNode;
}
