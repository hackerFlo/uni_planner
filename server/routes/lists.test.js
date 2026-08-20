const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Must be set before db.js is required -- it opens the file at module load.
process.env.DATABASE_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'uni-planner-lists-')), 'planner.db'
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
const listRoutes = require('./lists');

function makeUser(email) {
  const id = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(email, 'x').lastInsertRowid;
  // requireAuth needs a live session row, not just a signed token.
  return { id, token: jwt.sign({ id, email, tv: 0, sid: createSession(id) }, process.env.JWT_SECRET) };
}

const alice = makeUser('alice@example.com');
const bob = makeUser('bob@example.com');

const seedList = (user, name, color, order) => db.prepare(
  'INSERT INTO lists (user_id, name, color, sort_order) VALUES (?, ?, ?, ?)'
).run(user.id, name, color, order).lastInsertRowid;

const aliceUni = seedList(alice, 'University', 'indigo', 0);
const alicePrivate = seedList(alice, 'Private', 'emerald', 1);
const bobOnly = seedList(bob, 'Bob only', 'rose', 0);

const app = express();
app.use(jsonBodyParser());
app.use(cookieParser());
app.use('/api/lists', listRoutes);
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => server.close());

async function call(user, method, url, body) {
  const res = await fetch(`${base}/api/lists${url}`, {
    method,
    headers: {
      ...(user ? { Cookie: `token=${user.token}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, body: await res.json() };
}

const namesOf = (user) => db.prepare('SELECT name FROM lists WHERE user_id = ? ORDER BY sort_order ASC')
  .all(user.id).map(l => l.name);

const MAX_NAME_LENGTH = 40;

test.describe('GET /api/lists', () => {
  test('returns the account\'s own lists in sort order', async () => {
    const { body } = await call(alice, 'GET', '/');
    assert.deepEqual(body.lists.map(l => l.name), ['University', 'Private']);
  });

  // AR-2: a list read that forgets the owner is the cheapest IDOR there is.
  test('never returns another account\'s lists', async () => {
    const { body } = await call(bob, 'GET', '/');
    assert.deepEqual(body.lists.map(l => l.name), ['Bob only']);
  });

  test('requires a session', async () => {
    assert.equal((await call(null, 'GET', '/')).status, 401);
  });
});

test.describe('POST /api/lists', () => {
  test('appends the new list after the existing ones', async () => {
    const { status, body } = await call(alice, 'POST', '/', { name: 'Reading', color: 'sky' });
    assert.deepEqual({ status, order: body.list.sort_order }, { status: 201, order: 2 });
  });

  // teal was in the client palette and in this router, but not in backup.js;
  // pinning it here keeps the three copies from drifting again.
  test('accepts teal, which the client palette offers', async () => {
    const { status, body } = await call(alice, 'POST', '/', { name: 'Teal things', color: 'teal' });
    assert.deepEqual({ status, color: body.list.color }, { status: 201, color: 'teal' });
  });

  test('rejects a blank name', async () => {
    assert.equal((await call(alice, 'POST', '/', { name: '   ', color: 'sky' })).status, 400);
  });

  test('rejects a name past the length limit', async () => {
    const tooLong = 'x'.repeat(MAX_NAME_LENGTH + 1);
    assert.equal((await call(alice, 'POST', '/', { name: tooLong, color: 'sky' })).status, 400);
  });

  test('rejects a colour outside the palette', async () => {
    assert.equal((await call(alice, 'POST', '/', { name: 'Chartreuse', color: 'chartreuse' })).status, 400);
  });

  test('does not create anything for a rejected request', () => {
    assert.ok(!namesOf(alice).includes('Chartreuse'));
  });
});

test.describe('PATCH /api/lists/:id', () => {
  test('renames a list the caller owns', async () => {
    const { body } = await call(alice, 'PATCH', `/${alicePrivate}`, { name: 'Personal' });
    assert.equal(body.list.name, 'Personal');
  });

  // AR-2: 404 rather than 403, so an id belonging to someone else is
  // indistinguishable from one that does not exist.
  test('refuses to rename another account\'s list', async () => {
    assert.equal((await call(bob, 'PATCH', `/${aliceUni}`, { name: 'Mine now' })).status, 404);
  });

  test('leaves the other account\'s list untouched after that refusal', () => {
    assert.deepEqual(namesOf(alice).includes('Mine now'), false);
  });

  test('rejects a colour outside the palette', async () => {
    assert.equal((await call(alice, 'PATCH', `/${aliceUni}`, { color: 'chartreuse' })).status, 400);
  });

  test('rejects a request that changes nothing', async () => {
    assert.equal((await call(alice, 'PATCH', `/${aliceUni}`, {})).status, 400);
  });

  test('rejects a non-numeric id', async () => {
    assert.equal((await call(alice, 'PATCH', '/not-a-number', { name: 'Nope' })).status, 400);
  });
});

test.describe('PATCH /api/lists/reorder', () => {
  const idsOf = (user) => db.prepare('SELECT id FROM lists WHERE user_id = ? ORDER BY sort_order ASC')
    .all(user.id).map(l => l.id);

  test('writes the given order back', async () => {
    const reversed = idsOf(alice).reverse();
    await call(alice, 'PATCH', '/reorder', { order: reversed });
    assert.deepEqual(idsOf(alice), reversed);
  });

  test('refuses an order that leaves one of the account\'s lists out', async () => {
    const partial = idsOf(alice).slice(1);
    assert.equal((await call(alice, 'PATCH', '/reorder', { order: partial })).status, 400);
  });

  // AR-2: the id count matched, so only the ownership check catches this.
  test('refuses an order smuggling in another account\'s list', async () => {
    const spoofed = [...idsOf(alice).slice(1), bobOnly];
    assert.equal((await call(alice, 'PATCH', '/reorder', { order: spoofed })).status, 400);
  });

  test('refuses an empty order', async () => {
    assert.equal((await call(alice, 'PATCH', '/reorder', { order: [] })).status, 400);
  });
});

test.describe('DELETE /api/lists/:id', () => {
  // Seeded in a hook, not in the describe body: the body runs at collection
  // time, and three extra lists would land before the GET and POST tests above
  // ever ran.
  let emptyList, heldList, targetList;
  test.before(() => {
    emptyList = seedList(alice, 'Nothing in here', 'violet', 99);
    heldList = seedList(alice, 'Holds work', 'amber', 100);
    targetList = seedList(alice, 'Move them here', 'pink', 101);
    db.prepare('INSERT INTO todos (user_id, list_id, title) VALUES (?, ?, ?)')
      .run(alice.id, heldList, 'Write the essay');
  });

  test('refuses to delete another account\'s list', async () => {
    assert.equal((await call(bob, 'DELETE', `/${emptyList}`)).status, 404);
  });

  test('refuses to delete the only list an account has left', async () => {
    assert.equal((await call(bob, 'DELETE', `/${bobOnly}`)).status, 400);
  });

  test('refuses to delete a list that still holds todos', async () => {
    const { status, body } = await call(alice, 'DELETE', `/${heldList}`);
    assert.deepEqual({ status, todoCount: body.todoCount }, { status: 400, todoCount: 1 });
  });

  test('refuses a moveTo target belonging to another account', async () => {
    assert.equal((await call(alice, 'DELETE', `/${heldList}?moveTo=${bobOnly}`)).status, 400);
  });

  test('moves the todos when told where to put them', async () => {
    await call(alice, 'DELETE', `/${heldList}?moveTo=${targetList}`);
    const row = db.prepare('SELECT list_id FROM todos WHERE user_id = ? AND title = ?')
      .get(alice.id, 'Write the essay');
    assert.equal(row.list_id, targetList);
  });

  test('and then the list itself is gone', () => {
    assert.equal(db.prepare('SELECT id FROM lists WHERE id = ?').get(heldList), undefined);
  });

  test('deletes an empty list outright', async () => {
    await call(alice, 'DELETE', `/${emptyList}`);
    assert.equal(db.prepare('SELECT id FROM lists WHERE id = ?').get(emptyList), undefined);
  });
});
