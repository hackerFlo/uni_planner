const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Must be set before db.js is required -- it opens the file at module load.
process.env.DATABASE_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'uni-planner-auth-routes-')), 'planner.db'
);
process.env.JWT_SECRET = 'test-secret-long-enough-for-the-check';
process.env.LOG_LEVEL = 'error';
// The limiters now fail closed, so a test that logs in repeatedly has to opt out
// deliberately rather than rely on NODE_ENV being unset.
process.env.DISABLE_RATE_LIMIT = 'true';

const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../db');
const authRoutes = require('./auth');
const { SESSION_COOKIE_NAME } = require('../config');
const { createSession } = require('../sessions');

const PASSWORD = 'correct-horse-battery';
const passwordHash = bcrypt.hashSync(PASSWORD, 4);

function makeUser(email) {
  const id = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)')
    .run(email, passwordHash).lastInsertRowid;
  return { id, email };
}

const tokenVersionOf = (id) =>
  db.prepare('SELECT token_version FROM users WHERE id = ?').get(id).token_version;

const sessionCountOf = (id) =>
  db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?').get(id).n;

// Each call mints its own session row, so two calls model two devices.
const tokenFor = (user) =>
  jwt.sign(
    { id: user.id, email: user.email, tv: tokenVersionOf(user.id), sid: createSession(user.id) },
    process.env.JWT_SECRET,
  );

const app = express();
app.use(cookieParser());
app.use(express.json());
app.use('/api/auth', authRoutes);
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => server.close());

const post = (url, { token, body } = {}) => fetch(`${base}${url}`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    ...(token ? { Cookie: `${SESSION_COOKIE_NAME}=${token}` } : {}),
  },
  body: JSON.stringify(body ?? {}),
});

const patch = (url, { token, body }) => fetch(`${base}${url}`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json', Cookie: `${SESSION_COOKIE_NAME}=${token}` },
  body: JSON.stringify(body),
});

function pauseFirstBcryptCall(t, method) {
  let enter;
  let release;
  const entered = new Promise(resolve => { enter = resolve; });
  const barrier = new Promise(resolve => { release = resolve; });
  const original = bcrypt[method];
  let first = true;
  t.mock.method(bcrypt, method, async (...args) => {
    if (first) { first = false; enter(); await barrier; }
    return original(...args);
  });
  t.after(release);
  return { entered, release };
}

