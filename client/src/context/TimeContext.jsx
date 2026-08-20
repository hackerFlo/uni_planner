import { createContext, useContext, useEffect, useState } from 'react';
import { toIso, msUntilNextMidnight } from '../utils/dates';

// One clock for the whole app. Before this, every component that needed "what day
// is it" called new Date() inside a useMemo keyed on something else entirely, so a
// tab left open for hours kept rendering the day it was opened on: the wrong week
// highlighted, no column marked today, and exam countdowns frozen at fetch time.
//
// Deliberately cheap. The value is a date string, and setToday bails out when it
// has not changed, so React skips the re-render entirely. That means the 60s
// safety poll costs one string comparison a minute and re-renders once a day.
const TodayContext = createContext(toIso(new Date()));

// A timer alone is not enough: a sleeping laptop or a backgrounded phone does not
// fire it, and browsers throttle intervals in hidden tabs. The visibility listener
// is what actually catches the common case of reopening the app the next morning.
const SAFETY_POLL_MS = 60_000;

export function TimeProvider({ children }) {
  const [today, setToday] = useState(() => toIso(new Date()));

  useEffect(() => {
    let midnightTimer = null;

    // Identity-preserving: React bails out when the next state is Object.is-equal
    // to the current one, so this is a no-op unless the date genuinely rolled over.
    const sync = () => setToday(prev => {
      const now = toIso(new Date());
      return now === prev ? prev : now;
    });

    const scheduleMidnight = () => {
      midnightTimer = setTimeout(() => {
        sync();
        scheduleMidnight();
      }, msUntilNextMidnight());
    };
    scheduleMidnight();

    const poll = setInterval(sync, SAFETY_POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') sync(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearTimeout(midnightTimer);
      clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return <TodayContext.Provider value={today}>{children}</TodayContext.Provider>;
}

export function useToday() {
  return useContext(TodayContext);
}
