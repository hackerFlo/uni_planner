import { isPlannerVersion } from '../api/planner.js';
import { ApiError, KINDS } from '../api/errors.js';
export function matchingBoardVersion(tasks, dividers) {
  return isPlannerVersion(tasks) && isPlannerVersion(dividers)
    && tasks.epoch === dividers.epoch && tasks.revision === dividers.revision ? { ...tasks } : null;
}
export async function refreshBoardSnapshots(readTasks, readDividers, taskVersion, dividerVersion, options) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const [tasksRead, dividersRead] = await Promise.all([readTasks(options), readDividers(options)]);
    if (!tasksRead || !dividersRead || options?.signal?.aborted) return false;
    if (matchingBoardVersion(taskVersion(), dividerVersion())) return true;
  }
  throw new ApiError(KINDS.BAD_REQUEST, { message: 'The planner changed while loading. Refresh before trying again.' });
}
