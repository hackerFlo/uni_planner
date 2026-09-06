// A day column is one ordered list holding two kinds of row: todos and the
// divider lines the user drops between them. They live in separate tables but
// share a single dense `planner_order` run per day -- that shared ordinal space
// is the only thing that keeps a divider sitting *between* two cards instead of
// above or below the whole day.
//
// Normalising a divider row into the same shape a todo already has
// (`id`, `day_assigned`, `planner_order`) is what lets todosForDay,
// planSameDayReorder and planCrossDayDrop in plannerMutations.js be reused on a
// merged array without a single change: they only ever read those three fields.

export const DIVIDER_PREFIX = 'divider-';

// Draggable ids have to be strings and unique across the whole board, so a
// divider's numeric row id is namespaced. `dividerId` keeps the raw id around
// for the API, which knows nothing about the prefix.
export function toDividerItem(row) {
  return {
    id: `${DIVIDER_PREFIX}${row.id}`,
    dividerId: row.id,
    kind: 'divider',
    day_assigned: row.date,
    planner_order: row.planner_order,
  };
}

export function isDividerId(id) {
  return typeof id === 'string' && id.startsWith(DIVIDER_PREFIX);
}

export function dividerRowId(id) {
  return Number(String(id).slice(DIVIDER_PREFIX.length));
}

// One dense 0..n-1 run across both kinds, partitioned into the two payloads the
// two reorder endpoints accept. A todo and a divider can never end up sharing
// an ordinal, which is what survives the reload.
export function splitOrderItems(orderedItems) {
  const todoItems = [];
  const dividerItems = [];
  orderedItems.forEach((item, index) => {
    if (item.kind === 'divider') dividerItems.push({ id: item.dividerId, planner_order: index });
    else todoItems.push({ id: item.id, planner_order: index });
  });
  return { todoItems, dividerItems };
}

// The positions those same items held before the drag, in the same two shapes
// -- i.e. the pair of payloads that undoes it.
export function splitSnapshotItems(allItems, orderedItems) {
  const byId = new Map(allItems.map(item => [item.id, item]));
  const todoItems = [];
  const dividerItems = [];
  for (const item of orderedItems) {
    const planner_order = byId.get(item.id)?.planner_order ?? 0;
    if (item.kind === 'divider') dividerItems.push({ id: item.dividerId, planner_order });
    else todoItems.push({ id: item.id, planner_order });
  }
  return { todoItems, dividerItems };
}

// Local counterparts of the two divider writes. They match on `dividerId`
// because the payloads carry raw row ids, while the store holds prefixed ones.
export function applyDividerOrder(dividers, items) {
  const order = new Map(items.map(({ id, planner_order }) => [id, planner_order]));
  return dividers.map(d => (order.has(d.dividerId) ? { ...d, planner_order: order.get(d.dividerId) } : d));
}

export function setDividerDayLocal(dividers, dividerId, day) {
  return dividers.map(d => (d.dividerId === dividerId ? { ...d, day_assigned: day } : d));
}
