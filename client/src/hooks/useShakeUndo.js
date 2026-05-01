import { useEffect, useRef } from 'react';

const THRESHOLD = 25;    // m/s² — typical shake acceleration
const COOLDOWN_MS = 1500; // minimum ms between undo triggers

export function useShakeUndo(canUndo, undo) {
  const lastTrigger = useRef(0);
  const canUndoRef = useRef(canUndo);
  const undoRef = useRef(undo);
  const listeningRef = useRef(false);

  useEffect(() => { canUndoRef.current = canUndo; }, [canUndo]);
  useEffect(() => { undoRef.current = undo; }, [undo]);

  useEffect(() => {
    if (typeof DeviceMotionEvent === 'undefined') return;

    function handleMotion(e) {
      const acc = e.accelerationIncludingGravity;
      if (!acc) return;
      const magnitude = Math.sqrt((acc.x ?? 0) ** 2 + (acc.y ?? 0) ** 2 + (acc.z ?? 0) ** 2);
      const now = Date.now();
      if (magnitude > THRESHOLD && canUndoRef.current && now - lastTrigger.current > COOLDOWN_MS) {
        lastTrigger.current = now;
        undoRef.current();
      }
    }

    function startListening() {
      if (listeningRef.current) return;
      listeningRef.current = true;
      window.addEventListener('devicemotion', handleMotion);
    }

    // On Android / non-iOS the event fires without a permission gate
    if (typeof DeviceMotionEvent.requestPermission !== 'function') {
      startListening();
      return () => window.removeEventListener('devicemotion', handleMotion);
    }

    // iOS 13+: permission must be requested from a user-gesture handler.
    // We attach a one-time touchstart listener; on first tap we request
    // permission and, if granted, start listening to devicemotion.
    async function onFirstTouch() {
      window.removeEventListener('touchstart', onFirstTouch);
      try {
        const result = await DeviceMotionEvent.requestPermission();
        if (result === 'granted') startListening();
      } catch {
        // permission denied or unsupported — silent fail
      }
    }

    window.addEventListener('touchstart', onFirstTouch, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onFirstTouch);
      window.removeEventListener('devicemotion', handleMotion);
    };
  }, []);
}
