const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.DATABASE_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'uni-planner-quote-routes-')), 'planner.db'
);
process.env.JWT_SECRET = 'test-secret-long-enough-for-the-check';
process.env.LOG_LEVEL = 'error';
process.env.DISABLE_RATE_LIMIT = 'true';

const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const db = require('../db');
const quoteRoutes = require('./quotes');
const { SESSION_COOKIE_NAME } = require('../config');
const { createSession } = require('../sessions');
const { jsonBodyParser } = require('../middleware/bodyParser');

function makeUser(email) {
  const id = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(email, 'x').lastInsertRowid;
  const token = jwt.sign({ id, email, tv: 0, sid: createSession(id) }, process.env.JWT_SECRET);
  return { id, token };
}

const app = express();
app.use(cookieParser());
// The real parser, so the /import exemption is exercised rather than assumed.
app.use(jsonBodyParser());
app.use('/api/quotes', quoteRoutes);
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => server.close());

const call = (method, url, { token, body, headers = {} } = {}) => fetch(`${base}${url}`, {
  method,
  headers: {
    'Content-Type': 'application/json', ...headers,
    ...(token ? { Cookie: `${SESSION_COOKIE_NAME}=${token}` } : {}),
  },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

const DAY = '2026-08-20';

test.describe('GET /today', () => {
  test('returns a quote for a valid date', async () => {
    const user = makeUser('t1@example.com');
    const res = await call('GET', `/api/quotes/today?date=${DAY}`, { token: user.token });
    const { quote } = await res.json();
    assert.equal(res.status, 200);
    assert.ok(quote.text && quote.author);
  });

  test('rejects a missing date', async () => {
    const user = makeUser('t2@example.com');
    assert.equal((await call('GET', '/api/quotes/today', { token: user.token })).status, 400);
  });

  // The date now goes through the real calendar validator, not a regex.
  test('rejects an impossible date', async () => {
    const user = makeUser('t3@example.com');
    assert.equal((await call('GET', '/api/quotes/today?date=2026-02-30', { token: user.token })).status, 400);
  });

  test('requires authentication', async () => {
    assert.equal((await call('GET', `/api/quotes/today?date=${DAY}`)).status, 401);
  });

  test('is stable across calls', async () => {
    const user = makeUser('t4@example.com');
    const a = await (await call('GET', `/api/quotes/today?date=${DAY}`, { token: user.token })).json();
    const b = await (await call('GET', `/api/quotes/today?date=${DAY}`, { token: user.token })).json();
    assert.equal(a.quote.id, b.quote.id);
  });
});

test.describe('POST /:id/dislike', () => {
  test('returns a different quote in the same response', async () => {
    const user = makeUser('d1@example.com');
    const { quote } = await (await call('GET', `/api/quotes/today?date=${DAY}`, { token: user.token })).json();
    const res = await call('POST', `/api/quotes/${quote.id}/dislike?date=${DAY}`, { token: user.token });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.notEqual(body.quote.id, quote.id);
  });

  test('the disliked quote does not come back for that day', async () => {
    const user = makeUser('d2@example.com');
    const { quote } = await (await call('GET', `/api/quotes/today?date=${DAY}`, { token: user.token })).json();
    await call('POST', `/api/quotes/${quote.id}/dislike?date=${DAY}`, { token: user.token });
    const after = await (await call('GET', `/api/quotes/today?date=${DAY}`, { token: user.token })).json();
    assert.notEqual(after.quote.id, quote.id);
  });

  test('rejects a non-numeric id', async () => {
    const user = makeUser('d3@example.com');
    assert.equal((await call('POST', `/api/quotes/abc/dislike?date=${DAY}`, { token: user.token })).status, 400);
  });

  test('404s on a quote that does not exist', async () => {
    const user = makeUser('d4@example.com');
    assert.equal((await call('POST', `/api/quotes/999999/dislike?date=${DAY}`, { token: user.token })).status, 404);
  });

  // AR-2 across the HTTP boundary, not just the module.
  test("404s on another user's uploaded quote", async () => {
    const owner = makeUser('d5@example.com');
    const other = makeUser('d6@example.com');
    const id = db.prepare('INSERT INTO quotes (user_id, text, author) VALUES (?, ?, ?)')
      .run(owner.id, 'Strictly mine.', 'Owner').lastInsertRowid;
    assert.equal((await call('POST', `/api/quotes/${id}/dislike?date=${DAY}`, { token: other.token })).status, 404);
    assert.equal((await call('POST', `/api/quotes/${id}/dislike?date=${DAY}`, { token: owner.token })).status, 200);
  });
});

test.describe('POST /:id/restore', () => {
  test('undo puts the restored quote back on the day', async () => {
    const user = makeUser('r1@example.com');
    const { quote } = await (await call('GET', `/api/quotes/today?date=${DAY}`, { token: user.token })).json();
    await call('POST', `/api/quotes/${quote.id}/dislike?date=${DAY}`, { token: user.token });
    const restored = await (await call('POST', `/api/quotes/${quote.id}/restore?date=${DAY}`, { token: user.token })).json();
    assert.equal(restored.quote.id, quote.id);
  });
});

test.describe('POST /restore-all', () => {
  test('clears every dislike and reports the new stats', async () => {
    const user = makeUser('ra1@example.com');
    for (let i = 0; i < 3; i++) {
      const { quote } = await (await call('GET', `/api/quotes/today?date=2026-09-0${i + 1}`, { token: user.token })).json();
      await call('POST', `/api/quotes/${quote.id}/dislike?date=2026-09-0${i + 1}`, { token: user.token });
    }
    const res = await call('POST', '/api/quotes/restore-all', { token: user.token, body: {} });
    const body = await res.json();
    assert.equal(body.restored, 3);
    assert.equal(body.stats.disliked, 0);
  });

  // Route ordering: "restore-all" must not be read as an :id.
  test('is not swallowed by the /:id route', async () => {
    const user = makeUser('ra2@example.com');
    const res = await call('POST', '/api/quotes/restore-all', { token: user.token, body: {} });
    assert.equal(res.status, 200);
  });
});

test.describe('POST /import', () => {
  const header = 'ID,Quote,Author,Characters,Wikipedia,Source';

  test('imports new quotes', async () => {
    const user = makeUser('i1@example.com');
    const csv = `${header}\nQ1,A freshly imported thought.,Nobody,26,,`;
    const res = await call('POST', '/api/quotes/import', { token: user.token, body: { csv } });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.added, 1);
  });

  test('rejects an empty body', async () => {
    const user = makeUser('i2@example.com');
    assert.equal((await call('POST', '/api/quotes/import', { token: user.token, body: {} })).status, 400);
  });

  test('rejects a file with the wrong columns', async () => {
    const user = makeUser('i3@example.com');
    const res = await call('POST', '/api/quotes/import', { token: user.token, body: { csv: 'Foo,Bar\n1,2' } });
    assert.equal(res.status, 400);
  });

  // The real seed file, through the real route: this is what proves the
  // bodyParser exemption and the 1mb route parser actually work together.
  test('accepts the full seed CSV, well over the 10kb global limit', async () => {
    const user = makeUser('i4@example.com');
    const csv = fs.readFileSync(path.join(__dirname, '..', 'assets', 'quotes.csv'), 'utf8');
    assert.ok(csv.length > 10 * 1024, 'fixture is too small to prove the limit');
    const res = await call('POST', '/api/quotes/import', { token: user.token, body: { csv } });
    const body = await res.json();
    assert.equal(res.status, 200);
    // Every row is already a built-in, so all 191 are skipped, none added.
    assert.deepEqual({ added: body.added, skipped: body.skipped }, { added: 0, skipped: 191 });
  });
});

test.describe('GET /stats', () => {
  test('reports totals for this user only', async () => {
    const user = makeUser('s1@example.com');
    const { stats } = await (await call('GET', '/api/quotes/stats', { token: user.token })).json();
    assert.equal(stats.uploaded, 0);
    assert.ok(stats.total >= 191);
  });
});


test('quote mutations replay receipts, reject stale drafts and undo using the shared journal', async () => {
  const { randomUUID } = require('node:crypto');
  const { createOperations } = require('../services/operations');
  const operations = createOperations(db);
  const user = makeUser('versioned-quotes@example.com');
  const initial = await (await call('GET', `/api/quotes/today?date=${DAY}`, { token: user.token })).json();
  assert.ok(initial.version?.epoch);
  const headers = { 'X-Planner-Epoch': initial.version.epoch, 'X-Planner-Revision': String(initial.version.revision), 'Idempotency-Key': randomUUID() };
  const url = `/api/quotes/${initial.quote.id}/dislike?date=${DAY}`;
  const result = await (await call('POST', url, { token: user.token, headers, body: {} })).json();
  assert.equal(result.undoAvailable, true);
  assert.equal(result.resultVersion.revision, initial.version.revision + 1);
  const replay = await (await call('POST', url, { token: user.token, headers, body: {} })).json();
  assert.equal(replay.replayed, true);
  assert.equal(replay.operationId, result.operationId);
  assert.equal((await call('POST', url, { token: user.token, headers: { ...headers, 'Idempotency-Key': randomUUID() } })).status, 409);
  const context = { userId: user.id, actor: 'web' };
  operations.undo(context, result.operationId, { expectedVersion: result.resultVersion, idempotencyKey: randomUUID() });
  const restored = await (await call('GET', `/api/quotes/today?date=${DAY}`, { token: user.token })).json();
  assert.equal(restored.quote.id, initial.quote.id);
  assert.equal((await (await call('GET', '/api/quotes/stats', { token: user.token })).json()).version.revision, restored.version.revision);
});

test('quote writes require preconditions when agent writes are enabled and reject ownership fields', async () => {
  const user = makeUser('controlled-quotes@example.com');
  process.env.MCP_WRITES_ENABLED = 'true';
  try {
    assert.equal((await call('POST', '/api/quotes/restore-all', { token: user.token, body: {} })).status, 409);
  } finally { delete process.env.MCP_WRITES_ENABLED; }
  assert.equal((await call('POST', '/api/quotes/restore-all', { token: user.token, body: { user_id: user.id + 1 } })).status, 400);
});

test('CSV import uses bounded receipts and an unchanged retry does not import twice', async () => {
  const { randomUUID } = require('node:crypto');
  const user = makeUser('import-receipt@example.com');
  const { version } = await (await call('GET', '/api/quotes/stats', { token: user.token })).json();
  const headers = { 'X-Planner-Epoch': version.epoch, 'X-Planner-Revision': String(version.revision), 'Idempotency-Key': randomUUID() };
  const body = { csv: 'Quote,Author\nReceipt import,Author' };
  const first = await (await call('POST', '/api/quotes/import', { token: user.token, headers, body })).json();
  const retry = await (await call('POST', '/api/quotes/import', { token: user.token, headers, body })).json();
  assert.equal(first.added, 1);
  assert.equal(first.undoAvailable, false);
  assert.equal(retry.replayed, true);
  assert.equal(retry.added, 1);
  assert.equal(db.prepare('SELECT count(*) AS n FROM quotes WHERE user_id=?').get(user.id).n, 1);
  assert.deepEqual(retry.resultVersion, first.resultVersion);
});