test.describe('credential races', { timeout: 5000 }, () => {
  for (const method of ['compare', 'hash']) {
    test(`does not revive a logged-out session while ${method} is pending`, async t => {
      const user = makeUser(`logout-${method}-race@example.com`);
      const token = tokenFor(user);
      const pause = pauseFirstBcryptCall(t, method);
      const pending = patch('/api/auth/me', { token,
        body: { currentPassword: PASSWORD, newPassword: 'replacement-password' } });
      await pause.entered;
      await post('/api/auth/logout', { token });
      pause.release();
      const res = await pending;
      assert.deepEqual({ status: res.status, sessions: sessionCountOf(user.id), version: tokenVersionOf(user.id) },
        { status: 401, sessions: 0, version: 0 });
    });
  }

  test('rejects a stale change after newer credentials and MCP reenrollment', async t => {
    const user = makeUser('concurrent-credentials@example.com');
    const token = tokenFor(user);
    const pause = pauseFirstBcryptCall(t, 'compare');
    const pending = patch('/api/auth/me', { token,
      body: { currentPassword: PASSWORD, newEmail: 'stale-identifier@example.com' } });
    await pause.entered;
    const newer = await patch('/api/auth/me', { token,
      body: { currentPassword: PASSWORD, newPassword: 'replacement-password' } });
    assert.equal(newer.status, 200);
    const links = require('../mcp/links').createLinkService(db);
    links.enroll(user.id, { issuer: 'https://example.com', subject: 'test-credential-race' }, ['planner_read']);
    pause.release();
    const res = await pending;
    const current = db.prepare('SELECT email, password_hash FROM users WHERE id = ?').get(user.id);
    assert.deepEqual({ status: res.status, email: current.email, version: tokenVersionOf(user.id),
      passwordMatches: await bcrypt.compare('replacement-password', current.password_hash), linked: links.status(user.id).linked },
    { status: 401, email: user.email, version: 1, passwordMatches: true, linked: true });
    const freshToken = newer.headers.get('set-cookie').split(';')[0].slice(SESSION_COOKIE_NAME.length + 1);
    const validChange = await patch('/api/auth/me', { token: freshToken,
      body: { currentPassword: 'replacement-password', newEmail: 'confirmed-identifier@example.com' } });
    assert.deepEqual({ status: validChange.status, version: tokenVersionOf(user.id), linked: links.status(user.id).linked },
      { status: 200, version: 2, linked: false });
  });

  test('rejects a session that expires during password verification', async t => {
    const user = makeUser('expired-credential-race@example.com');
    const token = tokenFor(user);
    const pause = pauseFirstBcryptCall(t, 'compare');
    const pending = patch('/api/auth/me', { token,
      body: { currentPassword: PASSWORD, newEmail: 'should-not-change@example.com' } });
    await pause.entered;
    db.prepare('UPDATE sessions SET expires_at = ? WHERE user_id = ?').run('2000-01-01T00:00:00.000Z', user.id);
    pause.release();
    const res = await pending;
    assert.deepEqual({ status: res.status, version: tokenVersionOf(user.id) }, { status: 401, version: 0 });
  });

  test('does not issue a session after a login verifies an obsolete password', async t => {
    const user = makeUser('login-password-race@example.com');
    const pause = pauseFirstBcryptCall(t, 'compare');
    const pending = post('/api/auth/login', { body: { email: user.email, password: PASSWORD } });
    await pause.entered;
    await patch('/api/auth/me', { token: tokenFor(user),
      body: { currentPassword: PASSWORD, newPassword: 'replacement-password' } });
    pause.release();
    const res = await pending;
    assert.deepEqual({ status: res.status, sessions: sessionCountOf(user.id), cookieIssued: res.headers.has('set-cookie') },
      { status: 401, sessions: 1, cookieIssued: false });
  });

  test('rejects unknown fields and unbounded passwords before invoking bcrypt', async t => {
    const user = makeUser('invalid-credential-input@example.com');
    const compare = t.mock.method(bcrypt, 'compare', async () => true);
    for (const body of [
      { currentPassword: PASSWORD, newEmail: 'valid@example.com', token_version: 99 },
      { currentPassword: 'a'.repeat(129), newEmail: 'valid@example.com' },
    ]) {
      assert.equal((await patch('/api/auth/me', { token: tokenFor(user), body })).status, 400);
    }
    assert.equal(compare.mock.callCount(), 0);
  });
});

