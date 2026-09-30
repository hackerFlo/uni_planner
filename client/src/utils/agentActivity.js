const ACTION_LABELS = Object.freeze({ created: 'Created by AI' });
const DAY_MS = 24 * 60 * 60 * 1000;

function calendarDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function dayDescription(activityDate, now) {
  const daysAgo = Math.round((calendarDay(now) - calendarDay(activityDate)) / DAY_MS);
  if (daysAgo === 0) return 'Today';
  if (daysAgo === 1) return 'Yesterday';
  if (daysAgo >= 2 && daysAgo <= 6) return activityDate.toLocaleDateString('en-GB', { weekday: 'long' });
  return activityDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatAgentActivityLabel(timestamp, action, { dayAssigned = null, now = new Date() } = {}) {
  const actionLabel = action === 'moved'
    ? (dayAssigned == null ? 'Unassigned by AI' : 'Assigned date changed by AI')
    : ACTION_LABELS[action];
  const activityDate = new Date(timestamp);
  if (!actionLabel || !timestamp || Number.isNaN(activityDate.getTime())) return null;
  const dateLabel = dayDescription(activityDate, now);
  const timeLabel = activityDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${actionLabel} · ${dateLabel} at ${timeLabel}`;
}
