const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Must be set before db.js is required -- it opens the file at module load.
process.env.DATABASE_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'uni-planner-recurrence-')), 'planner.db'
);
process.env.JWT_SECRET = 'test-secret-long-enough-for-the-check';
process.env.LOG_LEVEL = 'error';

const db = require('./db');
const { materializeWindowForUser, getWindowBounds, addDays } = require('./recurrence');

const userId = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)')
  .run('alice@example.com', 'x').lastInsertRowid;
const listId = db.prepare('INSERT INTO lists (user_id, name, color, sort_order) VALUES (?, ?, ?, ?)')
  .run(userId, 'University', 'indigo', 0).lastInsertRowid;

// Anchored well before the materialisation window so every run has to fast-forward.
const { windowStart } = getWindowBounds('UTC');
const START_DAY = addDays(windowStart, -40);

function makeTemplate({ pattern = 'weekdays', interval = null, archived = 0 } = {}) {
  return db.prepare(
    `INSERT INTO todos (user_id, list_id, title, day_assigned, recurrence_pattern,
                        recurrence_interval_days, archived)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(userId, listId, 'Lecture', START_DAY, pattern, interval, archived).lastInsertRowid;
}

function instancesOf(templateId) {
  return db.prepare('SELECT day_assigned FROM todos WHERE recurrence_parent_id = ? AND user_id = ?')
    .all(templateId, userId).map(r => r.day_assigned);
}

function reset() {
  db.prepare('DELETE FROM todos WHERE user_id = ?').run(userId);
}

test.describe('materializeWindowForUser', () => {
  test('fills the window for a live template', () => {
    reset();
    const id = makeTemplate();
    materializeWindowForUser(userId, 'UTC');
    assert.ok(instancesOf(id).length > 0);
  });

  test('is idempotent -- a second pass adds nothing', () => {
    reset();
    const id = makeTemplate();
    materializeWindowForUser(userId, 'UTC');
    const afterFirst = instancesOf(id).length;
    materializeWindowForUser(userId, 'UTC');
    assert.equal(instancesOf(id).length, afterFirst);
  });

  // The reported bug. The template row is itself the first occurrence, so ticking
  // it off sets archived = 1 on the rule-carrying row. The series then generated
  // nothing ever again, and the already-materialised instances simply ran out --
  // which is why recurring tasks "disappeared after a couple of weeks".
  test('keeps generating after its first occurrence has been completed', () => {
    reset();
    const live = makeTemplate();
    materializeWindowForUser(userId, 'UTC');
    const expected = instancesOf(live).length;

    reset();
    const archived = makeTemplate({ archived: 1 });
    materializeWindowForUser(userId, 'UTC');
    assert.equal(instancesOf(archived).length, expected);
  });

  test('generates the same days whether or not the template is archived', () => {
    reset();
    const live = makeTemplate();
    materializeWindowForUser(userId, 'UTC');
    const liveDays = instancesOf(live).sort();

    reset();
    const archived = makeTemplate({ archived: 1 });
    materializeWindowForUser(userId, 'UTC');
    assert.deepEqual(instancesOf(archived).sort(), liveDays);
  });

  test('holds the same for an interval rule, not just a pattern', () => {
    reset();
    const live = makeTemplate({ pattern: null, interval: 3 });
    materializeWindowForUser(userId, 'UTC');
    const expected = instancesOf(live).length;
    assert.ok(expected > 0);

    reset();
    const archived = makeTemplate({ pattern: null, interval: 3, archived: 1 });
    materializeWindowForUser(userId, 'UTC');
    assert.equal(instancesOf(archived).length, expected);
  });

  // Deleting the series is what ends it -- DELETE /api/todos/:id?scope=all removes
  // the template and every instance together, so there is nothing left to generate.
  test('generates nothing once the template row is gone', () => {
    reset();
    const id = makeTemplate();
    materializeWindowForUser(userId, 'UTC');
    db.prepare('DELETE FROM todos WHERE user_id = ? AND (id = ? OR recurrence_parent_id = ?)')
      .run(userId, id, id);
    materializeWindowForUser(userId, 'UTC');
    assert.equal(instancesOf(id).length, 0);
  });

  test('ignores a todo carrying no recurrence rule', () => {
    reset();
    const id = db.prepare(
      'INSERT INTO todos (user_id, list_id, title, day_assigned) VALUES (?, ?, ?, ?)'
    ).run(userId, listId, 'One-off', START_DAY).lastInsertRowid;
    materializeWindowForUser(userId, 'UTC');
    assert.equal(instancesOf(id).length, 0);
  });

  test('every generated day falls inside the window', () => {
    reset();
    const id = makeTemplate();
    materializeWindowForUser(userId, 'UTC');
    const { windowStart: ws, windowEnd: we } = getWindowBounds('UTC');
    for (const day of instancesOf(id)) {
      assert.ok(day >= ws && day <= we, `${day} outside ${ws}..${we}`);
    }
  });
});
