const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');

const { sessionCookieOptions } = require('./config');

// Mirrors the proxy setup in index.js. The login loop this guards against was
// invisible in every unit test: the app returned 200 and only the browser knew
// the cookie had been thrown away.
function startProbe(hops) {
  const app = express();
  app.set('trust proxy', hops);
  app.get('/probe', (req, res) => {
    res.json({ secure: req.secure, ip: req.ip, cookieSecure: sessionCookieOptions(req, { override: null }).secure });
  });
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve({ server, port: server.address().port }));
  });
}

function probe(port, headers) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/probe', headers }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve(JSON.parse(body)));
    });
    req.on('error', reject);
  });
}

// nginx normalises X-Forwarded-Proto via the $forwarded_proto map before these
// ever reach Express, so the values here are what that map emits.
const TOPOLOGIES = [
  {
    name: 'Cloudflare Tunnel (cloudflared -> nginx)',
    headers: { 'X-Forwarded-Proto': 'https', 'X-Forwarded-For': '203.0.113.9, 172.20.0.5' },
    secure: true,
    clientIp: '203.0.113.9',
  },
  {
    name: 'reverse proxy (synology -> nginx)',
    headers: { 'X-Forwarded-Proto': 'https', 'X-Forwarded-For': '203.0.113.9, 10.0.0.1' },
    secure: true,
    clientIp: '203.0.113.9',
  },
  {
    name: 'direct LAN over plain HTTP (browser -> nginx)',
    headers: { 'X-Forwarded-Proto': 'http', 'X-Forwarded-For': '10.0.0.50' },
    secure: false,
    clientIp: '10.0.0.50',
  },
];

test.describe('proxy topologies', () => {
  // The cookie's Secure flag must not depend on the hop count: req.protocol
  // only checks that the immediate peer is trusted. Getting the count wrong
  // should cost IP accuracy, never the ability to log in.
  for (const hops of [1, 2]) {
    for (const t of TOPOLOGIES) {
      test(`${t.name} sets cookie secure=${t.secure} at ${hops} hop(s)`, async () => {
        const { server, port } = await startProbe(hops);
        try {
          const got = await probe(port, t.headers);
          assert.equal(got.cookieSecure, t.secure);
          assert.equal(got.secure, t.secure);
        } finally {
          server.close();
        }
      });
    }
  }

  // Two proxies sit in front of Express in both remote topologies (the edge
  // plus the bundled nginx), so 2 is the correct value for tunnel and reverse
  // proxy alike -- switching between them needs no config change.
  for (const t of TOPOLOGIES) {
    test(`${t.name} resolves the real client IP at 2 hops`, async () => {
      const { server, port } = await startProbe(2);
      try {
        assert.equal((await probe(port, t.headers)).ip, t.clientIp);
      } finally {
        server.close();
      }
    });
  }

  test('an edge that omits X-Forwarded-Proto degrades to a non-Secure cookie, not a failed login', async () => {
    const { server, port } = await startProbe(2);
    try {
      const got = await probe(port, { 'X-Forwarded-For': '203.0.113.9, 172.20.0.5' });
      assert.equal(got.cookieSecure, false); // set COOKIE_SECURE=true to refuse instead
    } finally {
      server.close();
    }
  });
});
