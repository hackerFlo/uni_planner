import test from 'node:test';
import assert from 'node:assert/strict';
import { PlannerResource } from './plannerResource.js';
const version = { epoch: 'a'.repeat(32), revision: 1 };
const key = '12345678-1234-4234-8234-123456789abc';
test('captures displayed version and caller key without fetching latest before mutation', async () => {
  const calls = [];
  const resource = new PlannerResource({ read: async () => ({ rows: ['old'], version }), select: x => x.rows });
  await resource.refresh();
  const captured = resource.captureVersion();
  resource.read = async () => ({ rows: ['new'], version: { ...version, revision: 3 } });
  await resource.refresh();
  await resource.mutate(async options => { calls.push(options); return { resultVersion: version, currentVersion: version }; }, { expectedVersion: captured, idempotencyKey: key });
  assert.equal(calls[0].headers['X-Planner-Revision'], '1');
  assert.equal(calls[0].headers['Idempotency-Key'], key);
});
test('late reads and closed account instances never apply state', async () => {
  let finish;
  const resource = new PlannerResource({ read: () => new Promise(resolve => { finish = resolve; }), select: x => x.rows });
  const pending = resource.refresh();
  resource.close(); finish({ rows: ['private'], version });
  assert.equal(await pending, false); assert.equal(resource.state.data, null);
});
test('external abort blocks apply even if transport ignores abort', async () => {
  let finish;
  const resource = new PlannerResource({ read: () => new Promise(resolve => { finish = resolve; }), select: x => x.rows });
  const controller = new AbortController();
  const pending = resource.refresh({ signal: controller.signal });
  controller.abort(); finish({ rows: ['private'], version });
  assert.equal(await pending, false); assert.equal(resource.state.data, null);
});
test('conflicts never retry a mutation or replace its captured version', async () => {
  let writes = 0;
  const resource = new PlannerResource({ read: async () => ({ rows: [], version }), select: x => x.rows });
  await resource.refresh();
  await assert.rejects(resource.mutate(async () => { writes++; throw new Error('conflict'); }, { idempotencyKey: key }), /conflict/);
  assert.equal(writes, 1); assert.deepEqual(resource.captureVersion(), version);
});
test('mutation before initial snapshot fails closed', async () => {
  const resource = new PlannerResource({ read: async () => {}, select: x => x });
  await assert.rejects(resource.mutate(async () => assert.fail(), { idempotencyKey: key }), /captured/);
});
test('a superseded read cannot replace a newer displayed snapshot', async () => {
  const pending = [];
  const resource = new PlannerResource({ read: () => new Promise(resolve => pending.push(resolve)), select: x => x.rows });
  const first = resource.refresh(); const second = resource.refresh();
  pending[1]({ rows: ['new'], version: { ...version, revision: 4 } });
  assert.equal(await second, true);
  pending[0]({ rows: ['old'], version }); assert.equal(await first, false);
  assert.deepEqual(resource.state.data, ['new']);
});
test('late mutation results cannot record operations after account disposal', async () => {
  let finish;
  const resource = new PlannerResource({ read: async () => ({ rows: [], version }), select: x => x.rows });
  await resource.refresh();
  const pending = resource.mutate(() => new Promise(resolve => { finish = resolve; }), { idempotencyKey: key });
  resource.close(); finish({ operationId: 'private' });
  await assert.rejects(pending, { name: 'AbortError' });
});
test('malformed snapshot version fails without replacing displayed data', async () => {
  const resource = new PlannerResource({ read: async () => ({ rows: ['saved'], version }), select: x => x.rows });
  await resource.refresh();
  resource.read = async () => ({ rows: ['invalid'], version: { revision: 5 } });
  await assert.rejects(resource.refresh());
  assert.deepEqual(resource.state.data, ['saved']); assert.equal(resource.state.loading, false);
});
test('a successful HTTP response without mutation metadata is not claimed as success', async () => {
  const resource = new PlannerResource({ read: async () => ({ rows: [], version }), select: x => x.rows });
  await resource.refresh();
  await assert.rejects(resource.mutate(async () => ({ todo: { id: 1 } }), { idempotencyKey: key }));
});
