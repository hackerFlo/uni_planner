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
