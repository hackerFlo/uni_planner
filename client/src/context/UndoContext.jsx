import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

const UndoContext = createContext(null);

const UNDO_WINDOW_MS = 30000;

export function UndoProvider({ children }) {
  const [canUndo, setCanUndo] = useState(false);
  const undoFnRef = useRef(null);
  const undoTimerRef = useRef(null);

  // The pending action lives in a ref, so both callbacks can stay identity-stable
  // for the life of the provider and neither can close over a stale one.
  const recordUndo = useCallback((revertFn) => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    if (typeof revertFn !== 'function') {
      undoFnRef.current = null;
      setCanUndo(false);
      return;
    }
    undoFnRef.current = revertFn;
    setCanUndo(true);
    undoTimerRef.current = setTimeout(() => {
      undoFnRef.current = null;
      setCanUndo(false);
    }, UNDO_WINDOW_MS);
  }, []);

  const undo = useCallback(async () => {
    if (!undoFnRef.current) return;
    const revert = undoFnRef.current;
    undoFnRef.current = null;
    setCanUndo(false);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    await revert();
  }, []);

  useEffect(() => () => clearTimeout(undoTimerRef.current), []);

  // Memoised on the only value that can actually change: an object literal here
  // re-rendered every consumer twice per action -- once on the mutation, again
  // when the expiry timer fired.
  const value = useMemo(() => ({ canUndo, undo, recordUndo }), [canUndo, undo, recordUndo]);

  return (
    <UndoContext.Provider value={value}>
      {children}
    </UndoContext.Provider>
  );
}

export function useUndo() {
  return useContext(UndoContext);
}
