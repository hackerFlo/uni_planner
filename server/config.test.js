const test = require('node:test');
const assert = require('node:assert/strict');

const {
  SESSION_COOKIE_MAX_AGE_MS,
  parseTrustProxyHops,
  parseCookieSecureOverride,
  parseCorsOrigin,
  parseGithubRepo,
  parseWatchtowerUrl,
  parseWatchtowerToken,
  WATCHTOWER_URL_DEFAULT,
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

test.describe('parseGithubRepo', () => {
  test('returns null when unset so the update check reports itself unavailable', () => {
    assert.equal(parseGithubRepo(undefined), null);
  });

  for (const blank of ['', '   ']) {
    test(`treats ${JSON.stringify(blank)} as unset`, () => {
      assert.equal(parseGithubRepo(blank), null);
    });
  }

  test('passes an owner/repo pair through', () => {
    assert.equal(parseGithubRepo('example-owner/uni-planner'), 'example-owner/uni-planner');
  });

  test('trims surrounding whitespace', () => {
    assert.equal(parseGithubRepo('  example-owner/uni-planner  '), 'example-owner/uni-planner');
  });

  test('accepts dots and underscores in the repository name', () => {
    assert.equal(parseGithubRepo('example-owner/uni_planner.js'), 'example-owner/uni_planner.js');
  });

  // The value is interpolated into an api.github.com path, so anything that
  // could steer that path to another resource has to be refused here (AR-1).
  for (const bad of ['uni-planner', 'owner/repo/extra', 'owner/..', '../owner/repo', 'owner /repo', 'owner/repo?a=b', 'owner/repo#x']) {
    test(`rejects ${JSON.stringify(bad)}`, () => {
      assert.throws(() => parseGithubRepo(bad), /owner\/repo/);
    });
  }
});

test.describe('parseWatchtowerUrl', () => {
  test('defaults to the compose-network service when unset', () => {
    assert.equal(parseWatchtowerUrl(undefined), WATCHTOWER_URL_DEFAULT);
  });

  test('defaults when passed through as empty', () => {
    assert.equal(parseWatchtowerUrl(''), WATCHTOWER_URL_DEFAULT);
  });

  test('keeps an explicit host and port', () => {
    assert.equal(parseWatchtowerUrl('http://updater:9000'), 'http://updater:9000');
  });

  test('strips a trailing slash so the /v1/update path joins cleanly', () => {
    assert.equal(parseWatchtowerUrl('http://updater:9000/'), 'http://updater:9000');
  });

  test('rejects a non-http scheme', () => {
    assert.throws(() => parseWatchtowerUrl('ftp://updater:9000'), /http or https/);
  });

  test('rejects a bare hostname with no scheme', () => {
    assert.throws(() => parseWatchtowerUrl('updater'), /absolute URL/);
  });

  // "updater:9000" parses as a URL whose protocol is "updater:", so only the
  // scheme check stands between it and a request to nowhere.
  test('rejects a host:port pair mistaken for a URL', () => {
    assert.throws(() => parseWatchtowerUrl('updater:9000'), /http or https/);
  });

  test('rejects a URL carrying a path', () => {
    assert.throws(() => parseWatchtowerUrl('http://updater:9000/v1'), /bare origin/);
  });
});

test.describe('parseWatchtowerToken', () => {
  test('returns null when unset so on-demand installs stay off', () => {
    assert.equal(parseWatchtowerToken(undefined), null);
  });

  test('treats whitespace as unset', () => {
    assert.equal(parseWatchtowerToken('   '), null);
  });

  test('trims the value, since a stray newline from a compose file breaks the header', () => {
    assert.equal(parseWatchtowerToken(' s3cret-value\n'), 's3cret-value');
  });

  test('rejects an implausibly long value', () => {
    assert.throws(() => parseWatchtowerToken('x'.repeat(513)), /at most 512/);
  });

  // AR-6: a rejected secret must not be quoted back into a message that is
  // about to be logged by the boot-time failure path.
  test('never repeats the value in the rejection message', () => {
    const token = 'y'.repeat(600);
    assert.throws(() => parseWatchtowerToken(token), (err) => !err.message.includes('yyy'));
  });
});
