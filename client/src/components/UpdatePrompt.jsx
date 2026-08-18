import { useEffect } from 'react';
import { useToast } from '../context/ToastContext';

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

  return null;
}
