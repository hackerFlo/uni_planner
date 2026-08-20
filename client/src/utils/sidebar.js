// The sidebar mirrors the planner: it lists the unassigned backlog plus the
// assignments the user can actually see in the week on screen. A todo assigned
// to a week the arrows cannot reach used to sit here dimmed and chipped with a
// bare weekday ("Tue"), which read as *this* Tuesday -- an assignment claim the
// planner could not back up. Those are split out instead, so nothing is both
// invisible in the planner and silently present here.

function byDayAsc(a, b) {
  return a.day_assigned.localeCompare(b.day_assigned);
}

function byCreatedDesc(a, b) {
  return b.created_at.localeCompare(a.created_at);
}

export function buildSidebar(items, visibleDates, { stranded = false } = {}) {
  const visible = new Set(visibleDates);

  if (stranded) {
    return items
      .filter(t => t.day_assigned && !visible.has(t.day_assigned))
      .sort(byDayAsc);
  }

  const unassigned = items.filter(t => !t.day_assigned).sort(byCreatedDesc);
  const assigned = items
    .filter(t => t.day_assigned && visible.has(t.day_assigned))
    .sort(byDayAsc);

  return [...unassigned, ...assigned];
}
