import { parseDateLocal } from '../utils/dates.js';
import { planSameDayReorder, todosForDay } from '../utils/plannerMutations.js';
import { isRealIsoDate } from './weekParam.js';

export const OTHER_DATE = 'other-date';
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SHORT_NAME_LENGTH = 3;

function weekdayName(iso) {
  return WEEKDAYS[parseDateLocal(iso).getDay()];
}

export function dayHeading(iso) {
  return `${weekdayName(iso)} ${iso}`;
}

export function dayLabel(iso) {
  return iso ? `${weekdayName(iso).slice(0, SHORT_NAME_LENGTH)} ${iso}` : 'Unassigned';
}

function toRow(item, listName, completed) {
  if (item.kind === 'divider') {
    return { key: item.id, kind: 'divider', displayId: item.id, title: '(divider)', listName: '', time: '', completed: false, item };
  }
  return { key: `${completed ? 'done' : 'open'}-${item.id}`, kind: 'task', displayId: String(item.id), title: item.title,
    listName: listName(item.list_id), time: item.approx_time ?? '', completed, item };
}

export function buildDayRows(day, items, completedTodos, listName) {
  const open = todosForDay(items, day).map(item => toRow(item, listName, false));
  const done = completedTodos.map(item => toRow(item, listName, true));
  return [...open, ...done];
}

function byOrderThenId(a, b) {
  return (a.planner_order ?? Infinity) - (b.planner_order ?? Infinity) || a.id - b.id;
}

export function buildUnassignedRows(items, listName) {
  return items
    .filter(item => item.kind !== 'divider' && (item.day_assigned ?? null) === null)
    .sort(byOrderThenId)
    .map(item => toRow(item, listName, false));
}

export function moveOptions(weekDates) {
  return [
    { value: '', label: 'Unassigned' },
    ...weekDates.map(date => ({ value: date, label: dayLabel(date) })),
    { value: OTHER_DATE, label: 'Other date (fill in the date field)' },
  ];
}

export function resolveMoveTarget(selectValue, otherDate) {
  if (selectValue === '') return { ok: true, day: null };
  if (selectValue !== OTHER_DATE) return { ok: true, day: selectValue };
  if (isRealIsoDate(otherDate)) return { ok: true, day: otherDate };
  return { ok: false, reason: 'Choose "Other date" only together with a valid date in the date field (YYYY-MM-DD).' };
}

export function planStep(items, day, id, direction) {
  const dayItems = todosForDay(items, day);
  const from = dayItems.findIndex(item => item.id === id);
  const to = from + (direction === 'up' ? -1 : 1);
  if (from < 0 || to < 0 || to >= dayItems.length) return null;
  return planSameDayReorder(items, { day, from, to });
}
