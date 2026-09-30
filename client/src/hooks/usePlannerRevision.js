import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { plannerApi } from '../api/planner.js';
import { PlannerRevisionPoller } from './plannerRevision.js';

export default function usePlannerRevision({ onChange, paused = false }) {
  const { user, loading } = useAuth();
  const accountId = loading ? null : user?.id ?? null;
  const scope = useMemo(() => ({ accountId }), [accountId]);
  const scopeRef = useRef(scope);
  const callback = useRef(onChange);
  const pausedRef = useRef(paused);
  const pollerRef = useRef(null);
  const [snapshot, setSnapshot] = useState(null);
  callback.current = onChange;
  pausedRef.current = paused;
  scopeRef.current = scope;

  useEffect(() => {
    if (scope.accountId === null) return;
    const poller = new PlannerRevisionPoller({ readVersion: plannerApi.getVersion,
      onChange: (version, options) => { if (scopeRef.current === scope) return callback.current(version, options); },
      onState: state => { if (scopeRef.current === scope) setSnapshot({ ...state, scope }); } });
    pollerRef.current = poller;
    poller.setVisible(document.visibilityState !== 'hidden');
    poller.setPaused(pausedRef.current);
    const visibility = () => poller.setVisible(document.visibilityState !== 'hidden');
    const focus = () => { visibility(); poller.refresh(); };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('focus', focus);
    poller.start();
    return () => {
      poller.stop();
      if (pollerRef.current === poller) pollerRef.current = null;
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('focus', focus);
    };
  }, [scope]);

  useEffect(() => { pollerRef.current?.setPaused(paused); }, [paused]);
  const refresh = useCallback(() => pollerRef.current?.refresh(), []);
  const current = accountId !== null && snapshot?.scope === scope ? snapshot : null;
  return { version: current?.version ?? null, error: current?.error ?? null, polling: current?.polling ?? false, refresh };
}
