import { useState, useEffect } from 'react';
import { usePreferences } from '../context/PreferencesContext';
import { api } from '../api/client';

// Our own API, not date.nager.at. The browser used to call that host directly,
// which meant holidays disappeared whenever it was down, whenever the installed
// PWA was offline, and would disappear again the moment the CSP was tightened.
// The server now owns the third-party call and caches the answer, so this side
// only ever talks to its own origin (AR-10).

// Keyed by country and year, so switching region cannot serve Bavaria's
// holidays for Austria out of a stale entry. Module-level on purpose: the
// server already caches for 30 days and a remount should not re-ask it.
const cache = new Map();

// year-1 .. year+1. Paging the planner across a New Year -- in either
// direction -- must never land on a year nobody has fetched yet.
const YEAR_OFFSETS = [-1, 0, 1];

function fetchYear(year, country) {
  const key = `${country}:${year}`;
  if (!cache.has(key)) {
    // The in-flight promise is cached, not just its result, so three years asked
    // for at once cannot become two requests for the same one.
    const pending = api.get(`/api/holidays?country=${country}&year=${year}`)
      .then(data => data.holidays ?? [])
      .catch(err => { cache.delete(key); throw err; });
    cache.set(key, pending);
  }
  return cache.get(key);
}

// No weekday check here, ever: 9 of Germany's 19 holidays in 2026 fall on a
// weekend and nationwide ones are among them (Tag der Deutschen Einheit,
// Saturday 2026-10-03). A null `counties` means nationwide, and with no
// subdivision chosen the user asked for the whole country, so nothing is
// filtered out at all.
function byDate(holidays, subdivision) {
  const map = new Map();
  for (const h of holidays) {
    if (!subdivision || !h.counties || h.counties.includes(subdivision)) map.set(h.date, h.localName);
  }
  return map;
}

export function useHolidays() {
  const { preferences } = usePreferences();
  const { showHolidays, holidayCountry, holidaySubdivision } = preferences;
  const [holidays, setHolidays] = useState(new Map());

  useEffect(() => {
    if (!showHolidays) { setHolidays(new Map()); return undefined; }

    let cancelled = false;
    const thisYear = new Date().getFullYear();
    // allSettled, not all: one year failing should cost that year, not the two
    // beside it. Failures are reported rather than swallowed (EL-1) -- silence
    // here used to look exactly like "there are no holidays this year".
    Promise.allSettled(YEAR_OFFSETS.map(offset => fetchYear(thisYear + offset, holidayCountry)))
      .then(results => {
        if (cancelled) return;
        for (const r of results) {
          if (r.status === 'rejected') console.warn('[holidays] lookup failed:', r.reason?.message);
        }
        const fetched = results.flatMap(r => (r.status === 'fulfilled' ? r.value : []));
        setHolidays(byDate(fetched, holidaySubdivision));
      });

    return () => { cancelled = true; };
  }, [showHolidays, holidayCountry, holidaySubdivision]);

  return holidays;
}
