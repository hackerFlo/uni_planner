import { createContext, useContext, useEffect, useState } from 'react';
import { dateInTimeZone, msUntilNextMidnightInZone } from '../utils/dates';
import { useAuth } from './AuthContext';

// One clock for the whole app. Before this, every component that needed "what day
// is it" called new Date() inside a useMemo keyed on something else entirely, so a
// tab left open for hours kept rendering the day it was opened on: the wrong week
// highlighted, no column marked today, and exam countdowns frozen at fetch time.
//
// Deliberately cheap. The value is a date string, and clock sync bails out when it
// has not changed, so React skips the re-render entirely. That means the 60s
// safety poll costs one string comparison a minute and re-renders once a day.
const TodayContext = createContext(dateInTimeZone());

// A timer alone is not enough: a sleeping laptop or a backgrounded phone does not
// fire it, and browsers throttle intervals in hidden tabs. The visibility listener
// is what actually catches the common case of reopening the app the next morning.
const SAFETY_POLL_MS = 60_000;

function watchAccountDay(timeZone, sync) {
  let midnightTimer;
  const scheduleMidnight = () => {
    midnightTimer = setTimeout(() => {
      sync();
      scheduleMidnight();
    }, msUntilNextMidnightInZone(new Date(), timeZone));
  };
  const onVisible = () => {
    if (document.visibilityState !== 'visible') return;
    sync();
    clearTimeout(midnightTimer);
    scheduleMidnight();
  };
  sync();
  scheduleMidnight();
  const poll = setInterval(sync, SAFETY_POLL_MS);
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    clearTimeout(midnightTimer);
    clearInterval(poll);
    document.removeEventListener('visibilitychange', onVisible);
  };
}

export function TimeProvider({ children }) {
  const { user } = useAuth();
  const timeZone = user?.notify_tz || 'UTC';
  const accountId = user?.id ?? null;
  const [clock, setClock] = useState(() => ({ date: dateInTimeZone(new Date(), timeZone), timeZone, accountId }));
  // Resolve a changed account or zone during render, before effects can expose
  // a stale week whose tasks the server already considers expired.
  const today = clock.timeZone === timeZone && clock.accountId === accountId
    ? clock.date : dateInTimeZone(new Date(), timeZone);

  useEffect(() => {
    return watchAccountDay(timeZone, () => setClock(prev => {
      const date = dateInTimeZone(new Date(), timeZone);
      return date === prev.date && timeZone === prev.timeZone && accountId === prev.accountId
        ? prev : { date, timeZone, accountId };
    }));
  }, [timeZone, accountId]);

  return <TodayContext.Provider value={today}>{children}</TodayContext.Provider>;
}

export function useToday() {
  return useContext(TodayContext);
}
