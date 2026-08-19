const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Must be set before db.js is required -- it opens the file at module load.
process.env.DATABASE_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'uni-planner-backup-')), 'planner.db'
);
process.env.JWT_SECRET = 'test-secret-long-enough-for-the-check';
process.env.LOG_LEVEL = 'error';
delete process.env.NODE_ENV; // leaves the rate limiters skipped

const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const db = require('../db');
const backupRoutes = require('./backup');

function makeUser(email) {
  const id = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(email, 'x').lastInsertRowid;
  return { id, token: jwt.sign({ id, email, tv: 0 }, process.env.JWT_SECRET) };
}

const alice = makeUser('alice@example.com');
const bob = makeUser('bob@example.com');

const TEMPLATE_CREATED_AT = '2026-08-01T10:00:00.000Z';
const listId = db.prepare('INSERT INTO lists (user_id, name, color, sort_order) VALUES (?, ?, ?, ?)')
  .run(alice.id, 'University', 'indigo', 0).lastInsertRowid;
const templateId = db.prepare(
  'INSERT INTO todos (user_id, list_id, title, day_assigned, recurrence_pattern, created_at) VALUES (?, ?, ?, ?, ?, ?)'
).run(alice.id, listId, 'Lecture', '2026-08-03', 'weekdays', TEMPLATE_CREATED_AT).lastInsertRowid;
db.prepare(
  'INSERT INTO todos (user_id, list_id, title, day_assigned, recurrence_parent_id, created_at) VALUES (?, ?, ?, ?, ?, ?)'
).run(alice.id, listId, 'Lecture', '2026-08-04', templateId, '2026-08-04T00:00:00.000Z');
db.prepare('INSERT INTO day_notes (user_id, date, note) VALUES (?, ?, ?)')
  .run(alice.id, '2026-08-05', 'Reading week');

const app = express();
app.use(cookieParser());
app.use('/api/backup', backupRoutes);
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => server.close());

const exportAs = async (user) =>
  (await fetch(`${base}/api/backup`, { headers: { Cookie: `token=${user.token}` } })).json();

const restoreAs = async (user, payload) =>
  (await fetch(`${base}/api/backup/restore`, {
    method: 'POST',
    headers: { Cookie: `token=${user.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })).json();

let backup;

test.describe('backup export', () => {
  test('includes day notes, which earlier versions dropped entirely', async () => {
    backup = await exportAs(alice);
    assert.deepEqual(backup.day_notes, [
      { date: '2026-08-05', note: 'Reading week', updated_at: backup.day_notes[0].updated_at },
    ]);
  });

  test('carries the recurrence rule on the template', () => {
    const template = backup.todos.find(t => t.created_at === TEMPLATE_CREATED_AT);
    assert.equal(template.recurrence_pattern, 'weekdays');
  });

  test('identifies each instance by its template, not by a local row id', () => {
    const instance = backup.todos.find(t => t.day_assigned === '2026-08-04');
    assert.deepEqual(
      { title: instance.recurrence_parent_title, created: instance.recurrence_parent_created_at },
      { title: 'Lecture', created: TEMPLATE_CREATED_AT },
    );
  });

  test('exports only the requesting user (AR-2)', async () => {
    const { lists, todos, exams, day_notes: dayNotes } = await exportAs(bob);
    assert.deepEqual({ lists, todos, exams, dayNotes }, { lists: [], todos: [], exams: [], dayNotes: [] });
  });
});

test.describe('backup restore', () => {
  test('brings day notes back into a fresh account', async () => {
    const result = await restoreAs(bob, backup);
    assert.equal(result.notesImported, 1);
  });

  test('restores the recurrence rule, not just a one-off todo', () => {
    const template = db.prepare(
      'SELECT recurrence_pattern FROM todos WHERE user_id = ? AND created_at = ?'
    ).get(bob.id, TEMPLATE_CREATED_AT);
    assert.equal(template.recurrence_pattern, 'weekdays');
  });

  // Without the relink the scheduler cannot see the restored instance and
  // materialises a duplicate for a day that is already filled.
  test('relinks each instance to the template'
    + ' under its new row id', () => {
    const rows = db.prepare(
      'SELECT id, day_assigned, recurrence_pattern, recurrence_parent_id FROM todos WHERE user_id = ?'
    ).all(bob.id);
    const template = rows.find(r => r.recurrence_pattern === 'weekdays');
    const instance = rows.find(r => r.day_assigned === '2026-08-04');
    assert.equal(instance.recurrence_parent_id, template.id);
  });

  test('is idempotent: restoring the same file again imports nothing', async () => {
    const again = await restoreAs(bob, backup);
    assert.deepEqual(
      { todos: again.imported, notes: again.notesImported, exams: again.examsImported },
      { todos: 0, notes: 0, exams: 0 },
    );
  });

  test('rejects a payload with no todos array', async () => {
    const res = await fetch(`${base}/api/backup/restore`, {
      method: 'POST',
      headers: { Cookie: `token=${bob.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ todos: 'nope' }),
    });
    assert.equal(res.status, 400);
  });

  test('leaves the exporting account untouched', () => {
    const count = db.prepare('SELECT COUNT(*) AS n FROM todos WHERE user_id = ?').get(alice.id).n;
    assert.equal(count, 2);
  });
});
