const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const { jsonBodyParser, RESTORE_PATH } = require('./bodyParser');

// The real 5 MB parser the backup router mounts on its own route.
const backupParser = express.json({ limit: '5mb' });

const app = express();
app.use(jsonBodyParser());
app.post('/api/todos', (req, res) => res.json({ got: Array.isArray(req.body.items) ? req.body.items.length : 0 }));
app.post(RESTORE_PATH, backupParser, (req, res) => res.json({ got: req.body.todos.length }));
app.use((err, _req, res, _next) => res.status(err.status || 500).json({ error: err.type || 'error' }));

const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => server.close());

// ~40 kB: comfortably over the 10 kB app-wide limit, and a realistic size for a
// planner with a few hundred todos.
const bigTodos = Array.from({ length: 400 }, (_, i) => ({
  title: `Task number ${i} with a description long enough to matter`,
  description: 'x'.repeat(50),
}));

const post = (path, payload) =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

test.describe('jsonBodyParser', () => {
  test('accepts a small body on an ordinary route', async () => {
    const res = await post('/api/todos', { items: [1, 2, 3] });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).got, 3);
  });

  test('still enforces the 10 kB limit on an ordinary route', async () => {
    const res = await post('/api/todos', { items: bigTodos });
    assert.equal(res.status, 413);
  });

  // The regression this whole module exists for. Before the fix the app-level
  // parser reached this body first, rejected it at 10 kB, and the route's own
  // 5 MB parser never ran -- so no backup of a usable size could be restored.
  test('lets a backup larger than 10 kB through to the restore route', async () => {
    const body = JSON.stringify({ todos: bigTodos });
    assert.ok(Buffer.byteLength(body) > 10 * 1024, 'fixture must exceed the app-wide limit');

    const res = await post(RESTORE_PATH, { todos: bigTodos });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).got, bigTodos.length);
  });

  test('leaves the restore body unparsed, so the route parser is the one that reads it', async () => {
    // If the app-level parser had consumed it, req._body would be set and the
    // 5 MB parser would no-op -- exactly the failure mode being guarded.
    const res = await post(RESTORE_PATH, { todos: [{ title: 'one' }] });
    assert.equal((await res.json()).got, 1);
  });
});
