const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const { createAccessVerifier } = require('./access');

const config = Object.freeze({ enabled: true, issuer: 'https://example-team.cloudflareaccess.com',
  mcpAudience: 'mcp-audience', webAudience: 'web-audience' });
const now = Math.floor(Date.now() / 1000);
let jose, first, second, jwk, verify;
const request = token => ({ headers: { 'cf-access-jwt-assertion': token },
  rawHeaders: ['Cf-Access-Jwt-Assertion', token] });
const denied = { name: 'AccessAuthError', code: 'AUTH_REQUIRED', status: 401, message: 'Authentication required' };

async function token(overrides = {}, header = {}, key = first.privateKey) {
  return new jose.SignJWT({ iss: config.issuer, aud: [config.mcpAudience], sub: 'synthetic-user',
    type: 'app', iat: now - 10, nbf: now - 10, exp: now + 300, ...overrides })
    .setProtectedHeader({ alg: 'RS256', kid: 'first', ...header }).sign(key);
}

before(async () => {
  jose = await import('jose');
  first = await jose.generateKeyPair('RS256');
  second = await jose.generateKeyPair('RS256');
  jwk = { ...await jose.exportJWK(first.publicKey), kid: 'first', alg: 'RS256', use: 'sig' };
  verify = createAccessVerifier(config, { keyResolver: jose.createLocalJWKSet({ keys: [jwk] }) });
});

describe('Access assertions', () => {
  it('returns only a fresh frozen verified identity and ignores unsigned hints', async () => {
    const req = request(await token({ email: 'signed@example.com' }));
    req.headers['cf-access-authenticated-user-email'] = 'unsigned@example.com';
    req.user_id = 99;
    const identity = await verify(req);
    assert.deepEqual(identity, { issuer: config.issuer, subject: 'synthetic-user' });
    assert.ok(Object.isFrozen(identity));
  });
  it('checks the chosen audience separately for browser enrollment', async () => {
    const req = request(await token({ aud: [config.webAudience] }));
    await assert.rejects(verify(req), denied);
    assert.equal((await verify(req, config.webAudience)).subject, 'synthetic-user');
    await assert.rejects(verify(req, 'request-selected-audience'), denied);
  });
  const badClaims = [
    ['wrong issuer', { iss: 'https://other.cloudflareaccess.com' }],
    ['issuer trailing slash', { iss: `${config.issuer}/` }], ['wrong audience', { aud: ['other'] }],
    ['missing audience', { aud: undefined }], ['missing issuer', { iss: undefined }],
    ['missing expiry', { exp: undefined }], ['expired', { exp: now - 60 }],
    ['future nbf', { nbf: now + 60 }], ['text nbf', { nbf: 'tomorrow' }],
    ['future iat', { iat: now + 60 }], ['missing iat', { iat: undefined }],
    ['negative iat', { iat: -1 }], ['expiry before issue', { iat: now, exp: now - 1 }],
    ['fractional expiry', { exp: now + 300.5 }], ['nbf after expiry', { nbf: now + 400 }],
    ['negative nbf', { nbf: -1 }], ['fractional nbf', { nbf: now - 0.5 }],
    ['missing subject', { sub: undefined }], ['empty subject', { sub: '' }],
    ['oversized subject', { sub: 's'.repeat(257) }], ['space subject', { sub: ' ' }],
    ['numeric subject', { sub: 123 }], ['missing type', { type: undefined }],
    ['organization token', { type: 'org' }], ['service token', { sub: '', common_name: 'service.access' }],
    ['service marker with subject', { common_name: 'service.access' }],
  ];
  for (const [label, claims] of badClaims) {
    it(`rejects ${label}`, async () => assert.rejects(verify(request(await token(claims))), denied));
  }
  it('accepts optional nbf absence with sensible required time claims', async () => {
    assert.equal((await verify(request(await token({ nbf: undefined })))).subject, 'synthetic-user');
  });
  it('rejects tampered signatures', async () => {
    const jwt = await token({}, {}, second.privateKey);
    await assert.rejects(verify(request(jwt)), denied);
  });
  it('rejects HS256 and unsigned tokens', async () => {
    const symmetric = await token({}, { alg: 'HS256' }, new Uint8Array(32));
    await assert.rejects(verify(request(symmetric)), denied);
    const unsigned = `${Buffer.from('{"alg":"none"}').toString('base64url')}.e30.`;
    await assert.rejects(verify(request(unsigned)), denied);
  });
  it('rejects missing, merged, array and oversized assertion headers', async () => {
    for (const value of [undefined, '', ['a', 'b'], 'a,b', 'a'.repeat(16385)]) {
      await assert.rejects(verify(request(value)), denied);
    }
  });
  it('rejects duplicate raw header names even when a proxy collapsed their values', async () => {
    const req = request(await token());
    req.rawHeaders.push('cf-access-jwt-assertion', req.headers['cf-access-jwt-assertion']);
    await assert.rejects(verify(req), denied);
  });
  it('never substitutes cookies or opaque OAuth bearer tokens for the assertion', async () => {
    await assert.rejects(verify({ headers: { authorization: 'Bearer opaque', cookie: 'token=web' } }), denied);
  });
  it('does not authenticate while disabled', async () => {
    const disabled = createAccessVerifier({ enabled: false });
    await assert.rejects(disabled(request(await token())), denied);
  });
  it('returns a generic error without submitted content or library causes', async () => {
    await assert.rejects(verify(request('private-canary')), error =>
      error.message === denied.message && error.cause === undefined);
  });
});

