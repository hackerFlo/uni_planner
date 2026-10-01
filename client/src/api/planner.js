import { api } from './client.js';
import { ApiError, KINDS } from './errors.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isPlannerVersion(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && typeof value.epoch === 'string' && /^[a-f0-9]{32}$/.test(value.epoch)
    && Number.isSafeInteger(value.revision) && value.revision >= 0;
}

export function plannerVersionSatisfies(current, minimum) {
  return isPlannerVersion(current) && isPlannerVersion(minimum)
    && current.epoch === minimum.epoch && current.revision >= minimum.revision;
}

function readVersion(value) {
  if (!isPlannerVersion(value)) throw new ApiError(KINDS.UNKNOWN);
  return { epoch: value.epoch, revision: value.revision };
}

export function plannerMutationOptions(expectedVersion, idempotencyKey, options = {}) {
  if (!isPlannerVersion(expectedVersion) || typeof idempotencyKey !== 'string' || !UUID.test(idempotencyKey)) {
    throw new ApiError(KINDS.BAD_REQUEST, { message: 'A captured planner version and a stable retry key are required.' });
  }
  return {
    ...options, cache: 'no-store', redirect: 'manual',
    headers: { ...options.headers, 'X-Planner-Epoch': expectedVersion.epoch,
      'X-Planner-Revision': String(expectedVersion.revision), 'Idempotency-Key': idempotencyKey },
  };
}

export const plannerApi = {
  async getVersion(options = {}) {
    const result = await api.get('/api/planner/version', { ...options, cache: 'no-store', redirect: 'manual' });
    return readVersion(result.version);
  },
  async undo(operationId, { expectedVersion, idempotencyKey, ...options } = {}) {
    if (typeof operationId !== 'string' || !UUID.test(operationId)) {
      throw new ApiError(KINDS.BAD_REQUEST, { message: 'A valid undo operation is required.' });
    }
    const result = await api.post('/api/planner/undo', { operationId },
      plannerMutationOptions(expectedVersion, idempotencyKey, options));
    return { ...result, resultVersion: readVersion(result.resultVersion), currentVersion: readVersion(result.currentVersion) };
  },
};
