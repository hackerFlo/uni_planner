import { useEffect, useRef } from 'react';

const THRESHOLD = 25;    // m/s² — typical shake acceleration
const COOLDOWN_MS = 1500; // minimum ms between undo triggers

export function useShakeUndo(canUndo, undo) {
  const lastTrigger = useRef(0);
  const undoRef = useRef(undo);

  useEffect(() => { undoRef.current = undo; }, [undo]);

  useEffect(() => {
    if (typeof DeviceMotionEvent === 'undefined') return;
    if (!canUndo) return;

    let attached = false;

    function handleMotion(e) {
      const acc = e.accelerationIncludingGravity;
      if (!acc) return;
      const magnitude = Math.sqrt((acc.x ?? 0) ** 2 + (acc.y ?? 0) ** 2 + (acc.z ?? 0) ** 2);
      const now = Date.now();
      if (magnitude > THRESHOLD && now - lastTrigger.current > COOLDOWN_MS) {
        lastTrigger.current = now;
        undoRef.current();
      }
    }

    function doAttach() {
      if (attached) return;
      attached = true;
      window.addEventListener('devicemotion', handleMotion);
    }
    function doDetach() {
      if (!attached) return;
      attached = false;
      window.removeEventListener('devicemotion', handleMotion);
    }
    function onVisibility() {
      if (document.visibilityState === 'visible') doAttach(); else doDetach();
    }
    document.addEventListener('visibilitychange', onVisibility);

    // Android / non-iOS: permission is always available
    if (typeof DeviceMotionEvent.requestPermission !== 'function') {
      if (document.visibilityState === 'visible') doAttach();
      return () => {
        doDetach();
        document.removeEventListener('visibilitychange', onVisibility);
      };
    }

    // iOS 13+: request permission on first tap
    async function onFirstTouch() {
      window.removeEventListener('touchstart', onFirstTouch);
      try {
        const result = await DeviceMotionEvent.requestPermission();
        if (result === 'granted' && document.visibilityState === 'visible') doAttach();
      } catch { /* permission denied or unsupported */ }
    }
    window.addEventListener('touchstart', onFirstTouch, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onFirstTouch);
      doDetach();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [canUndo]);
}
