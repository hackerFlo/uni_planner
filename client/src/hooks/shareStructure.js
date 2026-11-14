const isObject = value => value !== null && typeof value === 'object';

function sameItems(previous, next) {
  return previous.length === next.length && next.every((item, index) => item === previous[index]);
}

function shareArray(previous, next) {
  const byId = new Map();
  for (const row of previous) if (isObject(row) && row.id !== undefined) byId.set(row.id, row);
  const shared = next.map((row, index) => {
    const old = isObject(row) && row.id !== undefined ? byId.get(row.id) : previous[index];
    return shareStructure(old, row);
  });
  return sameItems(previous, shared) ? previous : shared;
}

function shareObject(previous, next) {
  const keys = Object.keys(next);
  const shared = Object.fromEntries(keys.map(key => [key, shareStructure(previous[key], next[key])]));
  const unchanged = keys.length === Object.keys(previous).length && keys.every(key => shared[key] === previous[key]);
  return unchanged ? previous : shared;
}

// Refetched JSON is always a fresh object graph. Reusing every sub-tree whose
// content did not change lets memoised rows skip re-rendering; rows are matched
// by `id` so a reorder does not defeat the reuse.
export function shareStructure(previous, next) {
  if (!isObject(previous) || !isObject(next)) return next;
  if (Array.isArray(next)) return Array.isArray(previous) ? shareArray(previous, next) : next;
  return Array.isArray(previous) ? next : shareObject(previous, next);
}
