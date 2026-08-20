const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Must be set before db.js is required -- it opens the file at module load.
process.env.DATABASE_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'uni-planner-auth-mw-')), 'planner.db'
);
process.env.JWT_SECRET = 'test-secret-long-enough-for-the-check';
process.env.LOG_LEVEL = 'error';

const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const db = require('../db');
const requireAuth = require('./auth');
const { SESSION_COOKIE_NAME } = require('../config');
const { createSession, deleteSession } = require('../sessions');

const EMAIL = 'alice@example.com';
const userId = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)')
  .run(EMAIL, 'x').lastInsertRowid;

// Every token gets its own session row, because requireAuth now demands one --
// a `sid` naming a live session is half the credential.
const sign = (claims, secret = process.env.JWT_SECRET) =>
  jwt.sign({ id: userId, email: EMAIL, tv: 0, sid: createSession(userId), ...claims }, secret);

const app = express();
app.use(cookieParser());
app.get('/probe', requireAuth, (req, res) => res.json({ id: req.user.id }));
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => server.close());

const probe = (headers) => fetch(`${base}/probe`, { headers });
const withCookie = (token) => ({ Cookie: `${SESSION_COOKIE_NAME}=${token}` });

// A JWT the library must refuse outright: no signature, alg declared as "none".
function unsignedToken() {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ id: userId, email: EMAIL, tv: 0 })}.`;
}

test.describe('requireAuth', () => {
  test('accepts the session cookie', async () => {
    const res = await probe(withCookie(sign({})));
    assert.deepEqual({ status: res.status, body: await res.json() }, { status: 200, body: { id: userId } });
  });

  // The Bearer path sidestepped SameSite, and no client ever sent one.
  test('rejects an Authorization: Bearer token with no cookie', async () => {
    const res = await probe({ Authorization: `Bearer ${sign({})}` });
    assert.equal(res.status, 401);
  });

  test('rejects an unsigned alg:none token', async () => {
    const res = await probe(withCookie(unsignedToken()));
    assert.equal(res.status, 401);
  });

  test('rejects a token signed with a different secret', async () => {
    const res = await probe(withCookie(sign({}, 'a-completely-different-signing-secret')));
    assert.equal(res.status, 401);
  });

  test('rejects a token whose tv predates the current token_version', async () => {
    const token = sign({ tv: 0 });
    db.prepare('UPDATE users SET token_version = token_version + 1 WHERE id = ?').run(userId);
    const res = await probe(withCookie(token));
    db.prepare('UPDATE users SET token_version = 0 WHERE id = ?').run(userId);
    assert.equal(res.status, 401);
  });

  test('rejects a request with no credential at all', async () => {
    const res = await probe({});
    assert.equal(res.status, 401);
  });

  // Per-device logout: the token is otherwise perfectly valid, and is refused
  // solely because its session row is gone.
  test('rejects a token whose session has been signed out', async () => {
    const sid = createSession(userId);
    const token = jwt.sign({ id: userId, email: EMAIL, tv: 0, sid }, process.env.JWT_SECRET);
    assert.equal((await probe(withCookie(token))).status, 200);
    deleteSession(sid, userId);
    assert.equal((await probe(withCookie(token))).status, 401);
  });

  test('rejects a token carrying no sid at all', async () => {
    const token = jwt.sign({ id: userId, email: EMAIL, tv: 0 }, process.env.JWT_SECRET);
    assert.equal((await probe(withCookie(token))).status, 401);
  });

  // Pairing sid with the token's user means a row belonging to someone else
  // cannot be presented as your own (AR-2).
  test('rejects a session id belonging to a different user', async () => {
    const other = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)')
      .run('bob@example.com', 'x').lastInsertRowid;
    const token = jwt.sign(
      { id: userId, email: EMAIL, tv: 0, sid: createSession(other) }, process.env.JWT_SECRET
    );
    assert.equal((await probe(withCookie(token))).status, 401);
  });
});