async function jwksServer(t, handler) {
  const server = http.createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  return new URL(`http://127.0.0.1:${server.address().port}/certs`);
}

describe('Remote JWKS integration', () => {
  it('uses only the configured production JWKS URL and caches its key set', async t => {
    const calls = [];
    t.mock.method(globalThis, 'fetch', async (url, options) => {
      calls.push({ url, redirect: options.redirect, signal: options.signal });
      return new Response(JSON.stringify({ keys: [jwk] }));
    });
    const productionVerify = createAccessVerifier(config);
    const req = request(await token({}, { jku: 'https://evil.example/keys' }));
    await productionVerify(req);
    await productionVerify(req);
    await assert.rejects(productionVerify(request(await token({}, { kid: 'unknown' }))), denied);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `${config.issuer}/cdn-cgi/access/certs`);
    assert.equal(calls[0].redirect, 'manual');
    assert.ok(calls[0].signal instanceof AbortSignal);
  });
  it('caches keys and does not follow attacker jku/x5u URLs', async t => {
    let hits = 0;
    const url = await jwksServer(t, (_req, res) => {
      hits += 1; res.end(JSON.stringify({ keys: [jwk] }));
    });
    const resolver = jose.createRemoteJWKSet(url, { cooldownDuration: 30000, timeoutDuration: 5000 });
    const remoteVerify = createAccessVerifier(config, { keyResolver: resolver });
    const req = request(await token({}, { jku: 'http://127.0.0.1:1/evil', x5u: 'http://127.0.0.1:1/evil' }));
    await remoteVerify(req);
    await remoteVerify(req);
    await assert.rejects(remoteVerify(request(await token({}, { kid: 'random' }))), denied);
    assert.equal(hits, 1);
  });
  it('accepts rotated keys after the resolver cooldown', async t => {
    let keys = [jwk];
    const url = await jwksServer(t, (_req, res) => res.end(JSON.stringify({ keys })));
    const resolver = jose.createRemoteJWKSet(url, { cooldownDuration: 0, timeoutDuration: 5000 });
    const remoteVerify = createAccessVerifier(config, { keyResolver: resolver });
    await remoteVerify(request(await token()));
    keys = [{ ...await jose.exportJWK(second.publicKey), kid: 'second', alg: 'RS256' }];
    assert.equal((await remoteVerify(request(await token({}, { kid: 'second' }, second.privateKey)))).subject,
      'synthetic-user');
  });
  it('fails closed on upstream outages and redirects', async t => {
    for (const status of [503, 302]) {
      const url = await jwksServer(t, (_req, res) => {
        res.writeHead(status, { Location: 'http://127.0.0.1:1/evil' }); res.end('upstream-canary');
      });
      const resolver = jose.createRemoteJWKSet(url, { timeoutDuration: 100 });
      await assert.rejects(createAccessVerifier(config, { keyResolver: resolver })(request(await token())), denied);
    }
  });
  it('bounds a stalled JWKS fetch', async t => {
    const url = await jwksServer(t, () => {});
    const resolver = jose.createRemoteJWKSet(url, { timeoutDuration: 50 });
    await assert.rejects(createAccessVerifier(config, { keyResolver: resolver })(request(await token())), denied);
  });
});
