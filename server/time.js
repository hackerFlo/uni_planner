const PARTS_FMT_CACHE = new Map();

function partsFormatter(tz) {
  let fmt = PARTS_FMT_CACHE.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hourCycle: 'h23',
    });
    PARTS_FMT_CACHE.set(tz, fmt);
  }
  return fmt;
}

// Offset of `tz` from UTC at a given instant, in ms (positive east of UTC).
function tzOffsetMsAt(instantMs, tz) {
  const p = {};
  for (const { type, value } of partsFormatter(tz).formatToParts(new Date(instantMs))) p[type] = value;
  // "24" hour quirk: formatToParts can still report hour "24" for midnight.
  const wallClockAsUtcMs = Date.UTC(
    Number(p.year), Number(p.month) - 1, Number(p.day),
    Number(p.hour) % 24, Number(p.minute), Number(p.second)
  );
  return wallClockAsUtcMs - instantMs;
}

// UTC epoch ms of the instant at which local midnight of `localDate` occurs in `tz`.
// Two passes: the offset in force at the *guess* is the one that actually applies,
// and it can differ from the offset at UTC midnight when a DST transition falls
// between the two (Australia/Adelaide, 2026-04-05, is exactly that case).
function startOfLocalDayUtcMs(localDate, tz) {
  const wallClockAsUtcMs = Date.parse(`${localDate}T00:00:00Z`);
  if (!Number.isFinite(wallClockAsUtcMs)) throw new RangeError(`Invalid local date: ${localDate}`);
  const guess = wallClockAsUtcMs - tzOffsetMsAt(wallClockAsUtcMs, tz);
  const offset = tzOffsetMsAt(guess, tz);
  const resolved = wallClockAsUtcMs - offset;
  // Local midnight can be skipped entirely by zones that spring forward at 24:00
  // (America/Santiago). No instant maps to it, so the day begins at the
  // transition itself -- the later of the two candidates.
  return tzOffsetMsAt(resolved, tz) === offset ? resolved : Math.max(guess, resolved);
}

function nextCalendarDay(localDate) {
  const d = new Date(`${localDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// Returns { startIso, endIso } — the UTC ISO timestamps that bracket the given
// local calendar day in `tz`. Handles DST correctly: the end is the NEXT local
// midnight resolved the same way as the start, not start + 24h, so a transition
// day spans 23 or 25 hours rather than always 24.
function localDayBoundsUtc(localDate, tz) {
  return {
    startIso: new Date(startOfLocalDayUtcMs(localDate, tz)).toISOString(),
    endIso: new Date(startOfLocalDayUtcMs(nextCalendarDay(localDate), tz)).toISOString(),
  };
}

module.exports = { localDayBoundsUtc };
