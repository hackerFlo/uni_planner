import { richTextToPlain, sanitizeRichHtml } from '../utils/richText.js';
import { isRealIsoDate } from './weekParam.js';

const APPROX_TIME = /^\d{1,2}[mh]$/;
const PATTERNS = ['weekdays', 'weekends'];
const REPEAT_DAYS = [1, 2, 3, 4, 5, 6, 7];
const REPEAT_LABELS = { 1: 'Every day', 7: 'Every week' };

export const RECURRENCE_OPTIONS = [
  { value: '', label: 'Does not repeat' },
  ...REPEAT_DAYS.map(n => ({ value: String(n), label: REPEAT_LABELS[n] ?? `Every ${n} days` })),
  { value: 'weekdays', label: 'Weekdays' },
  { value: 'weekends', label: 'Weekends' },
];

export function emptyTaskForm(lists, day = '') {
  return { title: '', description: '', listId: String(lists[0]?.id ?? ''), day, approxTime: '', recurrence: '' };
}

function recurrenceOf(todo) {
  if (todo.recurrence_pattern) return todo.recurrence_pattern;
  return todo.recurrence_interval_days != null ? String(todo.recurrence_interval_days) : '';
}

export function formFromTodo(todo) {
  return {
    title: todo.title ?? '',
    description: richTextToPlain(todo.description ?? ''),
    listId: String(todo.list_id ?? ''),
    day: todo.day_assigned ?? '',
    approxTime: (todo.approx_time ?? '').replace(' min', 'm'),
    recurrence: recurrenceOf(todo),
  };
}

function cleanTime(raw) {
  return raw.trim().toLowerCase();
}

export function validateTaskForm(form) {
  if (!form.title.trim()) return 'Title is required.';
  if (!form.listId) return 'Choose a list.';
  if (form.day && !isRealIsoDate(form.day)) return 'Day must be a valid date (YYYY-MM-DD) or empty.';
  if (cleanTime(form.approxTime) && !APPROX_TIME.test(cleanTime(form.approxTime))) {
    return 'Approx. time must look like 30m or 2h, or be empty.';
  }
  if (form.recurrence && !form.day) return 'A repeating task needs a day.';
  return null;
}

export function plainToRichText(text) {
  const html = sanitizeRichHtml(text.replace(/\r?\n/g, '<br>'));
  return richTextToPlain(html).trim() ? html : '';
}

function recurrenceFields(value) {
  const isPattern = PATTERNS.includes(value);
  return {
    recurrence_interval_days: value && !isPattern ? Number(value) : null,
    recurrence_pattern: isPattern ? value : null,
  };
}

export function buildTaskPayload(form) {
  return {
    title: form.title.trim(),
    description: plainToRichText(form.description),
    list_id: Number(form.listId),
    day_assigned: form.day || null,
    approx_time: cleanTime(form.approxTime) || null,
    ...recurrenceFields(form.recurrence),
  };
}
