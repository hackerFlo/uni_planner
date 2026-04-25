import { useState, useEffect } from 'react';

const cache = {};

async function fetchYear(year) {
  if (cache[year]) return cache[year];
  const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/DE`);
  const data = await res.json();
  cache[year] = data.filter(h => !h.counties || h.counties.includes('DE-BY'));
  return cache[year];
}

export function useHolidays() {
  const [holidays, setHolidays] = useState(new Map());

  useEffect(() => {
    const year = new Date().getFullYear();
    Promise.all([fetchYear(year), fetchYear(year + 1)])
      .then(([a, b]) => {
        const map = new Map();
        [...a, ...b].forEach(h => map.set(h.date, h.localName));
        setHolidays(map);
      })
      .catch(() => {});
  }, []);

  return holidays;
}
