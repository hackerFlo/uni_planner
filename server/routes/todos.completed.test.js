const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.DATABASE_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'uni-planner-completed-')), 'planner.db'
);
process.env.JWT_SECRET = 'test-secret-long-enough-for-the-check';
process.env.LOG_LEVEL = 'error';
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
const bob = makeUser('bob@example.com');

const listFor = (u) => db.prepare('INSERT INTO lists (user_id, name, color, sort_order) VALUES (?, ?, ?, ?)')
  .run(u.id, 'Tasks', 'indigo', 0).lastInsertRowid;
const aliceList = listFor(alice);
const bobList = listFor(bob);

function addTodo(user, listId, { title, day, completed = 0, archived = 0 }) {
  return db.prepare(
    'INSERT INTO todos (user_id, list_id, title, day_assigned, completed, archived) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(user.id, listId, title, day, completed, archived).lastInsertRowid;
}

addTodo(alice, aliceList, { title: 'Done Monday',   day: '2026-08-17', completed: 1, archived: 1 });
addTodo(alice, aliceList, { title: 'Done Wednesday', day: '2026-08-19', completed: 1, archived: 1 });
addTodo(alice, aliceList, { title: 'Still open',    day: '2026-08-19' });
addTodo(alice, aliceList, { title: 'Done Friday',   day: '2026-08-21', completed: 1, archived: 1 });
addTodo(alice, aliceList, { title: 'Done long ago', day: '2026-06-01', completed: 1, archived: 1 });
addTodo(alice, aliceList, { title: 'Done, no day',  day: null,         completed: 1, archived: 1 });
addTodo(bob,   bobList,   { title: "Bob's work",    day: '2026-08-19', completed: 1, archived: 1 });

const app = express();
app.use(cookieParser());
app.use('/api/todos', todoRoutes);
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => server.close());

const completed = async (user, qs) => {
  const res = await fetch(`${base}/api/todos/completed?${qs}`, { headers: { Cookie: `token=${user.token}` } });
  return { status: res.status, body: await res.json() };
};

const WEEK = 'from=2026-08-17&to=2026-08-23';

test.describe('GET /api/todos/completed', () => {
  test('returns the completed work inside the range', async () => {
    const { body } = await completed(alice, WEEK);
    assert.deepEqual(body.todos.map(t => t.title), ['Done Monday', 'Done Wednesday', 'Done Friday']);
  });

  test('leaves open todos out -- the day column already shows those', async () => {
    const { body } = await completed(alice, WEEK);
    assert.ok(!body.todos.some(t => t.title === 'Still open'));
  });

  test('does not reach outside the range', async () => {
    const { body } = await completed(alice, WEEK);
    assert.ok(!body.todos.some(t => t.title === 'Done long ago'));
  });

  test('skips completed work with no day, which belongs to no column', async () => {
    const { body } = await completed(alice, WEEK);
    assert.ok(!body.todos.some(t => t.title === 'Done, no day'));
  });

  // AR-2: the most common IDOR mistake is a range query that forgets the owner.
  test('never returns another account\'s work', async () => {
    const { body } = await completed(alice, WEEK);
    assert.ok(!body.todos.some(t => t.title === "Bob's work"));
  });

  test('bob sees only his own', async () => {
    const { body } = await completed(bob, WEEK);
    assert.deepEqual(body.todos.map(t => t.title), ["Bob's work"]);
  });

  test('orders by the day the work happened on', async () => {
    const { body } = await completed(alice, WEEK);
    assert.deepEqual(body.todos.map(t => t.day_assigned), ['2026-08-17', '2026-08-19', '2026-08-21']);
  });

  test('rejects a missing range', async () => {
    assert.equal((await completed(alice, '')).status, 400);
  });

  test('rejects a malformed date', async () => {
    assert.equal((await completed(alice, 'from=17-08-2026&to=2026-08-23')).status, 400);
  });

  test('rejects a reversed range', async () => {
    assert.equal((await completed(alice, 'from=2026-08-23&to=2026-08-17')).status, 400);
  });

  test('refuses an unbounded range rather than returning the whole archive', async () => {
    assert.equal((await completed(alice, 'from=2020-01-01&to=2026-08-23')).status, 400);
  });

  test('requires a session', async () => {
    const res = await fetch(`${base}/api/todos/completed?${WEEK}`);
    assert.equal(res.status, 401);
  });
});
