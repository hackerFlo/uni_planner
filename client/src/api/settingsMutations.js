import { api } from './client.js';
import { ApiError, KINDS } from './errors.js';
import { isPlannerVersion, plannerMutationOptions } from './planner.js';

function withVersion(result) {
  if (!isPlannerVersion(result?.version)) throw new ApiError(KINDS.UNKNOWN);
  return { ...result, version: { ...result.version } };
}
function receipt(result) {
  if (!isPlannerVersion(result?.currentVersion) || !isPlannerVersion(result?.resultVersion)
    || !result.data || typeof result.data !== 'object') throw new ApiError(KINDS.UNKNOWN);
  return result;
}
const options = controls => plannerMutationOptions(controls?.expectedVersion, controls?.idempotencyKey);
export const quoteApi = {
  daily: async date => withVersion(await api.get(`/api/quotes/today?date=${encodeURIComponent(date)}`, { cache: 'no-store' })),
  stats: async () => withVersion(await api.get('/api/quotes/stats', { cache: 'no-store' })),
  dislike: async ({ id, date }, controls) => receipt(await api.post(`/api/quotes/${id}/dislike?date=${encodeURIComponent(date)}`, {}, options(controls))),
  importCsv: async (args, controls) => receipt(await api.post('/api/quotes/import', args, options(controls))),
  restoreAll: async (_args, controls) => receipt(await api.post('/api/quotes/restore-all', {}, options(controls))),
};
export const notificationApi = {
  settings: async () => withVersion(await api.get('/api/auth/notification-settings', { cache: 'no-store' })),
  save: async (args, controls) => receipt(await api.patch('/api/auth/notification-settings', args, options(controls))),
  sendTest: async (_args, controls) => {
    const result = await api.post('/api/auth/test-email', {}, options(controls));
    if (!['sent', 'in_progress'].includes(result?.status) || typeof result.attemptId !== 'string') throw new ApiError(KINDS.UNKNOWN);
    return result;
  },
};

// Keep an uncertain request intact: a retry must not silently send a newer draft.
export function capturedRequest(send, uuid = () => crypto.randomUUID(), { retainConflict = false } = {}) {
  let attempt = null;
  return {
    get pending() { return attempt !== null; },
    async run(args, version) {
      if (!attempt) {
        if (!isPlannerVersion(version)) throw new ApiError(KINDS.BAD_REQUEST, { message: 'Load the current settings before editing.' });
        attempt = { args: structuredClone(args), controls: { expectedVersion: { ...version }, idempotencyKey: uuid() } };
      }
      try {
        const result = await send(attempt.args, attempt.controls);
        if (result?.status !== 'in_progress') attempt = null;
        return result;
      } catch (error) {
        if (error.status >= 400 && error.status < 500 && error.status !== 429 && !(retainConflict && error.status === 409)) attempt = null;
        throw error;
      }
    },
  };
}
