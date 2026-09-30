import test from 'node:test';
import assert from 'node:assert/strict';
import { undoOperation } from './undoOperation.js';
const receipt = { undoAvailable: true, operationId: 'operation', resultVersion: { epoch: 'a'.repeat(32), revision: 2 },
  currentVersion: { epoch: 'a'.repeat(32), revision: 9 }, undoExpiresAt: new Date(30000).toISOString() };
test('undo binds to original result version, never a replay current version', () => {
  const operation = undoOperation(receipt, () => {}, 0, () => 'stable');
  assert.equal(operation.expectedVersion.revision, 2);
  assert.equal(operation.idempotencyKey, 'stable');
});
test('expired, already undone and unavailable receipts cannot become undo', () => {
  assert.equal(undoOperation(receipt, null, 30000), null);
  assert.equal(undoOperation({ ...receipt, operationUndone: true }, null, 0), null);
  assert.equal(undoOperation({ ...receipt, undoAvailable: false }, null, 0), null);
});
