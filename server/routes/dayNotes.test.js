const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Must be set before db.js is required -- it opens the file at module load.
process.env.DATABASE_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'uni-planner-day-notes-')), 'planner.db'
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
const dayNoteRoutes = require('./dayNotes');

function makeUser(email) {
  const id = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(email, 'x').lastInsertRowid;
  // requireAuth needs a live session row, not just a signed token.
  return { id, token: jwt.sign({ id, email, tv: 0, sid: createSession(id) }, process.env.JWT_SECRET) };
}

const alice = makeUser('alice@example.com');
const bob = makeUser('bob@example.com');

// Both accounts hold a note on this date, which is what makes the ownership
// checks below meaningful: the primary key is (user_id, date), so a query that
// forgets user_id finds the wrong row rather than no row.
const SHARED_DATE = '2026-08-19';

const seedNote = (user, date, note) => db.prepare(
  'INSERT INTO day_notes (user_id, date, note) VALUES (?, ?, ?)'
).run(user.id, date, note);

seedNote(alice, SHARED_DATE, 'Alice: lab report due');
seedNote(alice, '2026-08-17', 'Alice: reading week starts');
seedNote(bob, SHARED_DATE, 'Bob: dentist');

const app = express();
app.use(jsonBodyParser());
app.use(cookieParser());
app.use('/api/day-notes', dayNoteRoutes);
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => server.close());

async function call(user, method, url, body) {
  const res = await fetch(`${base}/api/day-notes${url}`, {
    method,
    headers: {
      ...(user ? { Cookie: `token=${user.token}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, body: await res.json() };
}

const storedNote = (user, date) => db.prepare(
  'SELECT note FROM day_notes WHERE user_id = ? AND date = ?'
).get(user.id, date)?.note;

const MAX_NOTE_LENGTH = 200;

test.describe('GET /api/day-notes', () => {
  test('returns the account\'s notes oldest first', async () => {
    const { body } = await call(alice, 'GET', '/');
    assert.deepEqual(body.notes.map(n => n.date), ['2026-08-17', SHARED_DATE]);
  });

  // AR-2: the two accounts share a date, so an unscoped read returns the wrong
  // person's note rather than nothing at all.
  test('never returns another account\'s note for the same day', async () => {
    const { body } = await call(bob, 'GET', '/');
    assert.deepEqual(body.notes.map(n => n.note), ['Bob: dentist']);
  });

  test('requires a session', async () => {
    assert.equal((await call(null, 'GET', '/')).status, 401);
  });
});

test.describe('PUT /api/day-notes/:date', () => {
  test('creates a note on a day that had none', async () => {
    const { status } = await call(alice, 'PUT', '/2026-08-20', { note: 'Alice: seminar' });
    assert.deepEqual({ status, stored: storedNote(alice, '2026-08-20') },
      { status: 200, stored: 'Alice: seminar' });
  });

  test('replaces the note on a day that already had one', async () => {
    await call(alice, 'PUT', `/${SHARED_DATE}`, { note: 'Alice: lab report submitted' });
    assert.equal(storedNote(alice, SHARED_DATE), 'Alice: lab report submitted');
  });

  // AR-2: the upsert is keyed on (user_id, date), so the other account's note
  // on that same date has to survive untouched.
  test('leaves the other account\'s note for that same day alone', () => {
    assert.equal(storedNote(bob, SHARED_DATE), 'Bob: dentist');
  });

  test('trims surrounding whitespace', async () => {
    await call(alice, 'PUT', '/2026-08-21', { note: '   Alice: gym   ' });
    assert.equal(storedNote(alice, '2026-08-21'), 'Alice: gym');
  });

  test('truncates a note past the length limit rather than rejecting it', async () => {
    const tooLong = 'y'.repeat(MAX_NOTE_LENGTH + 50);
    await call(alice, 'PUT', '/2026-08-22', { note: tooLong });
    assert.equal(storedNote(alice, '2026-08-22').length, MAX_NOTE_LENGTH);
  });

  test('an empty note deletes the row instead of storing a blank one', async () => {
    await call(alice, 'PUT', '/2026-08-20', { note: '' });
    assert.equal(storedNote(alice, '2026-08-20'), undefined);
  });

  test('a whitespace-only note counts as empty', async () => {
    await call(alice, 'PUT', '/2026-08-21', { note: '    ' });
    assert.equal(storedNote(alice, '2026-08-21'), undefined);
  });

  test('a missing note field clears the day rather than throwing', async () => {
    const { status } = await call(alice, 'PUT', '/2026-08-22', {});
    assert.deepEqual({ status, stored: storedNote(alice, '2026-08-22') },
      { status: 200, stored: undefined });
  });

  test('rejects a date that is not YYYY-MM-DD', async () => {
    assert.equal((await call(alice, 'PUT', '/19-08-2026', { note: 'nope' })).status, 400);
  });

  test('rejects a path segment that is not a date at all', async () => {
    assert.equal((await call(alice, 'PUT', '/tomorrow', { note: 'nope' })).status, 400);
  });

  test('requires a session', async () => {
    assert.equal((await call(null, 'PUT', `/${SHARED_DATE}`, { note: 'nope' })).status, 401);
  });

  test('and that rejected write did not land', () => {
    assert.equal(storedNote(alice, SHARED_DATE), 'Alice: lab report submitted');
  });
});
