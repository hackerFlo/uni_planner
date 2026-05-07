import { useState, useEffect } from 'react';
import { CURRENT_VERSION } from '../constants/changelog';

const KEY = 'uniPlanner.lastSeenVersion';

export function useWhatsNew() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      const seen = localStorage.getItem(KEY);
      if (seen !== CURRENT_VERSION) setOpen(true);
    } catch {}
  }, []);

  function close() {
    try { localStorage.setItem(KEY, CURRENT_VERSION); } catch {}
    setOpen(false);
  }

  function openManually() { setOpen(true); }

  return { open, close, openManually };
}
