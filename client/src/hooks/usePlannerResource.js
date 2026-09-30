import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client';
import { userMessage } from '../api/errors';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useUndo } from '../context/UndoContext';
import { PlannerResource } from './plannerResource.js';
import { plannerResourceSnapshot } from './plannerResourceSnapshot.js';

export function usePlannerResource(path, field, { autoLoad = true, requireVersion = true } = {}) {
  const { user } = useAuth();
  const toast = useToast();
  const { recordOperation } = useUndo();
  const scope = useMemo(() => ({ id: user?.id }), [user?.id]);
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const [snapshot, setSnapshot] = useState(null);
  const resource = useMemo(() => new PlannerResource({
    read: options => api.get(path, options), select: result => result[field], requireVersion,
    onState: state => { if (scopeRef.current === scope) setSnapshot({ resource, state }); },
  }), [path, field, requireVersion, scope]);
  const reportFailure = useCallback((what, error) => {
    if (error.name !== 'AbortError') toast?.error(`${what}. ${userMessage(error)}`, { ref: error.requestId ?? null });
  }, [toast]);
  const refresh = useCallback(options => scope.id ? resource.refresh(options) : Promise.resolve(false), [resource, scope]);
  const refreshSafely = useCallback(async options => {
    try { return await refresh(options); }
    catch (error) { reportFailure('Could not refresh planner', error); return false; }
  }, [refresh, reportFailure]);
  useEffect(() => {
    // StrictMode repeats setup/cleanup: reopen only this still-current instance.
    resource.closed = false;
    resource.lifetime = new AbortController();
    if (autoLoad) refreshSafely();
    return () => resource.close();
  }, [resource, autoLoad, refreshSafely]);
  const state = plannerResourceSnapshot(snapshot, resource);
  const captureVersion = useCallback(() => state.version ? { ...state.version } : null, [state.version]);
  const readSnapshotVersion = useCallback(() => resource.captureVersion(), [resource]);
  const mutate = useCallback(async (write, controls, refreshAfter = refreshSafely) => {
    const result = await resource.mutate(write, { expectedVersion: captureVersion(), ...controls });
    if (scopeRef.current !== scope) throw new DOMException('Account changed', 'AbortError');
    recordOperation(result, refreshAfter);
    await refreshAfter();
    return result;
  }, [resource, scope, recordOperation, refreshSafely, captureVersion]);
  return { ...state, refresh, refreshSafely, mutate, captureVersion, readSnapshotVersion, reportFailure };
}
