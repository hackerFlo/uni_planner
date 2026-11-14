const CONFLICT = 409;

export const isConflict = error => error?.status === CONFLICT;

// The server attaches currentVersion only to a stale-version rejection. Other
// 409s (a retry key reused for different input) cannot be cured by re-reading.
export const isStaleVersion = error => isConflict(error) && Boolean(error.currentVersion);

// A write rejected for a stale planner version was refused before it changed
// anything, so after re-reading the planner it is safe to send exactly once more.
export async function runWithRecovery(work, recover, recoverable = isConflict) {
  try {
    return await work();
  } catch (error) {
    if (!recoverable(error) || !recover) throw error;
    await recover(error);
    return work();
  }
}
