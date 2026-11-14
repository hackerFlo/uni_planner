import { useEffect, useRef } from 'react';
import { shortcutAction } from '../utils/shortcuts.js';

// handlers: { new, 'prev-week', 'next-week', today, help }. While `disabled`
// (a dialog or drag is open) every key is left alone.
export function useGlobalShortcuts(handlers, disabled) {
  const latest = useRef({ handlers, disabled });
  latest.current = { handlers, disabled };
  useEffect(() => {
    function onKeyDown(event) {
      if (latest.current.disabled || event.defaultPrevented || event.repeat) return;
      const action = shortcutAction(event);
      const handler = action && latest.current.handlers[action];
      if (!handler) return;
      event.preventDefault();
      handler();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
