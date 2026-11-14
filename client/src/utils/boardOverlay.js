// @hello-pangea/dnd renders a dropped card wherever the board data says it is.
// The board only learns the new order from the refetch after the server answers,
// so without a local stand-in the card springs back to its old day for that
// round trip. An overlay is the planned order, keyed by board item id, laid over
// the server rows until the write and its refetch have settled.
const HIDDEN = '__hidden';
const EDITABLE_FIELDS = ['title', 'description', 'list_id', 'day_assigned', 'approx_time',
  'recurrence_interval_days', 'recurrence_pattern'];

export function overlayFromOrder(ordered, day) {
  return new Map(ordered.map((item, index) => [item.id, { day_assigned: day, planner_order: index }]));
}

export function hiddenOverlay(ids) {
  return new Map(ids.map(id => [id, { [HIDDEN]: true }]));
}

// Only fields the form can change are laid over the row, and a completion hides
// it: the server moves a completed task off the live board.
export function editOverlay(id, data) {
  const patch = {};
  for (const field of EDITABLE_FIELDS) if (field in data) patch[field] = data[field];
  if (data.completed || data.archived) patch[HIDDEN] = true;
  return new Map([[id, patch]]);
}

export function applyOverlays(rows, overlays) {
  if (!overlays.length) return rows;
  let changed = false;
  const next = rows.map(row => {
    let patched = row;
    for (const overlay of overlays) {
      const patch = overlay.get(row.id);
      if (patch) patched = { ...patched, ...patch };
    }
    if (patched !== row) changed = true;
    return patched;
  });
  if (!changed) return rows;
  return next.filter(row => !row[HIDDEN]);
}