test.describe('POST /logout', () => {
  // Clearing the cookie alone left a copied JWT usable for its remaining 7 days.
  test('makes the logged-out token unusable on a protected route', async () => {
    const user = makeUser('stale@example.com');
    const token = tokenFor(user);
    await post('/api/auth/logout', { token });
    const res = await fetch(`${base}/api/auth/me`, { headers: { Cookie: `${SESSION_COOKIE_NAME}=${token}` } });
    assert.equal(res.status, 401);
  });

  // The point of the whole sessions table: signing out on a phone must not sign
  // you out on the desktop. This is what bumping token_version got wrong.
  test('leaves another device signed in', async () => {
    const user = makeUser('twodevices@example.com');
    const phone = tokenFor(user);
    const desktop = tokenFor(user);
    await post('/api/auth/logout', { token: phone });
    const res = await fetch(`${base}/api/auth/me`, { headers: { Cookie: `${SESSION_COOKIE_NAME}=${desktop}` } });
    assert.equal(res.status, 200);
  });

  test('removes only the session it was given', async () => {
    const user = makeUser('onerow@example.com');
    const phone = tokenFor(user);
    tokenFor(user); // desktop
    assert.equal(sessionCountOf(user.id), 2);
    await post('/api/auth/logout', { token: phone });
    assert.equal(sessionCountOf(user.id), 1);
  });

  // Logging out is not a credential compromise, so the global lever stays down.
  test('does not bump token_version', async () => {
    const user = makeUser('logout@example.com');
    const before = tokenVersionOf(user.id);
    await post('/api/auth/logout', { token: tokenFor(user) });
    assert.equal(tokenVersionOf(user.id), before);
  });

  test('still answers 200 with no cookie at all', async () => {
    const res = await post('/api/auth/logout');
    assert.equal(res.status, 200);
  });

  test('still answers 200 for a forged cookie, and revokes nothing', async () => {
    const user = makeUser('forged@example.com');
    tokenFor(user);
    const before = sessionCountOf(user.id);
    const forged = jwt.sign({ id: user.id, tv: 0, sid: 'made-up' }, 'not-the-real-signing-secret');
    const res = await post('/api/auth/logout', { token: forged });
    assert.deepEqual(
      { status: res.status, sessions: sessionCountOf(user.id) },
      { status: 200, sessions: before },
    );
  });

  // A token from before sessions existed carries no sid and cannot be trusted,
  // because nothing can revoke it individually.
  test('rejects a token minted before sessions existed', async () => {
    const user = makeUser('legacy@example.com');
    const legacy = jwt.sign({ id: user.id, email: user.email, tv: tokenVersionOf(user.id) }, process.env.JWT_SECRET);
    const res = await fetch(`${base}/api/auth/me`, { headers: { Cookie: `${SESSION_COOKIE_NAME}=${legacy}` } });
    assert.equal(res.status, 401);
  });
});

test.describe('PATCH /me', () => {
  // Email is the login identifier, so changing it is a credential change.
  test('revokes other sessions on an email-only change', async () => {
    const user = makeUser('rename-me@example.com');
    const before = tokenVersionOf(user.id);
    const res = await patch('/api/auth/me', {
      token: tokenFor(user),
      body: { currentPassword: PASSWORD, newEmail: 'renamed@example.com' },
    });
    assert.deepEqual(
      { status: res.status, tv: tokenVersionOf(user.id) },
      { status: 200, tv: before + 1 },
    );
  });

  test('still revokes other sessions on a password change', async () => {
    const user = makeUser('repassword@example.com');
    const before = tokenVersionOf(user.id);
    await patch('/api/auth/me', {
      token: tokenFor(user),
      body: { currentPassword: PASSWORD, newPassword: 'another-long-password' },
    });
    assert.equal(tokenVersionOf(user.id), before + 1);
  });

  test('leaves token_version alone when the current password is wrong', async () => {
    const user = makeUser('wrongpass@example.com');
    const before = tokenVersionOf(user.id);
    const res = await patch('/api/auth/me', {
      token: tokenFor(user),
      body: { currentPassword: 'not-it', newEmail: 'nope@example.com' },
    });
    assert.deepEqual(
      { status: res.status, tv: tokenVersionOf(user.id) },
      { status: 401, tv: before },
    );
  });
});

