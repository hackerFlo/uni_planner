const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.DATABASE_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'uni-planner-recdel-')), 'planner.db'
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
const { addDays } = require('../recurrence');
const todoRoutes = require('./todos');

function makeUser(email) {
  const id = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(email, 'x').lastInsertRowid;
  // requireAuth needs a live session row, not just a signed token.
  return { id, token: jwt.sign({ id, email, tv: 0, sid: createSession(id) }, process.env.JWT_SECRET) };
}

const alice = makeUser('alice@example.com');
const bob = makeUser('bob@example.com');

const listFor = (u) => db.prepare('INSERT INTO lists (user_id, name, color, sort_order) VALUES (?, ?, ?, ?)')
  .run(u.id, 'Tasks', 'indigo', 0).lastInsertRowid;
const aliceList = listFor(alice);
const bobList = listFor(bob);

const app = express();
app.use(cookieParser());
app.use(express.json());
app.use('/api/todos', todoRoutes);
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => server.close());

const call = async (user, method, url, body) => {
  const res = await fetch(`${base}${url}`, {
    method,
    headers: { Cookie: `token=${user.token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
};

// The materialisation window is "Monday of this week .. next Sunday" in the user's
// tz (UTC here), so a series anchored on today always produces future instances.
const TODAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

const DAILY = { recurrence_interval_days: 1, recurrence_pattern: null };
const sorted = (ids) => [...ids].sort((a, b) => a - b);
const idsInDb = (parentId) => db.prepare('SELECT id FROM todos WHERE recurrence_parent_id = ?').all(parentId).map(r => r.id);
const rowExists = (id) => db.prepare('SELECT 1 FROM todos WHERE id = ?').get(id) !== undefined;

async function createDailySeries(user, listId, title) {
  const { body } = await call(user, 'POST', '/api/todos', {
    title, list_id: listId, day_assigned: TODAY, ...DAILY,
  });
  return { template: body.todo, children: body.materialized };
}

test.describe('PATCH /api/todos/:id removedIds', () => {
  test('reports the future instances it deleted when a series stops recurring', async () => {
    const { template, children } = await createDailySeries(alice, aliceList, 'Daily standup');
    assert.ok(children.length > 0, 'fixture must materialise at least one instance');

    const { body } = await call(alice, 'PATCH', `/api/todos/${template.id}`, {
      recurrence_interval_days: null, recurrence_pattern: null,
    });

    assert.deepEqual(sorted(body.removedIds), sorted(children.map(c => c.id)));
  });

  test('every reported id is really gone from the database', async () => {
    const { template } = await createDailySeries(alice, aliceList, 'Daily gym');

    const { body } = await call(alice, 'PATCH', `/api/todos/${template.id}`, {
      recurrence_interval_days: null, recurrence_pattern: null,
    });

    assert.deepEqual(body.removedIds.filter(rowExists), []);
  });

  test('leaves nothing behind: the series has no instances left', async () => {
    const { template } = await createDailySeries(alice, aliceList, 'Daily reading');
    await call(alice, 'PATCH', `/api/todos/${template.id}`, {
      recurrence_interval_days: null, recurrence_pattern: null,
    });
    assert.deepEqual(idsInDb(template.id), []);
  });

  test('does not report a completed instance, which survives the change', async () => {
    const { template, children } = await createDailySeries(alice, aliceList, 'Daily kept');
    const kept = children[0].id;
    db.prepare('UPDATE todos SET completed = 1, archived = 1 WHERE id = ? AND user_id = ?').run(kept, alice.id);

    const { body } = await call(alice, 'PATCH', `/api/todos/${template.id}`, {
      recurrence_interval_days: null, recurrence_pattern: null,
    });

    assert.equal(body.removedIds.includes(kept), false);
    assert.equal(rowExists(kept), true);
  });

  test('does not report a past instance, which is history and stays put', async () => {
    const { template } = await createDailySeries(alice, aliceList, 'Daily past');
    const pastId = db.prepare(
      'INSERT INTO todos (user_id, list_id, title, day_assigned, recurrence_parent_id) VALUES (?, ?, ?, ?, ?)'
    ).run(alice.id, aliceList, 'Daily past', addDays(TODAY, -3), template.id).lastInsertRowid;

    const { body } = await call(alice, 'PATCH', `/api/todos/${template.id}`, {
      recurrence_interval_days: null, recurrence_pattern: null,
    });

    assert.equal(body.removedIds.includes(pastId), false);
    assert.equal(rowExists(pastId), true);
  });

  test('is empty when the patch changes no recurrence', async () => {
    const { template } = await createDailySeries(alice, aliceList, 'Daily renamed');
    const { body } = await call(alice, 'PATCH', `/api/todos/${template.id}`, { title: 'Renamed' });
    assert.deepEqual(body.removedIds, []);
  });

  // AR-2: a delete that forgets the owner would reach across accounts.
  test("never touches another account's identical series", async () => {
    const bobSeries = await createDailySeries(bob, bobList, 'Daily standup');
    const { template } = await createDailySeries(alice, aliceList, 'Daily standup');

    const { body } = await call(alice, 'PATCH', `/api/todos/${template.id}`, {
      recurrence_interval_days: null, recurrence_pattern: null,
    });

    const bobIds = bobSeries.children.map(c => c.id);
    assert.deepEqual(body.removedIds.filter(id => bobIds.includes(id)), []);
    assert.deepEqual(sorted(idsInDb(bobSeries.template.id)), sorted(bobIds));
  });

  test('reports the later siblings deleted when an instance splits the series', async () => {
    const { children } = await createDailySeries(alice, aliceList, 'Daily split');
    const ordered = [...children].sort((a, b) => a.day_assigned.localeCompare(b.day_assigned));
    assert.ok(ordered.length >= 3, 'fixture needs siblings on both sides of the split');
    const pivot = ordered[1];
    const laterIds = ordered.slice(2).map(c => c.id);

    const { body } = await call(alice, 'PATCH', `/api/todos/${pivot.id}`, {
      recurrence_interval_days: 2, recurrence_pattern: null,
    });

    assert.deepEqual(sorted(body.removedIds), sorted(laterIds));
  });

  test('does not report an earlier sibling, which is detached rather than deleted', async () => {
    const { template, children } = await createDailySeries(alice, aliceList, 'Daily detach');
    const ordered = [...children].sort((a, b) => a.day_assigned.localeCompare(b.day_assigned));
    const pivot = ordered[1];
    const earlier = ordered[0];

    const { body } = await call(alice, 'PATCH', `/api/todos/${pivot.id}`, {
      recurrence_interval_days: 2, recurrence_pattern: null,
    });

    assert.equal(body.removedIds.includes(earlier.id), false);
    assert.equal(rowExists(earlier.id), true);
    assert.equal(rowExists(template.id), true);
  });

  test('never reports an id it also returns as materialised', async () => {
    const { template } = await createDailySeries(alice, aliceList, 'Daily respan');
    const { body } = await call(alice, 'PATCH', `/api/todos/${template.id}`, {
      recurrence_interval_days: 3, recurrence_pattern: null,
    });
    const materializedIds = body.materialized.map(t => t.id);
    assert.deepEqual(body.removedIds.filter(id => materializedIds.includes(id)), []);
  });
});
