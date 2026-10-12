import { getWeekDates, parseDateLocal } from './dates.js';

// Keep the backlog and reachable assignments in one list.
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function sidebarAssignment(dayAssigned, today) {
  if (!dayAssigned) return { inWindow: false, label: '' };
  const now = parseDateLocal(today);
  const from = getWeekDates(-1, now)[0];
  const to = getWeekDates(1, now)[6];
  const inWindow = dayAssigned >= from && dayAssigned <= to;
  return { inWindow, label: inWindow ? DAY_NAMES[parseDateLocal(dayAssigned).getDay()] : dayAssigned };
}

function byDayAsc(a, b) {
  return a.day_assigned.localeCompare(b.day_assigned);
}

function byCreatedDesc(a, b) {
  return b.created_at.localeCompare(a.created_at);
}

export function buildSidebar(items, today) {
  const unassigned = items.filter(t => !t.day_assigned).sort(byCreatedDesc);
  const assigned = items.filter(t => t.day_assigned && sidebarAssignment(t.day_assigned, today).inWindow).sort(byDayAsc);
  return [...unassigned, ...assigned];
}

// The sidebar shows the same todo whether or not it is assigned to a day, so an
// assigned one needs an id of its own: the day column is already rendering a
// Draggable under the raw id, and @hello-pangea/dnd requires them to be unique
// board-wide.
export function sidebarDraggableId(todo) {
  return todo.day_assigned ? `sidebar-${todo.id}` : String(todo.id);
}
