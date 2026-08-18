import { useEffect } from 'react';
import { useToast } from '../context/ToastContext';
import { KINDS, userMessage } from '../api/errors';

const THROTTLE_MS = 5000;

// A number of call sites still fire API calls with no catch of their own. Rather
// than editing every one, whatever escapes lands here, so a failure is never
// completely silent (EL-1). A burst of failures raises one toast, not twenty.
export default function GlobalErrorToast() {
  const toast = useToast();

  useEffect(() => {
    let lastShownAt = 0;

    function report(error) {
      // An expired session already redirects to /login; a toast on top is noise.
      if (error?.kind === KINDS.UNAUTHORIZED) return;
      if (Date.now() - lastShownAt < THROTTLE_MS) return;
      lastShownAt = Date.now();
      console.error('[app] unhandled', {
        version: __APP_VERSION__,
        commit: __APP_COMMIT__,
        kind: error?.kind,
        message: error?.message,
      });
      toast.error(userMessage(error), { ref: error?.requestId ?? null });
    }

    const onRejection = (e) => report(e.reason);
    // Also fires for failed image/script loads, where e.error is null.
    const onError = (e) => { if (e.error instanceof Error) report(e.error); };

    window.addEventListener('unhandledrejection', onRejection);
    window.addEventListener('error', onError);
    return () => {
      window.removeEventListener('unhandledrejection', onRejection);
      window.removeEventListener('error', onError);
    };
  }, [toast]);

  return null;
}
