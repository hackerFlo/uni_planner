const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Must be set before db.js is required -- it opens the file at module load.
process.env.DATABASE_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'uni-planner-exams-')), 'planner.db'
);
process.env.JWT_SECRET = 'test-secret-long-enough-for-the-check';
process.env.LOG_LEVEL = 'error';
process.env.DISABLE_RATE_LIMIT = 'true';
// The limiters live in index.js, not in these routers, so this app never mounts one.
delete process.env.NODE_ENV;

const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { createSession } = require('../sessions');
const { jsonBodyParser } = require('../middleware/bodyParser');
const examRoutes = require('./exams');

function makeUser(email) {
  const id = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(email, 'x').lastInsertRowid;
  // requireAuth needs a live session row, not just a signed token.
  return { id, token: jwt.sign({ id, email, tv: 0, sid: createSession(id) }, process.env.JWT_SECRET) };
}

const alice = makeUser('alice@example.com');
const bob = makeUser('bob@example.com');

const seedExam = (user, title, date) => db.prepare(
  'INSERT INTO exams (user_id, title, exam_date) VALUES (?, ?, ?)'
).run(user.id, title, date).lastInsertRowid;

const aliceLate = seedExam(alice, 'Statistics', '2026-09-20');
const aliceEarly = seedExam(alice, 'Analysis', '2026-09-01');
const bobsExam = seedExam(bob, 'Bob\'s viva', '2026-09-10');

const app = express();
app.use(jsonBodyParser());
app.use(cookieParser());
app.use('/api/exams', examRoutes);
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => server.close());

async function call(user, method, url, body) {
  const res = await fetch(`${base}/api/exams${url}`, {
    method,
    headers: {
      ...(user ? { Cookie: `token=${user.token}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, body: await res.json() };
}

const rowById = (id) => db.prepare('SELECT title, exam_date, user_id FROM exams WHERE id = ?').get(id);

const MAX_TITLE_LENGTH = 200;

test.describe('GET /api/exams', () => {
  test('returns the account\'s exams soonest first', async () => {
    const { body } = await call(alice, 'GET', '/');
    assert.deepEqual(body.exams.map(e => e.title), ['Analysis', 'Statistics']);
  });

  // AR-2
  test('never returns another account\'s exams', async () => {
    const { body } = await call(bob, 'GET', '/');
    assert.deepEqual(body.exams.map(e => e.title), ['Bob\'s viva']);
  });

  test('requires a session', async () => {
    assert.equal((await call(null, 'GET', '/')).status, 401);
  });
});

test.describe('POST /api/exams', () => {
  test('stores the exam and hands back its new id', async () => {
    const { status, body } = await call(alice, 'POST', '/', { title: 'Algebra', exam_date: '2026-10-05' });
    assert.deepEqual(
      { status, title: body.exam.title, date: body.exam.exam_date, id: typeof body.exam.id },
      { status: 201, title: 'Algebra', date: '2026-10-05', id: 'number' },
    );
  });

  test('files the new exam under the caller, not some other account', () => {
    const row = db.prepare('SELECT user_id FROM exams WHERE title = ?').get('Algebra');
    assert.equal(row.user_id, alice.id);
  });

  test('rejects a blank title', async () => {
    assert.equal((await call(alice, 'POST', '/', { title: '  ', exam_date: '2026-10-05' })).status, 400);
  });

  test('rejects a title past the length limit', async () => {
    const tooLong = 'x'.repeat(MAX_TITLE_LENGTH + 1);
    assert.equal((await call(alice, 'POST', '/', { title: tooLong, exam_date: '2026-10-05' })).status, 400);
  });

  test('rejects a date that is not YYYY-MM-DD', async () => {
    assert.equal((await call(alice, 'POST', '/', { title: 'Algebra', exam_date: '05-10-2026' })).status, 400);
  });

  test('rejects a missing date rather than filing an undated exam', async () => {
    assert.equal((await call(alice, 'POST', '/', { title: 'Algebra' })).status, 400);
  });
});

test.describe('PATCH /api/exams/:id', () => {
  test('moves an exam the caller owns', async () => {
    const { body } = await call(alice, 'PATCH', `/${aliceLate}`, { exam_date: '2026-09-25' });
    assert.equal(body.exam.exam_date, '2026-09-25');
  });

  // AR-2: the UPDATE carries user_id, so a foreign id changes nothing and the
  // zero-row result is reported as "not found".
  test('refuses to edit another account\'s exam', async () => {
    assert.equal((await call(alice, 'PATCH', `/${bobsExam}`, { title: 'Mine now' })).status, 404);
  });

  test('leaves that other account\'s exam exactly as it was', () => {
    assert.equal(rowById(bobsExam).title, 'Bob\'s viva');
  });

  test('rejects a request that changes nothing', async () => {
    assert.equal((await call(alice, 'PATCH', `/${aliceEarly}`, {})).status, 400);
  });

  test('rejects a malformed date', async () => {
    assert.equal((await call(alice, 'PATCH', `/${aliceEarly}`, { exam_date: 'tomorrow' })).status, 400);
  });

  test('rejects a non-numeric id', async () => {
    assert.equal((await call(alice, 'PATCH', '/not-a-number', { title: 'Nope' })).status, 400);
  });

  test('reports an id that belongs to nobody as not found', async () => {
    assert.equal((await call(alice, 'PATCH', '/999999', { title: 'Nope' })).status, 404);
  });
});

test.describe('DELETE /api/exams/:id', () => {
  // AR-2
  test('refuses to delete another account\'s exam', async () => {
    assert.equal((await call(alice, 'DELETE', `/${bobsExam}`)).status, 404);
  });

  test('and that exam is still there afterwards', () => {
    assert.equal(rowById(bobsExam).user_id, bob.id);
  });

  test('deletes an exam the caller owns', async () => {
    await call(alice, 'DELETE', `/${aliceEarly}`);
    assert.equal(rowById(aliceEarly), undefined);
  });

  test('reports a second delete of the same id as not found', async () => {
    assert.equal((await call(alice, 'DELETE', `/${aliceEarly}`)).status, 404);
  });

  test('requires a session', async () => {
    assert.equal((await call(null, 'DELETE', `/${aliceLate}`)).status, 401);
  });
});
