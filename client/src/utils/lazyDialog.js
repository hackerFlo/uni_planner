import { lazy } from 'react';
import { loadWithReload } from './chunkReload.js';

const browserDeps = () => ({
  storage: sessionStorage,
  reload: () => window.location.reload(),
  isOnline: () => navigator.onLine !== false,
});

// React.lazy for a dialog that renders on demand. `preload` starts the fetch
// ahead of the first open; a failed preload is only logged, because the real
// render retries and reaches the ErrorBoundary if it still fails.
export function lazyDialog(importer) {
  const load = () => loadWithReload(importer, browserDeps());
  const Component = lazy(load);
  Component.preload = () => load().catch(error => console.warn('[chunk] preload failed:', error.name));
  return Component;
}

export function preloadOnIdle(components) {
  const schedule = window.requestIdleCallback ?? (run => setTimeout(run, 1500));
  const cancel = window.cancelIdleCallback ?? clearTimeout;
  const handle = schedule(() => components.forEach(component => component.preload()));
  return () => cancel(handle);
}
