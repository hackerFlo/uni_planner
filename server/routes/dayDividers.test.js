const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Must be set before db.js is required -- it opens the file at module load.
process.env.DATABASE_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'uni-planner-day-dividers-')), 'planner.db'
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
const dayDividerRoutes = require('./dayDividers');

function makeUser(email) {
  const id = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(email, 'x').lastInsertRowid;
  // requireAuth needs a live session row, not just a signed token.
  return { id, token: jwt.sign({ id, email, tv: 0, sid: createSession(id) }, process.env.JWT_SECRET) };
}

const alice = makeUser('alice@example.com');
const bob = makeUser('bob@example.com');

// Kept equal to MAX_DIVIDERS_PER_DAY in routes/dayDividers.js.
const MAX_DIVIDERS_PER_DAY = 20;

// Both accounts own a divider on this date, so a query that forgets user_id
// finds the WRONG row rather than no row -- which is the only way an AR-2 test
// can fail loudly instead of passing by accident.
const SHARED_DATE = '2026-09-14';
const MOVE_FROM_DATE = '2026-09-15';
const MOVE_TO_DATE = '2026-09-16';
const REORDER_DATE = '2026-09-17';
const CAP_DATE = '2026-09-18';
const DELETE_DATE = '2026-09-19';

const seedDivider = (user, date, order) => db.prepare(
  'INSERT INTO day_dividers (user_id, date, planner_order) VALUES (?, ?, ?)'
).run(user.id, date, order).lastInsertRowid;

const aliceShared = seedDivider(alice, SHARED_DATE, 0);
const bobShared = seedDivider(bob, SHARED_DATE, 3);

const app = express();
app.use(jsonBodyParser());
app.use(cookieParser());
app.use('/api/day-dividers', dayDividerRoutes);
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => server.close());

