import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_PREFERENCES, loadPreferences, savePreferences, resolveTheme,
} from '../utils/preferences';

const PreferencesContext = createContext(null);

export function PreferencesProvider({ children }) {
  const [preferences, setPreferences] = useState(loadPreferences);
  const [systemPrefersDark, setSystemPrefersDark] = useState(
    () => globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
  );

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
    setPreferences(prev => {
      const next = { ...prev, ...patch };
      savePreferences(next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setPreferences({ ...DEFAULT_PREFERENCES });
    savePreferences(DEFAULT_PREFERENCES);
  }, []);

  const value = useMemo(
    () => ({ preferences, resolvedTheme, update, reset }),
    [preferences, resolvedTheme, update, reset]
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences must be used inside PreferencesProvider');
  return ctx;
}
