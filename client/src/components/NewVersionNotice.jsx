import { useCallback, useEffect, useRef } from 'react';
import { useToast } from '../context/ToastContext';
import { parseAssetUrls, isStale } from '../api/buildCheck';

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;
const RECHECK_AFTER_MS = 5 * 60 * 1000;

function runningAssetUrls() {
  const nodes = document.querySelectorAll('script[src*="/assets/"], link[href*="/assets/"]');
  return [...nodes]
    .map((el) => new URL(el.getAttribute('src') ?? el.getAttribute('href'), window.location.origin).pathname)
    .sort();
}

// index.html is no longer precached and there is no NavigationRoute (see the
// workbox block in vite.config.js), so nothing in the service worker can answer
// this -- it reaches nginx even when the worker is stale, which is precisely the
// case being detected. The cache-busting query string is belt-and-braces against
// an older worker that still holds a precached index.html.
async function deployedAssetUrls() {
  const res = await fetch(`/index.html?_=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) return [];
  return parseAssetUrls(await res.text());
}

// Used for both detectors, not just the stale one. It is a strict superset of a
// plain reload and always lands on the new build; the cost is that a worker that
// just activated gets unregistered and re-primes its precache on the next load,
// which registerSW.js does immediately. Given AR-14 -- a stale worker once hid
// deploys for days with no error anywhere -- that is worth one redundant fetch.
async function reloadClean() {
  try {
    const registrations = (await navigator.serviceWorker?.getRegistrations?.()) ?? [];
    await Promise.all(registrations.map((registration) => registration.unregister()));
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch (err) {
    // Reload anyway: a partial clear still beats staying on the old bundle.
    console.warn('[build] could not clear caches before reload:', err.message);
  }
  window.location.reload();
}

// Two independent detectors, one message. A new worker claiming the page catches
// the ordinary deploy quickly; the asset fingerprint is the only thing that
// catches a worker pinned to an old bundle, where the handover never happens at
// all. Both mean exactly one thing to the reader -- this page is not the newest
// build -- so announcing them separately only produced the same sentence twice,
// in two colours implying two severities.
export default function NewVersionNotice() {
  const toast = useToast();
  const announcedRef = useRef(false);
  const lastCheckedRef = useRef(0);

  // Latched for the page load: dismissing is the user choosing to carry on, and
  // re-announcing on the next tab focus would be nagging. `info`, not `warning`
  // -- nothing has failed, and amber is this app's colour for something that did.
  const announce = useCallback(() => {
    if (announcedRef.current) return;
    announcedRef.current = true;
    toast.info('A new version is available.', {
      duration: 0, // an update the user never sees is the bug being fixed
      action: { label: 'Reload', onClick: reloadClean },
    });
  }, [toast]);

  // A new service worker self-activates and claims this page, but the JavaScript
  // already running is still the old build -- only a reload picks up the new
  // assets. `controllerchange` is exactly that moment.
  useEffect(() => {
    const container = navigator.serviceWorker;
    if (!container) return undefined;

    // Already controlled means a later handover is a genuine update rather than
    // this page being claimed for the first time.
    if (!container.controller) return undefined;

    container.addEventListener('controllerchange', announce);
    return () => container.removeEventListener('controllerchange', announce);
  }, [announce]);

  // Left alone, the browser only re-checks /sw.js on navigation -- which for an
  // installed PWA that is never fully closed can be days apart. Ask explicitly.
  useEffect(() => {
    if (!navigator.serviceWorker) return undefined;

    const checkForUpdate = async () => {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        await registration?.update();
      } catch (err) {
        console.warn('[pwa] update check failed:', err.message);
      }
    };

    const onVisible = () => { if (document.visibilityState === 'visible') checkForUpdate(); };
    const timer = setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  // Asks the server what it is actually serving. A stale service worker can pin a
  // browser to an old bundle indefinitely without ever firing controllerchange.
  useEffect(() => {
    let cancelled = false;

    async function check() {
      if (announcedRef.current || Date.now() - lastCheckedRef.current < RECHECK_AFTER_MS) return;
      lastCheckedRef.current = Date.now();
      try {
        const deployed = await deployedAssetUrls();
        if (cancelled || !isStale(runningAssetUrls(), deployed)) return;
        announce();
      } catch (err) {
        // A background check must never become noise of its own.
        console.warn('[build] freshness check failed:', err.message);
      }
    }

    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    check();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [announce]);

  return null;
}
