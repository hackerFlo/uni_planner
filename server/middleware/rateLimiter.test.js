const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

// No LOG_LEVEL override here: the point of one test below is that disabling the
// limiters is announced, and a level of `error` would swallow that warning.

const MODULE = require.resolve('./rateLimiter');

function loadFresh({ nodeEnv, disable }) {
  if (nodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = nodeEnv;
  if (disable === undefined) delete process.env.DISABLE_RATE_LIMIT;
  else process.env.DISABLE_RATE_LIMIT = disable;
  delete require.cache[MODULE];
  return require(MODULE);
}

function captureStderr(fn) {
  const original = process.stderr.write;
  const lines = [];
  process.stderr.write = (chunk) => { lines.push(String(chunk)); return true; };
  try { fn(); } finally { process.stderr.write = original; }
  return lines.join('');
}

test.after(() => {
  delete require.cache[MODULE];
  delete process.env.DISABLE_RATE_LIMIT;
});

test.describe('rate limiter gating', () => {
  // The regression: `NODE_ENV !== 'production'` meant an unset NODE_ENV turned
  // every limiter off, so the control vanished exactly where it was needed.
  test('stays enabled when NODE_ENV is unset', () => {
    assert.equal(loadFresh({}).rateLimitDisabled, false);
  });

  test('stays enabled when NODE_ENV is something other than production', () => {
    assert.equal(loadFresh({ nodeEnv: 'staging' }).rateLimitDisabled, false);
  });

  test('is disabled only by an explicit DISABLE_RATE_LIMIT=true', () => {
    captureStderr(() => {
      assert.equal(loadFresh({ disable: 'true' }).rateLimitDisabled, true);
    });
  });

  test('treats any other DISABLE_RATE_LIMIT value as enabled', () => {
    assert.equal(loadFresh({ disable: '1' }).rateLimitDisabled, false);
  });

  test('announces the disabled state instead of failing open silently', () => {
    const output = captureStderr(() => loadFresh({ disable: 'true' }));
    assert.match(output, /rate limiting disabled/);
  });

  test('says nothing when the limiters are on', () => {
    const output = captureStderr(() => loadFresh({}));
    assert.doesNotMatch(output, /rate limiting disabled/);
  });
});

test.describe('authLimiter', () => {
  const AUTH_MAX = 20;

  async function hammer(limiter, times) {
    const app = express();
    app.post('/x', limiter, (_req, res) => res.json({ ok: true }));
    const server = app.listen(0);
    const url = `http://127.0.0.1:${server.address().port}/x`;
    const statuses = [];
    for (let i = 0; i < times; i++) {
      statuses.push((await fetch(url, { method: 'POST' })).status);
    }
    server.close();
    return statuses;
  }

  test('429s past its budget when nothing disables it', async () => {
    const { authLimiter } = loadFresh({});
    const statuses = await hammer(authLimiter, AUTH_MAX + 1);
    assert.equal(statuses.at(-1), 429);
  });

  test('lets everything through when explicitly disabled', async () => {
    let limiter;
    captureStderr(() => { limiter = loadFresh({ disable: 'true' }).authLimiter; });
    const statuses = await hammer(limiter, AUTH_MAX + 1);
    assert.deepEqual([...new Set(statuses)], [200]);
  });
});
