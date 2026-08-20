// The sidebar lists the unassigned backlog followed by every assignment,
// whether or not the week it belongs to is the one on screen. It used to hold
// back assignments outside the visible week and surface them in a separate row,
// so that a todo could never be invisible in the planner yet silently present
// here. That split is gone by request: one list, no special cases.
//
// The day chip is therefore the only thing saying which day an item belongs to,
// and for a week the arrows cannot reach it still reads as a bare weekday.

function byDayAsc(a, b) {
  return a.day_assigned.localeCompare(b.day_assigned);
}

function byCreatedDesc(a, b) {
  return b.created_at.localeCompare(a.created_at);
}

export function buildSidebar(items) {
  const unassigned = items.filter(t => !t.day_assigned).sort(byCreatedDesc);
  const assigned = items.filter(t => t.day_assigned).sort(byDayAsc);
  return [...unassigned, ...assigned];
}
