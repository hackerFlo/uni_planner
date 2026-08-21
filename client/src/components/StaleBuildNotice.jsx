import { useEffect, useRef } from 'react';
import { useToast } from '../context/ToastContext';
import { parseAssetUrls, isStale } from '../api/buildCheck';

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

// A stale service worker can pin a browser to an old bundle indefinitely, and
// nothing in the app used to notice. This asks the server what it is actually
// serving and offers a way out.
export default function StaleBuildNotice() {
  const toast = useToast();
  const notifiedRef = useRef(false);
  const lastCheckedRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      if (notifiedRef.current || Date.now() - lastCheckedRef.current < RECHECK_AFTER_MS) return;
      lastCheckedRef.current = Date.now();
      try {
        const deployed = await deployedAssetUrls();
        if (cancelled || !isStale(runningAssetUrls(), deployed)) return;
        notifiedRef.current = true;
        toast.warning('This page is running an older version.', {
          duration: 0,
          action: { label: 'Reload', onClick: reloadClean },
        });
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
  }, [toast]);

  return null;
}
