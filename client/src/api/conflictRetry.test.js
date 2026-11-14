import test from 'node:test';
import assert from 'node:assert/strict';

import { isStaleVersion, runWithRecovery } from './conflictRetry.js';

const conflict = () => Object.assign(new Error('conflict'), { status: 409 });

test.describe('runWithRecovery', () => {
  test('returns the first result without recovering', async () => {
    let recovered = 0;
    const result = await runWithRecovery(async () => 'ok', async () => { recovered += 1; });
    assert.deepEqual([result, recovered], ['ok', 0]);
  });

  test('recovers once and retries after a 409', async () => {
    let calls = 0;
    let recovered = 0;
    const result = await runWithRecovery(async () => { calls += 1; if (calls === 1) throw conflict(); return calls; },
      async () => { recovered += 1; });
    assert.deepEqual([result, calls, recovered], [2, 2, 1]);
  });

  test('does not retry other failures', async () => {
    let calls = 0;
    await assert.rejects(runWithRecovery(async () => { calls += 1; throw Object.assign(new Error('bad'), { status: 400 }); }, async () => {}));
    assert.equal(calls, 1);
  });

  test('gives up after the second 409', async () => {
    let calls = 0;
    await assert.rejects(runWithRecovery(async () => { calls += 1; throw conflict(); }, async () => {}), /conflict/);
    assert.equal(calls, 2);
  });

  test('rethrows a 409 when there is nothing to recover with', async () => {
    await assert.rejects(runWithRecovery(async () => { throw conflict(); }), /conflict/);
  });
});

test.describe('isStaleVersion', () => {
  const version = { epoch: 'a'.repeat(32), revision: 2 };
  test('accepts a 409 that carries the current version', () => {
    assert.equal(isStaleVersion(Object.assign(new Error('x'), { status: 409, currentVersion: version })), true);
  });

  test('rejects a 409 without a current version', () => {
    assert.equal(isStaleVersion(conflict()), false);
  });

  test('rejects other statuses', () => {
    assert.equal(isStaleVersion(Object.assign(new Error('x'), { status: 400, currentVersion: version })), false);
  });

  test('only retries what the predicate allows', async () => {
    let calls = 0;
    await assert.rejects(runWithRecovery(async () => { calls += 1; throw conflict(); }, async () => {}, isStaleVersion));
    assert.equal(calls, 1);
  });

  test('hands the failure to the recovery step', async () => {
    let seen = null;
    let calls = 0;
    await runWithRecovery(async () => { if (++calls === 1) throw conflict(); }, async error => { seen = error; });
    assert.equal(seen.status, 409);
  });
});
