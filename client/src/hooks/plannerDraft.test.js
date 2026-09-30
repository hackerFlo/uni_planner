import test from 'node:test';
import assert from 'node:assert/strict';
import { PlannerDraft } from './plannerDraft.js';
test('draft retains its opening version; same intent retries reuse a key, edited intent gets a new key', () => {
  const snapshot = { epoch: 'a'.repeat(32), revision: 2 };
  let keys = 0;
  const draft = new PlannerDraft(snapshot, () => String(++keys));
  snapshot.revision = 10;
  const first = draft.controls({ name: 'one' });
  assert.equal(first.expectedVersion.revision, 2);
  assert.deepEqual(draft.controls({ name: 'one' }), first);
  assert.notEqual(draft.controls({ name: 'two' }).idempotencyKey, first.idempotencyKey);
});
