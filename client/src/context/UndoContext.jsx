import { createContext, useCallback, useContext, useRef, useState } from 'react';

const UndoContext = createContext(null);

const UNDO_WINDOW_MS = 30000;

export function UndoProvider({ children }) {
  const [canUndo, setCanUndo] = useState(false);
  const undoFnRef = useRef(null);
  const undoTimerRef = useRef(null);

  const recordUndo = useCallback((revertFn) => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
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

  return (
    <UndoContext.Provider value={{ canUndo, undo, recordUndo }}>
      {children}
    </UndoContext.Provider>
  );
}

export function useUndo() {
  return useContext(UndoContext);
}
