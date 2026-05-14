// Returns { startIso, endIso } — the UTC ISO timestamps that bracket the given
// local calendar day in `tz`. Handles DST correctly.
function localDayBoundsUtc(localDate, tz) {
  // Probe: what wall-clock time does UTC midnight of `localDate` map to in `tz`?
  const probe = new Date(`${localDate}T00:00:00Z`);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(probe);

  const p = {};
  for (const { type, value } of parts) p[type] = value;
  // "24" hour quirk: formatToParts can return hour "24" for midnight
  const h = parseInt(p.hour, 10) % 24;
  const m = parseInt(p.minute, 10);
  const s = parseInt(p.second, 10);
  // Wall-clock time in tz for probe (UTC midnight) expressed as offset from midnight
  const probeOffsetMs = (h * 3600 + m * 60 + s) * 1000;

  // If wall-clock is BEFORE UTC midnight (e.g. UTC-5: probe shows 19:00 previous day)
  // the date part will differ — adjust by ±1 day as needed.
  const probeLocalDate = `${p.year}-${p.month}-${p.day}`;
  let startMs = probe.getTime() - probeOffsetMs;
  if (probeLocalDate < localDate) {
    // probe landed yesterday in tz — shift forward by 24h
    startMs += 24 * 60 * 60 * 1000;
  } else if (probeLocalDate > localDate) {
    // probe landed tomorrow in tz — shift backward by 24h
    startMs -= 24 * 60 * 60 * 1000;
  }

  return {
    startIso: new Date(startMs).toISOString(),
    endIso: new Date(startMs + 24 * 60 * 60 * 1000).toISOString(),
  };
}

module.exports = { localDayBoundsUtc };
