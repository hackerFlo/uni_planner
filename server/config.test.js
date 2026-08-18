const test = require('node:test');
const assert = require('node:assert/strict');

const {
  SESSION_COOKIE_MAX_AGE_MS,
  parseTrustProxyHops,
  parseCookieSecureOverride,
  parseCorsOrigin,
  sessionCookieOptions,
  clearSessionCookieOptions,
} = require('./config');

const secureReq = { secure: true };
const insecureReq = { secure: false };

test.describe('sessionCookieOptions', () => {
  test('marks the cookie Secure when the request arrived over HTTPS', () => {
    assert.equal(sessionCookieOptions(secureReq, { override: null }).secure, true);
  });

  test('leaves the cookie non-Secure when the request arrived over HTTP', () => {
    assert.equal(sessionCookieOptions(insecureReq, { override: null }).secure, false);
  });

  test('override true forces Secure on an insecure request', () => {
    assert.equal(sessionCookieOptions(insecureReq, { override: true }).secure, true);
  });

  test('override false forces non-Secure on a secure request', () => {
    assert.equal(sessionCookieOptions(secureReq, { override: false }).secure, false);
  });

  test('treats a request with no secure property as insecure', () => {
    assert.equal(sessionCookieOptions({}, { override: null }).secure, false);
  });

  for (const [name, req] of [['secure', secureReq], ['insecure', insecureReq]]) {
    test(`keeps httpOnly, sameSite and maxAge identical on a ${name} request`, () => {
      const { httpOnly, sameSite, maxAge } = sessionCookieOptions(req, { override: null });
      assert.deepEqual({ httpOnly, sameSite, maxAge }, {
        httpOnly: true,
        sameSite: 'lax',
        maxAge: SESSION_COOKIE_MAX_AGE_MS,
      });
    });
  }
});

test.describe('clearSessionCookieOptions', () => {
  // A clearCookie whose attributes disagree with the set silently fails to
  // match, leaving the user logged in after logout.
  test('matches the set options except for maxAge', () => {
    const set = sessionCookieOptions(secureReq, { override: null });
    const clear = clearSessionCookieOptions(secureReq, { override: null });
    const { maxAge, ...setWithoutMaxAge } = set;
    assert.deepEqual(clear, setWithoutMaxAge);
  });

  test('drops maxAge', () => {
    assert.equal('maxAge' in clearSessionCookieOptions(secureReq, { override: null }), false);
  });
});

test.describe('parseTrustProxyHops', () => {
  test('defaults to a single proxy hop when unset', () => {
    assert.equal(parseTrustProxyHops(undefined), 1);
  });

  test('defaults to a single proxy hop when passed through as empty', () => {
    assert.equal(parseTrustProxyHops(''), 1);
  });

  test('parses the Cloudflare Tunnel value', () => {
    assert.equal(parseTrustProxyHops('2'), 2);
  });

  for (const bad of ['-1', '1.5', 'two']) {
    test(`rejects ${JSON.stringify(bad)}`, () => {
      assert.throws(() => parseTrustProxyHops(bad), /non-negative integer/);
    });
  }
});

test.describe('parseCookieSecureOverride', () => {
  test('returns null when unset so the scheme decides', () => {
    assert.equal(parseCookieSecureOverride(undefined), null);
  });

  test('parses "true"', () => {
    assert.equal(parseCookieSecureOverride('true'), true);
  });

  test('parses "false"', () => {
    assert.equal(parseCookieSecureOverride('false'), false);
  });

  test('rejects a value that is neither', () => {
    assert.throws(() => parseCookieSecureOverride('yes'), /"true" or "false"/);
  });
});

test.describe('parseCorsOrigin', () => {
  test('returns null when unset so the cors middleware is never mounted', () => {
    assert.equal(parseCorsOrigin(undefined), null);
  });

  for (const blank of ['', '   ']) {
    test(`treats ${JSON.stringify(blank)} as unset`, () => {
      assert.equal(parseCorsOrigin(blank), null);
    });
  }

  test('passes a bare origin through unchanged', () => {
    assert.equal(parseCorsOrigin('https://planner.example.com'), 'https://planner.example.com');
  });

  test('strips a trailing slash so it matches the browser Origin header exactly', () => {
    assert.equal(parseCorsOrigin('https://planner.example.com/'), 'https://planner.example.com');
  });

  test('keeps a non-default port', () => {
    assert.equal(parseCorsOrigin('http://localhost:5173'), 'http://localhost:5173');
  });

  test('rejects a non-http scheme', () => {
    assert.throws(() => parseCorsOrigin('ftp://planner.example.com'), /http or https/);
  });

  test('rejects a bare hostname with no scheme', () => {
    assert.throws(() => parseCorsOrigin('planner.example.com'), /absolute URL/);
  });

  test('rejects an origin carrying a path', () => {
    assert.throws(() => parseCorsOrigin('https://planner.example.com/app'), /bare origin/);
  });
});
