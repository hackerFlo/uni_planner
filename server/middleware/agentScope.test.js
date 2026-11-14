const test = require('node:test');
const assert = require('node:assert/strict');
const { isAgentAllowed } = require('./agentScope');

const ALLOWED = [
  ['GET', '/api/auth/me'], ['GET', '/api/todos?x=1'], ['PATCH', '/api/todos/12'], ['DELETE', '/api/todos/12?scope=all'],
  ['POST', '/api/planner/move'], ['PUT', '/api/day-notes/2026-01-05'], ['POST', '/api/quotes/3/dislike'],
  ['PATCH', '/api/preferences/profiles/abc'], ['GET', '/api/holidays/countries'],
];
const DENIED = [
  ['PATCH', '/api/auth/me'], ['POST', '/api/auth/logout-all'], ['GET', '/api/auth/notification-settings'],
  ['GET', '/api/backup'], ['POST', '/api/backup/restore'], ['GET', '/api/agent-connections'],
  ['POST', '/api/agent-account'], ['GET', '/api/version'], ['POST', '/api/preferences/profiles'],
  ['GET', '/API/BACKUP'], ['GET', '/api/todos/12/extra'], ['POST', '/api/todos/12'], ['HEAD', '/api/todos'],
  ['GET', '/api/unknown'], ['GET', '/api//backup'],
];

test('isAgentAllowed accepts MCP-scope routes', () => {
  for (const [method, url] of ALLOWED) assert.equal(isAgentAllowed(method, url), true, `${method} ${url}`);
});

test('isAgentAllowed denies everything else, including odd spellings', () => {
  for (const [method, url] of DENIED) assert.equal(isAgentAllowed(method, url), false, `${method} ${url}`);
});
