import { useEffect } from 'react';
import { useToast } from '../context/ToastContext';

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

// A new service worker self-activates and claims this page, but the JavaScript
// already running is still the old build -- only a reload picks up the new
// assets. That handover used to be completely invisible, which is a large part
// of why "is the new version live?" was unanswerable. `controllerchange` is
// exactly that moment.
export default function UpdatePrompt() {
  const toast = useToast();

  useEffect(() => {
    const container = navigator.serviceWorker;
    if (!container) return;

    // Already controlled means a later handover is a genuine update rather than
    // this page being claimed for the first time.
    if (!container.controller) return;

    const onControllerChange = () => {
      toast.info('A new version is ready.', {
        duration: 0, // an update the user never sees is the bug being fixed
        action: { label: 'Reload', onClick: () => window.location.reload() },
      });
    };

    container.addEventListener('controllerchange', onControllerChange);
    return () => container.removeEventListener('controllerchange', onControllerChange);
  }, [toast]);

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

  return null;
}
