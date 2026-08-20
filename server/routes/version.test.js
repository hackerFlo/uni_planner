const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Must be set before db.js is required -- it opens the file at module load.
process.env.DATABASE_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'uni-planner-version-')), 'planner.db'
);
process.env.JWT_SECRET = 'test-secret-long-enough-for-the-check';
process.env.LOG_LEVEL = 'error';
// The limiters are mounted inside this router, so unlike the other route tests
// they would really apply here: 20 checks an hour is fewer than this file makes.
process.env.DISABLE_RATE_LIMIT = 'true';
// 2.9 against a latest of 2.10 is the case a string comparison gets backwards.
process.env.APP_VERSION = '2.9';
process.env.APP_COMMIT = 'aaaaaaa';
delete process.env.GITHUB_REPO;
delete process.env.WATCHTOWER_TOKEN;

const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { createSession } = require('../sessions');

// config.js reads the environment once, at load. Requiring the router twice --
// around a cache clear -- is the only way to exercise both the configured and
// the unconfigured deployment in one process.
const unconfiguredRoutes = require('./version');
delete require.cache[require.resolve('../config')];
delete require.cache[require.resolve('./version')];
process.env.GITHUB_REPO = 'example-owner/uni-planner';
process.env.WATCHTOWER_URL = 'http://watchtower.test:8080';
process.env.WATCHTOWER_TOKEN = 'test-watchtower-token';
const versionRoutes = require('./version');

const RELEASE = { tag_name: 'v2.10', published_at: '2026-08-19T09:00:00Z' };
const LATEST = { version: '2.10', tag: 'v2.10', publishedAt: RELEASE.published_at };

const realFetch = globalThis.fetch;
const calls = { github: 0, watchtower: [] };
let githubResponder = async () => new Response(JSON.stringify(RELEASE), { status: 200 });
let watchtowerResponder = async () => new Response('', { status: 200 });

// Only the two outbound integrations are intercepted; the test's own requests
// to the local server still use the real fetch.
globalThis.fetch = async (input, init) => {
  const url = String(input);
  if (url.startsWith('https://api.github.com/')) {
    calls.github += 1;
    return githubResponder(url, init);
  }
  if (url.startsWith('http://watchtower.test:8080')) {
    calls.watchtower.push({ url, init });
    return watchtowerResponder(url, init);
  }
  return realFetch(input, init);
};
test.after(() => { globalThis.fetch = realFetch; });

function makeUser(email) {
  const id = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(email, 'x').lastInsertRowid;
  // requireAuth needs a live session row, not just a signed token.
  return { id, token: jwt.sign({ id, email, tv: 0, sid: createSession(id) }, process.env.JWT_SECRET) };
}
const alice = makeUser('alice@example.com');

const app = express();
app.use(cookieParser());
app.use('/api/version', versionRoutes);
app.use('/api/unconfigured', unconfiguredRoutes);
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => server.close());

const authed = { Cookie: `token=${alice.token}` };
const get = (p, headers = authed) => realFetch(`${base}${p}`, { headers });
const post = (p, headers = authed) => realFetch(`${base}${p}`, { method: 'POST', headers });

test.beforeEach(() => {
  versionRoutes.__setReleaseCache(null);
  calls.github = 0;
  calls.watchtower = [];
  githubResponder = async () => new Response(JSON.stringify(RELEASE), { status: 200 });
  watchtowerResponder = async () => new Response('', { status: 200 });
});

