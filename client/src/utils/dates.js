// Local-calendar date helpers. Everything the planner stores is a bare
// `YYYY-MM-DD` with no time and no zone, so these deliberately never touch
// Date.prototype.toISOString() -- that renders UTC and shifts the day for any
// user west of Greenwich after 00:00 local.
//
// Previously duplicated across WeeklyPlanner, DayColumn, TodoForm, ExamsModal
// and ExamsContext; five copies of the same Monday arithmetic is five chances
// to fix a bug in only four places.

const DAYS_PER_WEEK = 7;
const MS_PER_DAY = 86_400_000;

// Current-day decisions share the server's saved account zone. Calendar
// arithmetic below still uses local Date objects as containers for bare dates.
export function dateInTimeZone(now = new Date(), timeZone = 'UTC') {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function msUntilNextMidnightInZone(now = new Date(), timeZone = 'UTC') {
  const today = dateInTimeZone(now, timeZone);
  let before = now.getTime();
  let after = before + 2 * MS_PER_DAY;
  // Search the actual date boundary so DST and fractional offsets do not
  // assume that the account day lasts 24 hours or matches browser midnight.
  while (after - before > 1) {
    const middle = Math.floor((before + after) / 2);
    if (dateInTimeZone(new Date(middle), timeZone) === today) before = middle;
    else after = middle;
  }
  return Math.max(1, after - now.getTime());
}

export function toIso(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseDateLocal(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayIso(now = new Date()) {
  return toIso(now);
}

export function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

// Monday-first. getDay() returns 0 for Sunday, which belongs to the week that
// is closing, not the one about to open -- hence the -6 rather than +1.
export function startOfWeek(from = new Date()) {
  const day = from.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  monday.setDate(monday.getDate() + diffToMonday);
  return monday;
}

export function getWeekDates(offset = 0, from = new Date()) {
  const monday = startOfWeek(from);
  monday.setDate(monday.getDate() + offset * DAYS_PER_WEEK);
  return Array.from({ length: DAYS_PER_WEEK }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return toIso(d);
  });
}

// Milliseconds until the next local midnight. Computed from the calendar rather
// than by adding 24h, so a DST transition does not push the tick an hour into the
// wrong day. Clamped to at least 1ms: a timer scheduled for 0 fires in a loop.
export function msUntilNextMidnight(now = new Date()) {
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return Math.max(1, nextMidnight.getTime() - now.getTime());
}

// "0 days" is not how anyone says it, and "1 days" is simply wrong. Returned in
// two pieces because the exam badge stacks the number over the unit, while the
// navbar renders one line -- and on the day itself there is no number to stack.
export function countdownParts(days) {
  if (days === 0) return { value: 'Today', unit: null };
  return { value: String(days), unit: days === 1 ? 'day' : 'days' };
}

export function formatCountdown(days) {
  const { value, unit } = countdownParts(days);
  return unit ? `${value} ${unit}` : value;
}
