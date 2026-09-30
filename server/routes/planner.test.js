const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
process.env.DATABASE_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'planner-version-')), 'test.db');
process.env.JWT_SECRET = 'synthetic-test-session-secret-at-least32';
process.env.LOG_LEVEL = 'error';
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { createSession } = require('../sessions');
const userId = db.prepare('INSERT INTO users(email,password_hash) VALUES(?,?)').run('synthetic@example.com', 'unused').lastInsertRowid;
const token = jwt.sign({ id: userId, tv: 0, sid: createSession(userId) }, process.env.JWT_SECRET);
const app = express();
app.use(cookieParser(), express.json());
app.use('/api/planner', require('./planner'));
app.use('/api/exams', require('./exams'));
const listener = app.listen(0);
const base = `http://127.0.0.1:${listener.address().port}`;
test.after(() => listener.close());

async function call(url, body, version, key = randomUUID(), method = 'POST') {
  const res = await fetch(base + url, { method, headers: {
    Cookie: `token=${token}`, 'Content-Type': 'application/json',
    ...(version ? { 'X-Planner-Epoch': version.epoch, 'X-Planner-Revision': String(version.revision), 'Idempotency-Key': key } : {}),
  }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: res.status, body: await res.json() };
}

test('versioned website writes replay once, conflict on stale edits and undo exact records', async () => {
  const before = (await call('/api/planner/version', null, null, null, 'GET')).body.version;
  const key = randomUUID();
  const payload = { title: 'Exam', exam_date: '2026-10-01' };
  const first = await call('/api/exams', payload, before, key);
  assert.equal(first.status, 201);
  assert.equal(first.body.undoAvailable, true);
  const repeat = await call('/api/exams', payload, before, key);
  assert.equal(repeat.body.replayed, true);
  assert.equal(db.prepare('SELECT count(*) n FROM exams WHERE user_id=?').get(userId).n, 1);
  assert.equal((await call('/api/exams', payload, before)).status, 409);
  const undo = await call('/api/planner/undo', { operationId: first.body.operationId }, first.body.currentVersion);
  assert.equal(undo.status, 200);
  assert.equal(db.prepare('SELECT count(*) n FROM exams WHERE user_id=?').get(userId).n, 0);
});

test('planner reads require a live website session', async () => {
  assert.equal((await fetch(base + '/api/planner/version')).status, 401);
});
