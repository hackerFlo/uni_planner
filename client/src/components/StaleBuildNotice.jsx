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

// The query string is what makes this reliable. Workbox's precache only strips
// utm_*/fbclid before matching, so `?_=` misses the precached index.html, and
// its NavigationRoute only handles requests whose mode is 'navigate', which a
// fetch is not. So this reaches nginx even when the service worker is stale --
// which is precisely the case being detected.
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