test.describe('GET /api/version', () => {
  test('rejects a request with no session', async () => {
    assert.equal((await get('/api/version', {})).status, 401);
  });

  test('reports the build that is actually running', async () => {
    const body = await (await get('/api/version')).json();
    assert.deepEqual(body.running, { version: '2.9', commit: 'aaaaaaa' });
  });

  test('returns the latest release, normalised out of the GitHub payload', async () => {
    const body = await (await get('/api/version')).json();
    assert.deepEqual(body.latest, LATEST);
  });

  test('treats 2.10 as newer than 2.9, which a string comparison does not', async () => {
    const body = await (await get('/api/version')).json();
    assert.equal(body.updateAvailable, true);
  });

  test('reports no update when the latest release is the running version', async () => {
    githubResponder = async () => new Response(JSON.stringify({ tag_name: 'v2.9' }), { status: 200 });
    const body = await (await get('/api/version')).json();
    assert.equal(body.updateAvailable, false);
  });

  test('reports no update when the latest release is older than the running build', async () => {
    githubResponder = async () => new Response(JSON.stringify({ tag_name: 'v2.8' }), { status: 200 });
    const body = await (await get('/api/version')).json();
    assert.equal(body.updateAvailable, false);
  });

  test('says nothing rather than something wrong about an untagged release scheme', async () => {
    githubResponder = async () => new Response(JSON.stringify({ tag_name: 'nightly' }), { status: 200 });
    const body = await (await get('/api/version')).json();
    assert.equal(body.updateAvailable, false);
  });

  // 60 unauthenticated GitHub requests an hour is the whole budget for the
  // deployment's egress IP, and this endpoint sits behind a button.
  test('spends only one GitHub request across repeated checks', async () => {
    await get('/api/version');
    await get('/api/version');
    await get('/api/version');
    assert.equal(calls.github, 1);
  });

  test('serves the last good result when a refresh fails, and marks it stale', async () => {
    versionRoutes.__setReleaseCache({ latest: LATEST, checkedAt: Date.now() - 20 * 60 * 1000 });
    githubResponder = async () => new Response('rate limited', { status: 403 });
    const body = await (await get('/api/version')).json();
    assert.deepEqual({ latest: body.latest, stale: body.stale }, { latest: LATEST, stale: true });
  });

  test('does not claim an update failed check succeeded', async () => {
    githubResponder = async () => { throw new Error('ECONNREFUSED'); };
    const body = await (await get('/api/version')).json();
    assert.deepEqual(
      { latest: body.latest, checkFailed: body.checkFailed, updateAvailable: body.updateAvailable },
      { latest: null, checkFailed: true, updateAvailable: false },
    );
  });

  test('rejects a release payload with no usable tag', async () => {
    githubResponder = async () => new Response(JSON.stringify({ tag_name: 42 }), { status: 200 });
    const body = await (await get('/api/version')).json();
    assert.equal(body.checkFailed, true);
  });

  test('reports itself unavailable when no repository is configured', async () => {
    const body = await (await get('/api/unconfigured')).json();
    assert.deepEqual(
      { available: body.available, latest: body.latest, canInstall: body.canInstall },
      { available: false, latest: null, canInstall: false },
    );
  });

  test('still reports the running build when unconfigured, so Settings has something to show', async () => {
    const body = await (await get('/api/unconfigured')).json();
    assert.deepEqual(body.running, { version: '2.9', commit: 'aaaaaaa' });
  });

  test('never reaches GitHub when unconfigured', async () => {
    await get('/api/unconfigured');
    assert.equal(calls.github, 0);
  });
});

test.describe('POST /api/version/update', () => {
  test('rejects a request with no session', async () => {
    assert.equal((await post('/api/version/update', {})).status, 401);
  });

  test('answers 202 once Watchtower has accepted', async () => {
    assert.equal((await post('/api/version/update')).status, 202);
  });

  test('authenticates to Watchtower with the configured token', async () => {
    await post('/api/version/update');
    assert.equal(calls.watchtower[0].init.headers.Authorization, 'Bearer test-watchtower-token');
  });

  // No parameters at all is what makes the endpoint safe to expose: it can only
  // trigger the update Watchtower is already configured to perform.
  test('sends no body to Watchtower', async () => {
    await post('/api/version/update');
    assert.equal(calls.watchtower[0].init.body, undefined);
  });

  test('calls the single documented Watchtower endpoint', async () => {
    await post('/api/version/update');
    assert.equal(calls.watchtower[0].url, 'http://watchtower.test:8080/v1/update');
  });

  // 502 is what nginx returns while this container restarts, which is the
  // success path; a refusal has to be distinguishable from it.
  test('answers 503, not 502, when Watchtower refuses', async () => {
    watchtowerResponder = async () => new Response('unauthorized', { status: 401 });
    assert.equal((await post('/api/version/update')).status, 503);
  });

  test('refuses with 503 when no Watchtower token is configured', async () => {
    assert.equal((await post('/api/unconfigured/update', {})).status, 401);
    assert.equal((await post('/api/unconfigured/update')).status, 503);
  });

  test('does not reach Watchtower when unconfigured', async () => {
    await post('/api/unconfigured/update');
    assert.equal(calls.watchtower.length, 0);
  });

  // Watchtower holds the connection open until the update is done and kills
  // this container along the way, so waiting for its reply would turn every
  // successful update into a timeout.
  test('answers 202 without waiting for Watchtower to finish', async () => {
    watchtowerResponder = () => new Promise(() => {});
    const started = Date.now();
    const res = await post('/api/version/update');
    assert.deepEqual(
      { status: res.status, waitedLessThanTheTimeout: Date.now() - started < 9000 },
      { status: 202, waitedLessThanTheTimeout: true },
    );
  });
});
