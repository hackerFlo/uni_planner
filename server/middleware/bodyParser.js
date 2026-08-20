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
const QUOTE_IMPORT_PATH = '/api/quotes/import';

// Every path here MUST mount its own express.json() in its router, or its body
// is never parsed at all and req.body is undefined. Each also needs a matching
// client_max_body_size in client/nginx.conf, or nginx returns 413 before the
// request reaches Node.
const LARGE_BODY_PATHS = new Set([RESTORE_PATH, QUOTE_IMPORT_PATH]);
const DEFAULT_LIMIT = '10kb';

function jsonBodyParser({ limit = DEFAULT_LIMIT } = {}) {
  const parse = express.json({ limit });
  return function parseJsonBody(req, res, next) {
    if (LARGE_BODY_PATHS.has(req.path)) return next();
    return parse(req, res, next);
  };
}

module.exports = { jsonBodyParser, RESTORE_PATH, QUOTE_IMPORT_PATH, LARGE_BODY_PATHS, DEFAULT_LIMIT };
