export async function refreshPlannerViews(refreshBoard, refreshRelated, options) {
  const results = await Promise.all([refreshBoard(options), refreshRelated?.(options)]);
  return results.every(result => result !== false);
}
