const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.DATABASE_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'uni-planner-sessions-')), 'planner.db'
);
process.env.JWT_SECRET = 'test-secret-long-enough-for-the-check';
process.env.LOG_LEVEL = 'error';

const db = require('./db');
const {
  createSession, findLiveSession, deleteSession, deleteAllSessions, sweepExpiredSessions,
} = require('./sessions');

const makeUser = (email) =>
  db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(email, 'x').lastInsertRowid;

const alice = makeUser('alice@example.com');
const bob = makeUser('bob@example.com');

const countFor = (id) =>
  db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?').get(id).n;

test.describe('createSession', () => {
  test('mints a distinct id each time, so two devices never collide', () => {
    assert.notEqual(createSession(alice), createSession(alice));
  });

  test('the new session is immediately usable', () => {
    const sid = createSession(alice);
    assert.ok(findLiveSession(sid, alice));
  });

  test('expires a week out, matching the cookie and the JWT', () => {
    const sid = createSession(alice, { now: new Date('2026-08-19T00:00:00.000Z') });
    const row = db.prepare('SELECT expires_at FROM sessions WHERE id = ?').get(sid);
    assert.equal(row.expires_at, new Date('2026-08-26T00:00:00.000Z').toISOString());
  });
});

test.describe('findLiveSession', () => {
  test('refuses a session id that was never issued', () => {
    assert.equal(findLiveSession('not-a-real-session', alice), null);
  });

  // AR-2: the row is only yours if it is filed under your user id.
  test("refuses another user's session id", () => {
    assert.equal(findLiveSession(createSession(bob), alice), null);
  });

  test('refuses an expired session', () => {
    const sid = createSession(alice, { now: new Date('2020-01-01T00:00:00.000Z') });
    assert.equal(findLiveSession(sid, alice), null);
  });

  test('accepts a session one second before it lapses', () => {
    const issued = new Date('2026-08-19T00:00:00.000Z');
    const sid = createSession(alice, { now: issued });
    const justBefore = new Date('2026-08-25T23:59:59.000Z');
    assert.ok(findLiveSession(sid, alice, { now: justBefore }));
  });

  test('survives a missing sid rather than throwing', () => {
    assert.equal(findLiveSession(undefined, alice), null);
    assert.equal(findLiveSession('', alice), null);
  });
});

test.describe('deleteSession', () => {
  // The whole point: one device signs out, the others carry on.
  test('removes only the named device', () => {
    const user = makeUser('twodevices@example.com');
    const phone = createSession(user);
    const desktop = createSession(user);
    deleteSession(phone, user);
    assert.equal(findLiveSession(phone, user), null);
    assert.ok(findLiveSession(desktop, user));
  });

  test("cannot delete another user's session", () => {
    const victim = createSession(bob);
    assert.equal(deleteSession(victim, alice), 0);
    assert.ok(findLiveSession(victim, bob));
  });

  test('deleting twice is harmless', () => {
    const user = makeUser('twice@example.com');
    const sid = createSession(user);
    assert.equal(deleteSession(sid, user), 1);
    assert.equal(deleteSession(sid, user), 0);
  });
});

test.describe('deleteAllSessions', () => {
  test('signs every device out at once', () => {
    const user = makeUser('everywhere@example.com');
    createSession(user); createSession(user); createSession(user);
    deleteAllSessions(user);
    assert.equal(countFor(user), 0);
  });

  test('leaves other accounts untouched', () => {
    const user = makeUser('isolated@example.com');
    createSession(user);
    const before = countFor(bob);
    deleteAllSessions(user);
    assert.equal(countFor(bob), before);
  });
});

test.describe('sweepExpiredSessions', () => {
  test('removes lapsed rows', () => {
    const user = makeUser('lapsed@example.com');
    createSession(user, { now: new Date('2020-01-01T00:00:00.000Z') });
    sweepExpiredSessions();
    assert.equal(countFor(user), 0);
  });

  test('keeps live ones', () => {
    const user = makeUser('current@example.com');
    createSession(user, { now: new Date('2020-01-01T00:00:00.000Z') });
    const live = createSession(user);
    sweepExpiredSessions();
    assert.ok(findLiveSession(live, user));
  });
});

test.describe('account deletion', () => {
  // ON DELETE CASCADE, so removing an account cannot leave orphan sessions that
  // a later user id could collide with.
  test('takes the account\'s sessions with it', () => {
    const doomed = makeUser('doomed@example.com');
    createSession(doomed);
    db.prepare('DELETE FROM users WHERE id = ?').run(doomed);
    assert.equal(countFor(doomed), 0);
  });
});
