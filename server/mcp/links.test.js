const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { migrateMcp } = require('./migrations');
const { createLinkService } = require('./links');

const identity = { issuer: 'https://test-team.cloudflareaccess.com', subject: 'synthetic-subject-a' };
let db;
let links;
test.beforeEach(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, token_version INTEGER NOT NULL DEFAULT 0); INSERT INTO users (id) VALUES (1), (2)');
  migrateMcp(db);
  links = createLinkService(db);
});
test.afterEach(() => db.close());

test('resolve returns only an immutable account principal with consented read access', () => {
  links.enroll(1, identity, ['planner_read']);
  const principal = links.resolve(identity);
  assert.deepEqual(principal, { userId: 1, actor: 'mcp', capabilities: ['planner_read'] });
  assert.equal(Object.isFrozen(principal) && Object.isFrozen(principal.capabilities), true);
});

test('unlinked identity cannot select an account with an email hint', () => {
  links.enroll(1, identity, ['planner_read']);
  assert.throws(() => links.resolve({ ...identity, subject: 'other', email: 'same@example.com', userId: 1 }), { code: 'LINK_REQUIRED' });
});

test('revocation immediately blocks a freshly resolved principal and retains the binding', () => {
  links.enroll(1, identity, ['planner_read']);
  links.revoke(1);
  assert.throws(() => links.resolve(identity), { code: 'LINK_REQUIRED' });
  assert.throws(() => links.enroll(2, identity, ['planner_read']), { code: 'CONFLICT' });
  assert.throws(() => links.enroll(1, { ...identity, subject: 'new' }, ['planner_read']), { code: 'CONFLICT' });
});

test('fresh enrollment can restore only the same binding with current token version', () => {
  links.enroll(1, identity, ['planner_read']);
  db.prepare('UPDATE users SET token_version = token_version + 1 WHERE id = ?').run(1);
  assert.throws(() => links.resolve(identity), { code: 'LINK_REQUIRED' });
  assert.equal(links.status(1).requiresReenrollment, true);
  links.enroll(1, identity, ['planner_read']);
  assert.equal(links.resolve(identity).userId, 1);
});

test('revoke and status are account scoped and status never exposes identity', () => {
  links.enroll(1, identity, ['planner_read']);
  links.revoke(2);
  assert.equal(links.resolve(identity).userId, 1);
  assert.deepEqual(links.status(2), { linked: false, capabilities: [], revokedAt: null, requiresReenrollment: false });
  assert.deepEqual(Object.keys(links.status(1)).sort(), ['capabilities', 'linked', 'requiresReenrollment', 'revokedAt']);
});

test('deleted accounts fail closed even after a successful enrollment', () => {
  links.enroll(1, identity, ['planner_read']);
  db.prepare('DELETE FROM users WHERE id = ?').run(1);
  assert.throws(() => links.resolve(identity), { code: 'LINK_REQUIRED' });
  assert.throws(() => links.enroll(1, identity, ['planner_read']), { code: 'AUTH_REQUIRED' });
});

for (const capabilities of [[], ['planner_write'], ['export'], ['notifications'], ['planner_read', 'planner_read'], ['planner_read', 'admin'], 'planner_read']) {
  test(`rejects invalid capabilities ${JSON.stringify(capabilities)}`, () => {
    assert.throws(() => links.enroll(1, identity, capabilities), { code: 'VALIDATION_ERROR' });
    assert.equal(links.status(1).linked, false);
  });
}

test('corrupt stored capabilities cannot authorize a request', () => {
  links.enroll(1, identity, ['planner_read']);
  db.prepare('UPDATE agent_links SET capabilities = ? WHERE user_id = ?').run('["planner_write"]', 1);
  assert.throws(() => links.resolve(identity), { code: 'LINK_REQUIRED' });
});

 test('narrow grants only expand after explicit enrollment and can be reduced', () => {
  links.enroll(1, identity, ['planner_read']);
  assert.deepEqual(links.resolve(identity).capabilities, ['planner_read']);
  links.enroll(1, identity, ['planner_read', 'planner_write', 'notifications', 'export']);
  assert.deepEqual(links.resolve(identity).capabilities, ['planner_read', 'planner_write', 'notifications', 'export']);
  links.enroll(1, identity, ['planner_read']);
  assert.deepEqual(links.resolve(identity).capabilities, ['planner_read']);
});
