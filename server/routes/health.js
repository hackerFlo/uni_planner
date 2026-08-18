const express = require('express');
const { VERSION, COMMIT } = require('../version');
const { sessionLimiter } = require('../middleware/rateLimiter');

const router = express.Router();
const STARTED_AT = Date.now();

// Explicitly public (S-2): it has to answer before login so a browser can prove
// the API is reachable and see which build is serving. It deliberately reveals
// nothing about the deployment's configuration -- trust-proxy hops, CORS and
// the database path stay in the boot log, visible only with container access.
router.get('/', sessionLimiter, (_req, res) => {
  res.json({
    status: 'ok',
    version: VERSION,
    commit: COMMIT,
    uptimeSeconds: Math.round((Date.now() - STARTED_AT) / 1000),
  });
});

module.exports = router;
