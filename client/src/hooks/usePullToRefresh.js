import { useEffect, useRef, useState } from 'react';
import { pullDistance, shouldRefresh, isAtTop } from '../utils/pullToRefresh';

// An installed PWA has no browser chrome, and therefore none of Safari's own
// pull-to-refresh. This puts it back. Gated to standalone display mode on
// purpose: inside a normal browser tab the native gesture already exists and two
// of them fighting is worse than neither.
function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
}

function scrollableAncestor(node) {
  for (let el = node; el && el !== document.body; el = el.parentElement) {
    const style = window.getComputedStyle(el);
    if (/(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight) return el;
  }
  return null;
}

export function usePullToRefresh(onRefresh) {
  const [distance, setDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(null);
  const surface = useRef(null);
  const refreshRef = useRef(onRefresh);
  useEffect(() => { refreshRef.current = onRefresh; }, [onRefresh]);

  useEffect(() => {
    if (!isStandalone()) return undefined;

    function onTouchStart(e) {
      if (e.touches.length !== 1) return;
      const el = scrollableAncestor(e.target);
      if (!isAtTop(el)) return;
      surface.current = el;
      startY.current = e.touches[0].clientY;
    }

    function onTouchMove(e) {
      if (startY.current === null) return;
      const dy = e.touches[0].clientY - startY.current;
      // Let go the moment the surface scrolls, or the gesture hijacks scrolling.
      if (dy <= 0 || !isAtTop(surface.current)) {
        startY.current = null;
        setDistance(0);
        return;
      }
      // Non-passive listener purely so this call is allowed: without it iOS
      // rubber-bands the whole page behind the indicator.
      e.preventDefault();
      setDistance(pullDistance(dy));
    }

    function onTouchEnd() {
      if (startY.current === null) return;
      startY.current = null;
      // Read the travelled distance through the setter: the touchmove updates are
      // async, so the closure's copy can lag behind what is on screen.
      setDistance(current => {
        if (!shouldRefresh(current)) return 0;
        setRefreshing(true);
        Promise.resolve(refreshRef.current?.())
          .catch(() => { /* the caller surfaces the error; the spinner must still stop */ })
          .finally(() => { setRefreshing(false); setDistance(0); });
        return current;
      });
    }

    const opts = { passive: false };
    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, opts);
    document.addEventListener('touchend', onTouchEnd, { passive: true });
    document.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove, opts);
      document.removeEventListener('touchend', onTouchEnd);
      document.removeEventListener('touchcancel', onTouchEnd);
    };
  }, []);

  return { distance, refreshing };
}

export default usePullToRefresh;
