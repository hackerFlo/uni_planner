import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createDismissTimer } from '../utils/dismissTimer';

const ToastContext = createContext(null);

const DEFAULT_DURATION_MS = 4000;

const STYLES = {
  success: 'bg-emerald-50 dark:bg-emerald-950 text-emerald-800 border-emerald-200 dark:border-emerald-900',
  error: 'bg-red-50 dark:bg-red-950 text-red-700 border-red-200',
  warning: 'bg-amber-50 dark:bg-amber-950 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-900',
  info: 'bg-indigo-50 dark:bg-indigo-950 text-indigo-800 border-indigo-200 dark:border-indigo-900',
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(0);

  // opts.ref carries a server request id so an error on screen can be matched to
  // a log line. opts.duration = 0 keeps the toast until it is acted on.
  const addToast = useCallback((message, type = 'error', opts = {}) => {
    const { action = null, ref = null, duration = DEFAULT_DURATION_MS } = opts;
    const id = ++nextId.current;
    setToasts(prev => [...prev, { id, message, type, action, ref, duration }]);
    return id;
  }, []);

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Memoised: an unmemoised object here forced `toast` into dependency arrays
  // across the app and needed eslint-disable comments to stay quiet.
  const toast = useMemo(() => ({
    error: (msg, opts) => addToast(msg, 'error', opts),
    success: (msg, opts) => addToast(msg, 'success', opts),
    warning: (msg, opts) => addToast(msg, 'warning', opts),
    info: (msg, opts) => addToast(msg, 'info', opts),
    dismiss,
  }), [addToast, dismiss]);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

function ToastStack({ toasts, onDismiss }) {
  // Always mounted: a live region only announces content added after it exists.
  return (
    <div aria-live="polite" aria-relevant="additions" className="fixed top-4 right-4 z-[200] flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <Toast key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  );
}

// Auto-dismiss is held while the pointer is over the toast or focus is inside
// it, so there is time to read it or reach the action.
function useHoldableDismiss(duration, onDismiss) {
  const timerRef = useRef(null);
  const holds = useRef({ pointer: false, focus: false });
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  useEffect(() => {
    const timer = createDismissTimer(duration, () => dismissRef.current());
    timerRef.current = timer;
    timer.start();
    return () => timer.stop();
  }, [duration]);
  return function hold(kind, active) {
    holds.current[kind] = active;
    if (holds.current.pointer || holds.current.focus) timerRef.current?.pause();
    else timerRef.current?.start();
  };
}

function Toast({ toast, onDismiss }) {
  const hold = useHoldableDismiss(toast.duration, onDismiss);
  return (
    <div
      role={toast.type === 'error' ? 'alert' : 'status'}
      onMouseEnter={() => hold('pointer', true)}
      onMouseLeave={() => hold('pointer', false)}
      onFocus={() => hold('focus', true)}
      onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) hold('focus', false); }}
      className={`pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl shadow-lg text-sm font-medium max-w-sm border animate-in fade-in slide-in-from-top-2 duration-200 ${
        STYLES[toast.type] ?? STYLES.error
      }`}
    >
      <div className="flex-1 min-w-0">
        <span>{toast.message}</span>
        {toast.ref && (
          <div className="mt-1 font-mono text-[11px] font-normal opacity-60">ref {toast.ref}</div>
        )}
      </div>
      {toast.action && (
        <button
          onClick={() => { toast.action.onClick(); onDismiss(); }}
          className="flex-shrink-0 underline underline-offset-2 hover:no-underline"
        >
          {toast.action.label}
        </button>
      )}
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        className="flex-shrink-0 text-current opacity-50 hover:opacity-100 transition"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
