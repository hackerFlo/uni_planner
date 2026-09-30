import { isPlannerVersion } from '../api/planner.js';
import { ApiError, KINDS } from '../api/errors.js';
export function matchingBoardVersion(tasks, dividers) {
  return isPlannerVersion(tasks) && isPlannerVersion(dividers)
    && tasks.epoch === dividers.epoch && tasks.revision === dividers.revision ? { ...tasks } : null;
}
export async function refreshBoardSnapshots(readTasks, readDividers, taskVersion, dividerVersion, options) {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!await readTasks(options) || options?.signal?.aborted || !await readDividers(options)) return false;
    if (matchingBoardVersion(taskVersion(), dividerVersion())) return true;
  }
  throw new ApiError(KINDS.BAD_REQUEST, { message: 'The planner changed while loading. Refresh before trying again.' });
}
