const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { mutationTools } = require('./mutations');
const { createOperations } = require('../../services/operations');
const operations = createOperations({});
const controls = { expectedVersion: { epoch: 'a'.repeat(32), revision: 0 }, idempotencyKey: randomUUID() };
const get = name => mutationTools(operations).find(tool => tool.name === name);

test('MCP task content edits cannot change recurrence, state, or scheduling', () => {
  const tool = get('update_task');
  assert.equal(tool.schema.safeParse({ id: 1, title: 'New', ...controls }).success, true);
  for (const field of [{ completed: true }, { archived: true }, { day_assigned: null },
    { planner_order: 0 }, { recurrence_pattern: 'weekdays' }]) {
    assert.equal(tool.schema.safeParse({ id: 1, ...field, ...controls }).success, false);
  }
  assert.equal(tool.schema.safeParse({ id: 1, ...controls }).success, false);
});

test('MCP exposes focused task state operations and requires explicit delete scope and recurrence fields', () => {
  assert.ok(get('set_task_completed'));
  assert.ok(get('set_task_archived'));
  const recurrence = get('set_task_recurrence');
  assert.equal(recurrence.schema.safeParse({ id: 1, recurrence_pattern: 'weekdays', ...controls }).success, false);
  assert.equal(recurrence.schema.safeParse({ id: 1, recurrence_pattern: 'weekdays', recurrence_interval_days: null, ...controls }).success, true);
  assert.equal(get('delete_task').schema.safeParse({ id: 1, ...controls }).success, false);
});

test('MCP dismissal is discoverable and provenance cannot be supplied as task input', () => {
  assert.equal(get('dismiss_task_agent_activity').schema.safeParse({ id: 1, ...controls }).success, true);
  assert.equal(get('create_task').schema.safeParse({ title: 'New', list_id: 1,
    agent_activity_action: 'created', ...controls }).success, false);
  assert.equal(get('dismiss_task_agent_activity').schema.safeParse({ id: 1,
    agent_activity_at: '2026-09-30T00:00:00.000Z', ...controls }).success, false);
});

test('mutation discovery excludes internal device enrollment and advertises permissions honestly', () => {
  assert.equal(get('create_preference_profile'), undefined);
  assert.equal(get('update_notification_settings').capability, 'notifications');
  assert.equal(get('update_preferences').capability, 'planner_write');
  assert.ok(get('undo_operation'));
  for (const tool of mutationTools(operations)) assert.equal(typeof tool.description, 'string');
});

test('MCP preference updates accept only supported agent activity icons', () => {
  const tool = get('update_preferences');
  const id = randomUUID();
  for (const icon of ['fuzzy', 'ring', 'robot']) {
    assert.equal(tool.schema.safeParse({ id, patch: { agentActivityIcon: icon }, ...controls }).success, true);
  }
  for (const icon of ['circle', '', null]) {
    assert.equal(tool.schema.safeParse({ id, patch: { agentActivityIcon: icon }, ...controls }).success, false);
  }
});

test('focused adapters preserve operation names and separate controls from domain arguments', () => {
  const calls = [];
  const wrapped = { ...operations, execute: (...args) => { calls.push(args); return { ok: true }; } };
  const tool = mutationTools(wrapped).find(item => item.name === 'set_task_completed');
  const context = { userId: 1, actor: 'mcp' };
  tool.action(context, { id: 3, completed: true, ...controls });
  assert.deepEqual(calls, [[context, 'set_task_completed', { id: 3, completed: true }, controls]]);
});

test('undo adapter forwards only the owned operation identifier and exact mutation controls', () => {
  const calls = [];
  const adapter = mutationTools({ definitions: {}, undo: (...args) => calls.push(args) })[0];
  const context = { userId: 7, actor: 'mcp' };
  const operationId = randomUUID();
  const controls = { expectedVersion: { epoch: 'b'.repeat(32), revision: 4 }, idempotencyKey: randomUUID() };
  adapter.action(context, adapter.schema.parse({ operationId, ...controls }));
  assert.deepEqual(calls, [[context, operationId, controls]]);
});
