const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { migrateMcp } = require('./migrations');

test('migration is additive and idempotent for existing accounts', () => {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, token_version INTEGER DEFAULT 0); INSERT INTO users (id) VALUES (1)');
  migrateMcp(db);
  db.prepare('INSERT INTO agent_links (user_id, issuer, subject, token_version, capabilities) VALUES (?, ?, ?, ?, ?)')
    .run(1, 'https://team.cloudflareaccess.com', 'synthetic-subject', 0, '["planner_read"]');
  migrateMcp(db);
  assert.equal(db.prepare('SELECT count(*) AS n FROM agent_links').get().n, 1);
  db.close();
});

test('identity uniqueness survives revocation and account deletion cascades', () => {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY); INSERT INTO users VALUES (1), (2)');
  migrateMcp(db);
  const insert = db.prepare('INSERT INTO agent_links (user_id, issuer, subject, token_version, capabilities, revoked_at) VALUES (?, ?, ?, 0, ?, ?)');
  insert.run(1, 'issuer', 'subject', '["planner_read"]', new Date().toISOString());
  assert.throws(() => insert.run(2, 'issuer', 'subject', '["planner_read"]', null), /UNIQUE/);
  db.prepare('DELETE FROM users WHERE id = ?').run(1);
  assert.equal(db.prepare('SELECT count(*) AS n FROM agent_links').get().n, 0);
  db.close();
});

test('empty legacy account table can be migrated without granting access', () => {
  const db = new Database(':memory:');
  db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY)');
  migrateMcp(db);
  assert.equal(db.prepare('SELECT count(*) AS n FROM agent_links').get().n, 0);
  db.close();
});
