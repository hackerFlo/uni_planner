const express = require('express');

// Every API body is tiny except one: a backup file. `routes/backup.js` mounts its
// own 5 MB parser on /restore, but body-parser short-circuits on `req._body`, so a
// 10 kB parser registered app-wide *ahead* of the routers silently won a race the
// route-level parser could never enter. The effective restore limit was 10 kB --
// smaller than any real backup -- and the 413 surfaced to the user as the generic
// "That request was rejected", which reads as a corrupt file rather than a limit.
// nginx already allows 5 MB on that exact location (client/nginx.conf), so the two
// halves of the deployment disagreed with each other.
//
// Exported rather than inlined in index.js so a test can exercise the real
// predicate instead of a hand-copied replica of the middleware order.
const RESTORE_PATH = '/api/backup/restore';
const DEFAULT_LIMIT = '10kb';

function jsonBodyParser({ limit = DEFAULT_LIMIT } = {}) {
  const parse = express.json({ limit });
  return function parseJsonBody(req, res, next) {
    if (req.path === RESTORE_PATH) return next();
    return parse(req, res, next);
  };
}

module.exports = { jsonBodyParser, RESTORE_PATH, DEFAULT_LIMIT };
