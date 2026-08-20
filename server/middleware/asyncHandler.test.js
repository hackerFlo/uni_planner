const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { asyncHandler } = require('./asyncHandler');

// Proves the defect the wrapper exists for: without it the rejection never
// reaches the error middleware and the response is never sent.
function appWith(handler) {
  const app = express();
  app.get('/boom', handler);
  app.use((err, _req, res, _next) => res.status(500).json({ error: err.message }));
  return app;
}

async function callBoom(app, timeoutMs) {
  const server = app.listen(0);
  const port = server.address().port;
  try {
    return await fetch(`http://127.0.0.1:${port}/boom`, { signal: AbortSignal.timeout(timeoutMs) });
  } finally {
    server.close();
  }
}

test.describe('asyncHandler', () => {
  test('routes a rejected async handler to the error middleware', async () => {
    const app = appWith(asyncHandler(async () => { throw new Error('kaboom'); }));
    const res = await callBoom(app, 2000);
    assert.deepEqual(
      { status: res.status, body: await res.json() },
      { status: 500, body: { error: 'kaboom' } },
    );
  });

  // The defect being fixed, asserted at the unit level. Mounting a bare async
  // handler in Express and letting it reject does reproduce it -- the request
  // stalls to server.timeout and nothing reaches the error middleware -- but
  // the escaping rejection is itself an unhandledRejection, which node:test
  // counts as a failure of the whole run. So the contract is pinned directly:
  // the wrapper's job is to hand the rejection to `next`.
  test('hands the rejection to next rather than letting it escape', async () => {
    const boom = new Error('kaboom');
    let passed;
    await asyncHandler(async () => { throw boom; })({}, {}, (e) => { passed = e; });
    assert.equal(passed, boom);
  });

  test('leaves a successful handler untouched', async () => {
    const app = appWith(asyncHandler(async (_req, res) => res.status(200).json({ ok: true })));
    const res = await callBoom(app, 2000);
    assert.deepEqual({ status: res.status, body: await res.json() }, { status: 200, body: { ok: true } });
  });

  test('forwards a synchronous throw as well', async () => {
    const app = appWith(asyncHandler(() => { throw new Error('sync-boom'); }));
    const res = await callBoom(app, 2000);
    assert.equal((await res.json()).error, 'sync-boom');
  });
});
