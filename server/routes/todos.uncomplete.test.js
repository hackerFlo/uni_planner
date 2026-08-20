const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.DATABASE_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'uni-planner-uncomplete-')), 'planner.db'
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
const todoRoutes = require('./todos');

function makeUser(email) {
  const id = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(email, 'x').lastInsertRowid;
  // requireAuth needs a live session row, not just a signed token.
  return { id, token: jwt.sign({ id, email, tv: 0, sid: createSession(id) }, process.env.JWT_SECRET) };
}

const alice = makeUser('alice@example.com');
const aliceList = db.prepare('INSERT INTO lists (user_id, name, color, sort_order) VALUES (?, ?, ?, ?)')
  .run(alice.id, 'Tasks', 'indigo', 0).lastInsertRowid;

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

const DAY = '2026-08-19';
const RANGE = 'from=2026-08-17&to=2026-08-23';

let seq = 0;
async function completedTodo(title) {
  const id = db.prepare(
    'INSERT INTO todos (user_id, list_id, title, day_assigned, planner_order) VALUES (?, ?, ?, ?, ?)'
  ).run(alice.id, aliceList, title, DAY, seq++).lastInsertRowid;
  await call(alice, 'PATCH', `/api/todos/${id}`, { completed: true });
  return id;
}

const row = (id) => db.prepare('SELECT completed, archived, completed_at FROM todos WHERE id = ? AND user_id = ?').get(id, alice.id);
const titlesFrom = async (url) => (await call(alice, 'GET', url)).body.todos.map(t => t.title);

test.describe('PATCH /api/todos/:id with completed: true', () => {
  test('archives the row and stamps completed_at', async () => {
    const id = await completedTodo('Ticked off');
    const after = row(id);
    assert.equal(after.completed, 1);
    assert.equal(after.archived, 1);
    assert.equal(typeof after.completed_at, 'string');
  });
});

test.describe('PATCH /api/todos/:id with completed: false', () => {
  test('un-archives the row so it is visible again', async () => {
    const id = await completedTodo('Back to the list');
    await call(alice, 'PATCH', `/api/todos/${id}`, { completed: false });
    assert.equal(row(id).archived, 0);
  });

  test('clears completed_at, which no longer describes anything', async () => {
    const id = await completedTodo('No longer done');
    await call(alice, 'PATCH', `/api/todos/${id}`, { completed: false });
    assert.equal(row(id).completed_at, null);
  });

  test('clears completed itself', async () => {
    const id = await completedTodo('Un-ticked');
    await call(alice, 'PATCH', `/api/todos/${id}`, { completed: false });
    assert.equal(row(id).completed, 0);
  });

  test('the returned todo matches the stored row', async () => {
    const id = await completedTodo('Echoed back');
    const { body } = await call(alice, 'PATCH', `/api/todos/${id}`, { completed: false });
    assert.deepEqual(
      { completed: body.todo.completed, archived: body.todo.archived, completed_at: body.todo.completed_at },
      { completed: 0, archived: 0, completed_at: null }
    );
  });

  test('the row reappears in the active list', async () => {
    const id = await completedTodo('Active again');
    await call(alice, 'PATCH', `/api/todos/${id}`, { completed: false });
    assert.equal((await titlesFrom('/api/todos')).includes('Active again'), true);
  });

  test('the row leaves the archive view', async () => {
    const id = await completedTodo('Left the archive');
    await call(alice, 'PATCH', `/api/todos/${id}`, { completed: false });
    assert.equal((await titlesFrom('/api/todos/archived')).includes('Left the archive'), false);
  });

  // The archive view and the "completed today" query must not disagree about the
  // same row: one reads archived, the other reads completed/completed_at.
  test('the row leaves the completed-work range too', async () => {
    const id = await completedTodo('Not done after all');
    await call(alice, 'PATCH', `/api/todos/${id}`, { completed: false });
    assert.equal((await titlesFrom(`/api/todos/completed?${RANGE}`)).includes('Not done after all'), false);
  });

  test('is idempotent: patching completed false twice changes nothing further', async () => {
    const id = await completedTodo('Twice');
    await call(alice, 'PATCH', `/api/todos/${id}`, { completed: false });
    const once = row(id);
    await call(alice, 'PATCH', `/api/todos/${id}`, { completed: false });
    assert.deepEqual(row(id), once);
  });

  test('an explicit archived: true in the same patch still wins', async () => {
    const id = await completedTodo('Kept in the archive');
    await call(alice, 'PATCH', `/api/todos/${id}`, { completed: false, archived: true });
    assert.deepEqual(row(id), { completed: 0, archived: 1, completed_at: null });
  });
});

test.describe('PATCH /api/todos/:id with archived: false', () => {
  test('un-archiving a completed row clears completed and completed_at', async () => {
    const id = await completedTodo('Pulled back out');
    await call(alice, 'PATCH', `/api/todos/${id}`, { archived: false });
    assert.deepEqual(row(id), { completed: 0, archived: 0, completed_at: null });
  });
});
