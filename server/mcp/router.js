const express = require('express');
const { classifyCall, bodyLimit } = require('./limits');
const rateLimit = require('express-rate-limit');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { createMcpServer } = require('./server');
const { log } = require('../logger');

function hostBoundary(config) {
  return (req, res, next) => {
    if (!config.publicUrl) return next();
    const host = req.headers.host;
    const mcpHost = new URL(config.publicUrl).host;
    const webHost = new URL(config.webOrigin).host;
    const path = req.originalUrl.split('?')[0];
    if (host === mcpHost && path === '/mcp') return next();
    if (host === webHost && !path.toLowerCase().startsWith('/mcp')) return next();
    // Docker healthcheck remains public on loopback; no other API bypass.
    if (req.socket.remoteAddress?.match(/^(::ffff:)?127\.0\.0\.1$|^::1$/) &&
        path === '/api/health' && /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host || '')) return next();
    res.set('Cache-Control', 'no-store').status(404).json({ error: 'Not found' });
  };
}

function makeLimiter(limit, keyGenerator, windowMs = 60000) {
  return rateLimit({ windowMs, limit, keyGenerator,
    standardHeaders: true, legacyHeaders: false,
    message: { error: 'Too many requests', code: 'RATE_LIMITED' } });
}

function boundary(config) {
  return (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!config.enabled || req.originalUrl.split('?')[0] !== '/mcp') {
      return res.status(404).json({ error: 'Not found' });
    }
    if (req.headers.host !== new URL(config.publicUrl).host) return res.status(404).json({ error: 'Not found' });
    if (Object.hasOwn(req.headers, 'origin') && !config.allowedOrigins.includes(req.headers.origin)) {
      return res.status(403).json({ error: 'Origin not allowed' });
    }
    next();
  };
}

function authenticate({ config, verifyAssertion, links }) {
  return async (req, res, next) => {
    try {
      const identity = await verifyAssertion(req, config.mcpAudience);
      Object.assign(req, { mcpIdentity: identity, mcpPrincipal: links.resolve(identity) });
      next();
    } catch (error) {
      const status = error.status === 403 ? 403 : 401;
      if (status === 401) res.set('WWW-Authenticate', 'Bearer');
      (req.log || log).warn('mcp access rejected', { reqId: req.id, outcome: status });
      res.status(status).json({ error: status === 401 ? 'Authentication required' : 'Agent access is not enabled' });
    }
  };
}

function validateEnvelope(req, res, next) {
  if (!req.is('application/json')) return res.status(415).json({ error: 'JSON required' });
  if (!req.body || Array.isArray(req.body) || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'One JSON-RPC message is required' });
  }
  if (req.mcpBodyBytes > bodyLimit(req.body)) return res.status(413).json({ error: 'Request too large' });
  next();
}

function handleProtocol(options) {
  return async (req, res) => {
    const audit = (action, userId, outcome) => (req.log || log).info('mcp action', { reqId: req.id, action, userId, outcome });
    try {
      const server = createMcpServer({ ...options, identity: req.mcpIdentity, requestId: req.id, audit });
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      res.once('close', () => {
        server.close().catch(() => audit('transport_close', req.mcpPrincipal.userId, 'failure'));
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      audit('protocol', req.mcpPrincipal.userId, 'failure');
      if (!res.headersSent) res.status([401, 403].includes(error.status) ? error.status : 500).json({ error: 'Request failed' });
    }
  };
}

function createMcpRouter(options) {
  const router = express.Router();
  router.use(boundary(options.config), makeLimiter(60), authenticate(options));
  router.use((_req, res, next) => {
    const timeout = setTimeout(() => res.destroy(), 15000);
    res.once('close', () => clearTimeout(timeout));
    next();
  });
  router.use(makeLimiter(120, req => String(req.mcpPrincipal.userId)));
  const mutations = makeLimiter(30, req => String(req.mcpPrincipal.userId));
  const bulk = makeLimiter(10, req => String(req.mcpPrincipal.userId), 60 * 60000);
  const conditional = (kind, limiter) => (req, res, next) => classifyCall(req.body)[kind] ? limiter(req, res, next) : next();
  router.post('/', express.json({ limit: '1mb', inflate: false,
    verify: (req, _res, bytes) => { req.mcpBodyBytes = bytes.length; } }), validateEnvelope,
  conditional('mutation', mutations), conditional('bulk', bulk), handleProtocol(options));
  router.all('/', (_req, res) => res.set('Allow', 'POST').status(405).json({ error: 'Method not allowed' }));
  router.use((error, req, res, _next) => {
    const status = [400, 413, 415].includes(error.status) ? error.status : 500;
    (req.log || log).warn('mcp request rejected', { reqId: req.id, outcome: status });
    res.status(status).json({ error: 'Request rejected', requestId: req.id });
  });
  return router;
}

module.exports = { createMcpRouter, hostBoundary };
