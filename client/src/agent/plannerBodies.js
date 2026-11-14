// Request bodies for the /api/planner/* endpoints, the same shapes
// usePlannerBoard builds. Kept here because that hook swallows failures into a
// toast, and the agent view has to report each failure on its own status line.

export function itemRef(item) {
  return item.kind === 'divider' ? { kind: 'divider', id: item.dividerId } : { kind: 'task', id: item.id };
}

function dayCountExcluding(items, day, excludeId) {
  return items.filter(item => (item.day_assigned ?? null) === day && item.id !== excludeId).length;
}

export function moveBody(items, item, day) {
  return { item: itemRef(item), day, index: dayCountExcluding(items, day, item.id) };
}

export function reorderBody(ordered) {
  return { day: ordered[0].day_assigned ?? null, items: ordered.map(itemRef) };
}

export function createDividerBody(day, dayItems) {
  return { day, index: dayItems.length };
}

export function deleteDividerBody(id) {
  return { id };
}
