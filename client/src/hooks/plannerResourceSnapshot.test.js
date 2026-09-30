import test from 'node:test';
import assert from 'node:assert/strict';
import { plannerResourceSnapshot } from './plannerResourceSnapshot.js';

test('account and query changes never display a previous resource snapshot', () => {
  const previous = { state: { data: ['old account or week'], version: { revision: 3 } } };
  const current = { state: { data: null, version: null } };
  const snapshot = { resource: previous, state: previous.state };
  assert.equal(plannerResourceSnapshot(snapshot, current), current.state);
});

test('the current resource displays the snapshot delivered to React', () => {
  const resource = { state: { data: ['newer pending state'] } };
  const snapshot = { resource, state: { data: ['rendered state'] } };
  assert.equal(plannerResourceSnapshot(snapshot, resource), snapshot.state);
});
