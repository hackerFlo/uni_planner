import { useState, useEffect } from 'react';
import { usePreferences } from '../context/PreferencesContext';

// Keyed by country so switching region does not serve Bavaria's holidays for
// Austria out of a stale cache. Module-level on purpose: the data changes once a
// year, and a remount should not re-hit a third party.
const cache = new Map();

async function fetchYear(year, country) {
  const key = `${country}:${year}`;
  if (cache.has(key)) return cache.get(key);
  const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/${country}`);
  if (!res.ok) throw new Error(`holiday lookup failed (HTTP ${res.status})`);
  const data = await res.json();
  cache.set(key, data);
  return data;
}

export function useHolidays() {
  const { preferences } = usePreferences();
  const { showHolidays, holidayCountry, holidaySubdivision } = preferences;
  const [holidays, setHolidays] = useState(new Map());

  useEffect(() => {
    if (!showHolidays) { setHolidays(new Map()); return undefined; }

    let cancelled = false;
    const year = new Date().getFullYear();
    Promise.all([fetchYear(year, holidayCountry), fetchYear(year + 1, holidayCountry)])
      .then(([a, b]) => {
        if (cancelled) return;
        const map = new Map();
        for (const h of [...a, ...b]) {
          // A null `counties` means nationwide. With no subdivision chosen the
          // user asked for the whole country, so nothing is filtered out.
          const applies = !holidaySubdivision || !h.counties || h.counties.includes(holidaySubdivision);
          if (applies) map.set(h.date, h.localName);
        }
        setHolidays(map);
      })
      .catch(err => {
        // Non-fatal: the planner works without holidays. But it used to fail
        // completely silently, so a blocked CSP or a dead third party looked
        // exactly like "there are no holidays this year" (EL-1).
        console.warn('[holidays] lookup failed:', err.message);
        if (!cancelled) setHolidays(new Map());
      });

    return () => { cancelled = true; };
  }, [showHolidays, holidayCountry, holidaySubdivision]);

  return holidays;
}
