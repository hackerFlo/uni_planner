import test from 'node:test';
import assert from 'node:assert/strict';
import { matchingBoardVersion, refreshBoardSnapshots } from './plannerBoardSnapshot.js';
const version = revision => ({ epoch: 'a'.repeat(32), revision });
test('mixed board snapshots cannot authorize a gesture', () => {
  assert.equal(matchingBoardVersion(version(2), version(3)), null);
  assert.equal(matchingBoardVersion(version(2), null), null);
  assert.deepEqual(matchingBoardVersion(version(2), version(2)), version(2));
});
test('board reads retry once and require matching versions', async () => {
  let reads = 0; let tasks; let dividers;
  assert.equal(await refreshBoardSnapshots(async () => { reads++; tasks = version(reads); return true; },
    async () => { dividers = version(2); return true; }, () => tasks, () => dividers), true);
  assert.equal(reads, 2);
});
test('continually changing board is rejected and cancellation stops retries', async () => {
  await assert.rejects(refreshBoardSnapshots(async () => true, async () => true, () => version(1), () => version(2)), /changed/);
  let reads = 0;
  assert.equal(await refreshBoardSnapshots(async () => false, async () => { reads++; }, () => null, () => null), false);
  assert.equal(reads, 0);
});
