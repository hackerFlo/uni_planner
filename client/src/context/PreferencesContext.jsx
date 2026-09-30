import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_PREFERENCES, loadPreferences, savePreferences, resolveTheme, normalizePreferences, loadPreferenceProfile,
} from '../utils/preferences';
import { PreferencesSync } from '../utils/preferencesSync';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { userMessage } from '../api/errors';

const PreferencesContext = createContext(null);

export function PreferencesProvider({ children }) {
  const { user, loading } = useAuth();
  const toast = useToast();
  const [guestPreferences, setGuestPreferences] = useState(loadPreferences);
  const [snapshot, setSnapshot] = useState(null);
  const accountId = loading ? null : user?.id ?? null;
  const scope = useMemo(() => ({ accountId }), [accountId]);
  const scopeRef = useRef(scope);
  const syncRef = useRef(null);
  scopeRef.current = scope;
  const cached = useMemo(() => accountId === null ? null : loadPreferenceProfile(accountId)?.settings ?? loadPreferences(), [accountId]);
  const current = snapshot?.scope === scope ? snapshot : null;
  const preferences = accountId === null ? guestPreferences : current?.preferences ?? cached;
  const [systemPrefersDark, setSystemPrefersDark] = useState(
    () => globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
  );

  useEffect(() => {
    if (scope.accountId === null) return;
    const sync = new PreferencesSync({ accountId: scope.accountId,
      onState: state => { if (scopeRef.current === scope) setSnapshot({ ...state, scope }); },
      onError: error => {
        if (scopeRef.current === scope) toast.error(userMessage(error), { ref: error.requestId,
          action: { label: 'Reload preferences', onClick: () => {
            if (syncRef.current?.scope === scope) syncRef.current.sync.load();
          } } });
      } });
    syncRef.current = { scope, sync };
    sync.load();
    return () => { sync.close(); if (syncRef.current?.sync === sync) syncRef.current = null; };
  }, [scope, toast]);

  // Only matters while the theme is 'system', but the listener is cheap and
  // keeping it unconditional avoids re-subscribing every time the theme changes.
  useEffect(() => {
    const query = globalThis.matchMedia?.('(prefers-color-scheme: dark)');
    if (!query) return undefined;
    const onChange = (e) => setSystemPrefersDark(e.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const resolvedTheme = resolveTheme(preferences.theme, systemPrefersDark);

  // Applied to <html> rather than a wrapper div so the class is in place for
  // portalled modals and for the background painted behind the app.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', resolvedTheme === 'dark');
    root.dataset.density = preferences.density;
    root.classList.toggle('reduce-motion', preferences.reduceMotion);
    root.style.colorScheme = resolvedTheme;
  }, [resolvedTheme, preferences.density, preferences.reduceMotion]);

  const update = useCallback((patch) => {
    if (scope.accountId !== null) return syncRef.current?.scope === scope ? syncRef.current.sync.update(patch) : undefined;
    setGuestPreferences(prev => {
      const next = normalizePreferences({ ...prev, ...patch });
      savePreferences(next);
      return next;
    });
  }, [scope]);

  const reset = useCallback(() => {
    if (scope.accountId !== null) return syncRef.current?.scope === scope ? syncRef.current.sync.reset() : undefined;
    setGuestPreferences({ ...DEFAULT_PREFERENCES });
    savePreferences(DEFAULT_PREFERENCES);
  }, [scope]);

  const refreshPreferences = useCallback((options) => {
    const active = syncRef.current;
    if (active?.scope !== scope || active.sync.state.saving) return Promise.resolve(false);
    return active.sync.load(options);
  }, [scope]);

  const value = useMemo(
    () => ({ preferences, resolvedTheme, update, reset, refreshPreferences,
      profileId: current?.profileId ?? null, preferencesReady: accountId === null || Boolean(current?.ready),
      preferencesSaving: Boolean(current?.saving), preferencesError: current?.error ?? null }),
    [preferences, resolvedTheme, update, reset, refreshPreferences, current, accountId]
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences must be used inside PreferencesProvider');
  return ctx;
}
