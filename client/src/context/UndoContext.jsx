import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { plannerApi } from '../api/planner';
import { userMessage } from '../api/errors';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { undoOperation } from './undoOperation';

const UndoContext = createContext(null);
export function UndoProvider({ children }) {
  const { user } = useAuth();
  const toast = useToast();
  const scope = useMemo(() => ({ accountId: user?.id }), [user?.id]);
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const [slot, setSlot] = useState(null);
  const slotRef = useRef(null);
  const busy = useRef(false);
  const install = useCallback(value => { slotRef.current = value; setSlot(value); }, []);
  const recordOperation = useCallback((receipt, refresh) => {
    const operation = undoOperation(receipt, refresh);
    install(operation ? { ...operation, scope } : null);
  }, [install, scope]);
  useEffect(() => {
    scope.controller = new AbortController();
    return () => scope.controller.abort();
  }, [scope]);
  useEffect(() => {
    if (!slot) return;
    const timer = setTimeout(() => { if (slotRef.current === slot) install(null); }, Math.max(0, slot.expires - Date.now()));
    return () => clearTimeout(timer);
  }, [slot, install]);
  const undo = useCallback(async () => {
    const pending = slotRef.current;
    if (!pending || pending.scope !== scopeRef.current || busy.current || pending.expires <= Date.now()) return;
    busy.current = true;
    try {
      await plannerApi.undo(pending.operationId, { expectedVersion: pending.expectedVersion,
        idempotencyKey: pending.idempotencyKey, signal: pending.scope.controller.signal });
      if (slotRef.current === pending) install(null);
      if (pending.scope === scopeRef.current) await pending.refresh?.();
    } catch (error) {
      if (pending.scope !== scopeRef.current) return;
      if (error.status >= 400 && error.status < 500 && error.status !== 429) install(null);
      toast?.error(`Could not undo. ${userMessage(error)}`, { ref: error.requestId ?? null });
    } finally { busy.current = false; }
  }, [install, toast]);
  const canUndo = Boolean(slot && slot.scope === scope && slot.expires > Date.now());
  const value = useMemo(() => ({ canUndo, undo, recordOperation }), [canUndo, undo, recordOperation]);
  return <UndoContext.Provider value={value}>{children}</UndoContext.Provider>;
}
export function useUndo() { return useContext(UndoContext); }
