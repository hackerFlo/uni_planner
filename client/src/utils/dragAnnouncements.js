import { parseDateLocal } from './dates.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function placeLabel(droppableId) {
  if (!DATE_RE.test(droppableId)) return 'the task list';
  return WEEKDAYS[parseDateLocal(droppableId).getDay()];
}

export function itemTitle(item) {
  if (!item) return 'item';
  return item.kind === 'divider' ? 'divider' : item.title;
}

const where = ({ droppableId, index }) => `${placeLabel(droppableId)}, position ${index + 1}`;

export function dragStartMessage(item, source) {
  return `Picked up "${itemTitle(item)}" from ${where(source)}.`;
}

export function dragUpdateMessage(destination) {
  return destination ? `Moved to ${where(destination)}.` : 'Not over a drop target.';
}

export function dragEndMessage(item, source, destination) {
  if (!destination) return `Cancelled. "${itemTitle(item)}" stays on ${where(source)}.`;
  return `Dropped on ${where(destination)}.`;
}
