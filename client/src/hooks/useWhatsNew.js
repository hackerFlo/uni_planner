import { useState, useEffect } from 'react';
import { CURRENT_VERSION, CHANGELOG } from '../constants/changelog';

const KEY = 'uniPlanner.lastSeenVersion';

export function useWhatsNew() {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState([]);

  useEffect(() => {
    try {
      const seen = localStorage.getItem(KEY);
      if (seen === CURRENT_VERSION) return;

      let unseen;
      if (!seen) {
        // First-time visitor: only show the latest entry, not the full history.
        unseen = [CHANGELOG[0]];
      } else {
        const seenIdx = CHANGELOG.findIndex(c => c.version === seen);
        // If seen version is no longer in the changelog, fall back to latest only.
        unseen = seenIdx > 0 ? CHANGELOG.slice(0, seenIdx) : [CHANGELOG[0]];
      }

      if (unseen.length > 0) {
        setEntries(unseen);
        setOpen(true);
      }
    } catch {}
  }, []);

  function close() {
    try { localStorage.setItem(KEY, CURRENT_VERSION); } catch {}
    setOpen(false);
    setEntries([]);
  }

  function openManually() {
    setEntries([CHANGELOG[0]]);
    setOpen(true);
  }

  return { open, close, openManually, entries };
}
