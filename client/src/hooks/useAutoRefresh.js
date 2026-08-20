import { useEffect } from 'react';
import { msUntilNextMidnight } from '../utils/dates';

// Refetch when the user comes back to the tab, and once at local midnight so a
// long-lived session does not keep showing yesterday's data. Previously this
// lived only in useTodos, which is why exams never refreshed at all and their
// countdowns went stale after the first load.
export function useAutoRefresh(refresh) {
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible') refresh();
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  useEffect(() => {
    let timer = null;
    function scheduleAtMidnight() {
      timer = setTimeout(() => {
        // Skip while hidden; the visibility handler catches up on resume.
        if (document.visibilityState === 'visible') refresh();
        scheduleAtMidnight();
      }, msUntilNextMidnight());
    }
    scheduleAtMidnight();
    return () => clearTimeout(timer);
  }, [refresh]);
}

export default useAutoRefresh;
