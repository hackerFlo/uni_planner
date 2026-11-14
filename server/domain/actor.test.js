const test = require('node:test');
const assert = require('node:assert/strict');
const { isAgentActor, actorOf, requestContext } = require('./actor');

test('isAgentActor is true for mcp and agent only', () => {
  const results = ['mcp', 'agent', 'web', 'system', undefined].map(isAgentActor);
  assert.deepEqual(results, [true, true, false, false, false]);
});

test('actorOf maps an agent principal to agent and everything else to web', () => {
  const actors = [{ kind: 'agent', agentAccountId: 1 }, { kind: 'owner' }, undefined].map(principal => actorOf({ principal }));
  assert.deepEqual(actors, ['agent', 'web', 'web']);
});

test('requestContext pairs the owner user id with the principal actor', () => {
  const context = requestContext({ user: { id: 7 }, principal: { kind: 'agent', agentAccountId: 2 } });
  assert.deepEqual(context, { userId: 7, actor: 'agent' });
});