test.describe('PATCH /notification-settings', () => {
  test('rejects truthy strings and unknown settings fields', async () => {
    const user = makeUser('strict-notification-settings@example.com');
    for (const body of [{ notify_enabled: 'false' }, { notify_enabled: true, user_id: 999 }]) {
      assert.equal((await patch('/api/auth/notification-settings', { token: tokenFor(user), body })).status, 400);
    }
    assert.equal(db.prepare('SELECT notify_enabled FROM users WHERE id=?').get(user.id).notify_enabled, 0);
  });

  test('requires mutation preconditions when agent writes are enabled', async () => {
    const user = makeUser('versioned-notification-settings@example.com');
    const saved = process.env.MCP_WRITES_ENABLED;
    process.env.MCP_WRITES_ENABLED = 'true';
    try {
      assert.equal((await patch('/api/auth/notification-settings', { token: tokenFor(user), body: { notify_time: '08:00' } })).status, 409);
      assert.equal((await post('/api/auth/test-email', { token: tokenFor(user), body: {} })).status, 409);
    } finally {
      if (saved === undefined) delete process.env.MCP_WRITES_ENABLED;
      else process.env.MCP_WRITES_ENABLED = saved;
    }
  });
  // notify_email is handed to nodemailer as a recipient, so a bare length check
  // is not enough: a CRLF lets a caller append their own mail headers, and a
  // non-address is only discovered later, inside the scheduler, where the
  // failure is invisible to the person who typed it.
  const rejected = [
    ['not-an-address', 'no @ at all'],
    ['no-domain@', 'empty domain'],
    ['@no-local.example', 'empty local part'],
    ['two@@example.com', 'double @'],
    ['spaces in@example.com', 'space in local part'],
    ['crlf@example.com\r\nBcc: attacker@evil.example', 'CRLF header injection'],
    ['crlf@example.com\nBcc: attacker@evil.example', 'bare LF header injection'],
    ['tab\t@example.com', 'tab'],
    ['trailing.dot@example.', 'domain ends in a dot'],
  ];

  rejected.forEach(([value, why], i) => {
    test(`rejects ${why}`, async () => {
      const user = makeUser(`reject-${i}@example.com`);
      const res = await patch('/api/auth/notification-settings', {
        token: tokenFor(user),
        body: { notify_email: value },
      });
      const row = db.prepare('SELECT notify_email_enc FROM users WHERE id = ?').get(user.id);
      assert.deepEqual(
        { status: res.status, stored: row.notify_email_enc },
        { status: 400, stored: null },
      );
    });
  });

  test('accepts a normal address', async () => {
    const saved = process.env.NOTIFICATION_ENCRYPT_KEY;
    process.env.NOTIFICATION_ENCRYPT_KEY = 'a'.repeat(64);
    const user = makeUser('accepts@example.com');
    const res = await patch('/api/auth/notification-settings', {
      token: tokenFor(user),
      body: { notify_email: 'someone+tag@sub.example.co.uk' },
    });
    if (saved === undefined) delete process.env.NOTIFICATION_ENCRYPT_KEY;
    else process.env.NOTIFICATION_ENCRYPT_KEY = saved;
    const row = db.prepare('SELECT notify_email_enc FROM users WHERE id = ?').get(user.id);
    assert.deepEqual(
      { status: res.status, stored: typeof row.notify_email_enc },
      { status: 200, stored: 'string' },
    );
  });

  test('clearing with an empty string still works', async () => {
    const user = makeUser('clears@example.com');
    const res = await patch('/api/auth/notification-settings', {
      token: tokenFor(user),
      body: { notify_email: '' },
    });
    assert.equal(res.status, 200);
  });

  // The catch used to bind `err` and drop it, leaving "Encryption not
  // configured" to cover a missing key, a rotated key and a corrupt ciphertext.
  test('reports a 500 rather than storing an unencrypted address', async () => {
    const user = makeUser('notify@example.com');
    const saved = process.env.NOTIFICATION_ENCRYPT_KEY;
    delete process.env.NOTIFICATION_ENCRYPT_KEY;
    const res = await patch('/api/auth/notification-settings', {
      token: tokenFor(user),
      body: { notify_email: 'someone@example.com' },
    });
    if (saved !== undefined) process.env.NOTIFICATION_ENCRYPT_KEY = saved;
    const row = db.prepare('SELECT notify_email_enc FROM users WHERE id = ?').get(user.id);
    assert.deepEqual(
      { status: res.status, stored: row.notify_email_enc },
      { status: 500, stored: null },
    );
  });
});