async function call(user, method, url, body) {
  const res = await fetch(`${base}/api/day-dividers${url}`, {
    method,
    headers: {
      ...(user ? { Cookie: `token=${user.token}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, body: await res.json() };
}

const storedDivider = (id) => db.prepare(
  'SELECT user_id, date, planner_order FROM day_dividers WHERE id = ?'
).get(id);

const countOn = (user, date) => db.prepare(
  'SELECT COUNT(*) AS n FROM day_dividers WHERE user_id = ? AND date = ?'
).get(user.id, date).n;

test.describe('POST /api/day-dividers', () => {
  test('returns the stored row, id and all, so the client need not refetch', async () => {
    const { status, body } = await call(alice, 'POST', '/', { date: MOVE_FROM_DATE, planner_order: 2 });
    assert.deepEqual(
      { status, divider: body.divider },
      { status: 201, divider: { id: body.divider.id, date: MOVE_FROM_DATE, planner_order: 2 } },
    );
  });

  test('a created divider comes back from the list endpoint', async () => {
    const { body } = await call(alice, 'GET', '/');
    const row = body.dividers.find(d => d.date === MOVE_FROM_DATE);
    assert.deepEqual(row, { id: row.id, date: MOVE_FROM_DATE, planner_order: 2 });
  });

  test('defaults the slot to 0 when the body omits planner_order', async () => {
    const { body } = await call(alice, 'POST', '/', { date: '2026-09-20' });
    assert.equal(body.divider.planner_order, 0);
  });

  test('rejects a body with no date, since a divider must live on a day', async () => {
    assert.equal((await call(alice, 'POST', '/', { planner_order: 0 })).status, 400);
  });

  test('rejects a date the calendar does not have', async () => {
    assert.equal((await call(alice, 'POST', '/', { date: '2026-02-30' })).status, 400);
  });

  test('rejects a date that is not YYYY-MM-DD', async () => {
    assert.equal((await call(alice, 'POST', '/', { date: '14-09-2026' })).status, 400);
  });

  test('rejects a negative planner_order', async () => {
    assert.equal((await call(alice, 'POST', '/', { date: '2026-09-21', planner_order: -1 })).status, 400);
  });

  test('rejects a planner_order that is not an integer', async () => {
    assert.equal((await call(alice, 'POST', '/', { date: '2026-09-21', planner_order: 'first' })).status, 400);
  });

  test('and neither rejected write landed', () => {
    assert.equal(countOn(alice, '2026-09-21'), 0);
  });

  test('requires a session', async () => {
    assert.equal((await call(null, 'POST', '/', { date: SHARED_DATE })).status, 401);
  });
});

test.describe('the per-day divider cap', () => {
  test('accepts dividers right up to the limit', async () => {
    for (let slot = 0; slot < MAX_DIVIDERS_PER_DAY; slot++) {
      const { status } = await call(alice, 'POST', '/', { date: CAP_DATE, planner_order: slot });
      assert.equal(status, 201);
    }
    assert.equal(countOn(alice, CAP_DATE), MAX_DIVIDERS_PER_DAY);
  });

  test('refuses the one past the limit', async () => {
    const { status } = await call(alice, 'POST', '/', { date: CAP_DATE, planner_order: MAX_DIVIDERS_PER_DAY });
    assert.equal(status, 400);
  });

  test('and that refusal did not insert a row', () => {
    assert.equal(countOn(alice, CAP_DATE), MAX_DIVIDERS_PER_DAY);
  });

  // The count is per day, not per account: a full day must not block the rest
  // of the week.
  test('leaves a different day free to take a divider', async () => {
    const { status } = await call(alice, 'POST', '/', { date: '2026-09-22', planner_order: 0 });
    assert.equal(status, 201);
  });
});

test.describe('PATCH /api/day-dividers/:id', () => {
  test('moves a divider to another day', async () => {
    const id = seedDivider(alice, MOVE_FROM_DATE, 1);
    const { status, body } = await call(alice, 'PATCH', `/${id}`, { date: MOVE_TO_DATE });
    assert.deepEqual(
      { status, divider: body.divider, stored: storedDivider(id).date },
      { status: 200, divider: { id, date: MOVE_TO_DATE, planner_order: 1 }, stored: MOVE_TO_DATE },
    );
  });

  test('rejects a move to a date the calendar does not have', async () => {
    const id = seedDivider(alice, MOVE_FROM_DATE, 4);
    const { status } = await call(alice, 'PATCH', `/${id}`, { date: '2026-13-01' });
    assert.deepEqual({ status, stored: storedDivider(id).date }, { status: 400, stored: MOVE_FROM_DATE });
  });

  test('rejects an id that is not a number', async () => {
    assert.equal((await call(alice, 'PATCH', '/latest', { date: MOVE_TO_DATE })).status, 400);
  });

  test('404s on an id that belongs to nobody', async () => {
    const unusedId = db.prepare('SELECT MAX(id) AS m FROM day_dividers').get().m + 1000;
    assert.equal((await call(alice, 'PATCH', `/${unusedId}`, { date: MOVE_TO_DATE })).status, 404);
  });

  test('requires a session', async () => {
    assert.equal((await call(null, 'PATCH', `/${aliceShared}`, { date: MOVE_TO_DATE })).status, 401);
  });
});

test.describe('PATCH /api/day-dividers/reorder', () => {
  test('persists every slot in the batch in one call', async () => {
    const first = seedDivider(alice, REORDER_DATE, 0);
    const second = seedDivider(alice, REORDER_DATE, 1);
    const { status, body } = await call(alice, 'PATCH', '/reorder', {
      items: [{ id: first, planner_order: 5 }, { id: second, planner_order: 4 }],
    });
    assert.deepEqual(
      { status, ok: body.ok, first: storedDivider(first).planner_order, second: storedDivider(second).planner_order },
      { status: 200, ok: true, first: 5, second: 4 },
    );
  });

  // "reorder" must be matched as a literal before PATCH /:id gets a chance to
  // read it as an id -- otherwise the batch silently never runs.
  test('is not swallowed by the :id route', async () => {
    const { body } = await call(alice, 'PATCH', '/reorder', { items: [] });
    assert.equal(body.ok, true);
  });

  test('skips an entry with a non-numeric id and applies the rest', async () => {
    const id = seedDivider(alice, REORDER_DATE, 2);
    await call(alice, 'PATCH', '/reorder', {
      items: [{ id: 'not-an-id', planner_order: 9 }, { id, planner_order: 7 }],
    });
    assert.equal(storedDivider(id).planner_order, 7);
  });

  test('rejects a body whose items is not an array', async () => {
    assert.equal((await call(alice, 'PATCH', '/reorder', { items: 'nope' })).status, 400);
  });

  test('requires a session', async () => {
    assert.equal((await call(null, 'PATCH', '/reorder', { items: [] })).status, 401);
  });
});

test.describe('DELETE /api/day-dividers/:id', () => {
  test('removes the row', async () => {
    const id = seedDivider(alice, DELETE_DATE, 0);
    const { status, body } = await call(alice, 'DELETE', `/${id}`);
    assert.deepEqual({ status, ok: body.ok, stored: storedDivider(id) }, { status: 200, ok: true, stored: undefined });
  });

  test('404s when the same id is deleted twice', async () => {
    const id = seedDivider(alice, DELETE_DATE, 1);
    await call(alice, 'DELETE', `/${id}`);
    assert.equal((await call(alice, 'DELETE', `/${id}`)).status, 404);
  });

  test('requires a session', async () => {
    assert.equal((await call(null, 'DELETE', `/${aliceShared}`)).status, 401);
  });
});

// AR-2. Both accounts hold a divider on SHARED_DATE, so an unscoped statement
// reaches the other person's row instead of finding nothing.
test.describe('ownership (AR-2)', () => {
  test('lists only the requesting account\'s dividers', async () => {
    const { body } = await call(bob, 'GET', '/');
    assert.deepEqual(body.dividers, [{ id: bobShared, date: SHARED_DATE, planner_order: 3 }]);
  });

  test('a divider on a shared day is not visible to the other account', async () => {
    const { body } = await call(alice, 'GET', '/');
    assert.equal(body.dividers.some(d => d.id === bobShared), false);
  });

  test('refuses to move another account\'s divider', async () => {
    assert.equal((await call(alice, 'PATCH', `/${bobShared}`, { date: MOVE_TO_DATE })).status, 404);
  });

  test('and that divider still sits on its own day', () => {
    assert.deepEqual(storedDivider(bobShared), { user_id: bob.id, date: SHARED_DATE, planner_order: 3 });
  });

  test('refuses to reorder another account\'s divider', async () => {
    await call(alice, 'PATCH', '/reorder', { items: [{ id: bobShared, planner_order: 99 }] });
    assert.equal(storedDivider(bobShared).planner_order, 3);
  });

  test('refuses to delete another account\'s divider', async () => {
    assert.equal((await call(alice, 'DELETE', `/${bobShared}`)).status, 404);
  });

  test('and that divider is still there', () => {
    assert.equal(storedDivider(bobShared).user_id, bob.id);
  });
});
