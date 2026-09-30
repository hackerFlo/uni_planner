import { isPlannerVersion } from '../api/planner.js';

export function undoOperation(receipt, refresh, now = Date.now(), uuid = () => crypto.randomUUID()) {
  const expires = Date.parse(receipt?.undoExpiresAt);
  if (!receipt?.undoAvailable || receipt.operationUndone || !receipt.operationId
    || !isPlannerVersion(receipt.resultVersion) || !Number.isFinite(expires) || expires <= now) return null;
  return { operationId: receipt.operationId, expectedVersion: { ...receipt.resultVersion },
    idempotencyKey: uuid(), expires, refresh };
}
