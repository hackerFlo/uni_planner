export async function refreshPlannerViews(refreshBoard, refreshRelated, options) {
  const results = await Promise.all([refreshBoard(options), refreshRelated?.(options)]);
  return results.every(result => result !== false);
}

export async function refreshPlannerResources(readers, options) {
  const results = await Promise.all(readers.map(read => read(options)));
  return results.every(result => result !== false);
}
