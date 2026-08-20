const rateLimit = require('express-rate-limit');
const { log } = require('../logger');

// Fail closed. This read `NODE_ENV !== 'production'`, so every limiter switched
// itself off whenever NODE_ENV was unset, misspelt or simply not passed through
// by the runtime -- a security control that disappears without a trace. Now the
// limiters are on unless something explicitly asks for them to be off, and that
// choice is announced once at boot.
const rateLimitDisabled = process.env.DISABLE_RATE_LIMIT === 'true';
const skipWhenDisabled = () => rateLimitDisabled;

if (rateLimitDisabled) {
  log.warn('rate limiting disabled', { via: 'DISABLE_RATE_LIMIT' });
}

// express-rate-limit answers a 429 and tells nobody. Naming the limiter makes
// "the app locked me out" greppable instead of invisible.
function limitHandler(name) {
  return (req, res, _next, options) => {
    (req.log || log).warn('rate limit hit', {
      limiter: name,
      method: req.method,
      path: req.originalUrl.split('?')[0],
    });
    res.status(options.statusCode).json(options.message);
  };
}

const authLimiter = rateLimit({
  handler: limitHandler('auth'),
  windowMs: 15 * 60 * 1000,
  max: 20,
  skip: skipWhenDisabled,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

const todoLimiter = rateLimit({
  handler: limitHandler('todo'),
  windowMs: 15 * 60 * 1000,
  max: 300,
  skip: skipWhenDisabled,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

// Session checks (GET /me, logout, settings reads) fire on every page load, so
// they get their own generous budget. Sharing the strict authLimiter budget
// meant a handful of reloads could lock a user out of their own session.
const sessionLimiter = rateLimit({
  handler: limitHandler('session'),
  windowMs: 15 * 60 * 1000,
  max: 300,
  skip: skipWhenDisabled,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

const backupLimiter = rateLimit({
  handler: limitHandler('backup'),
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  skip: skipWhenDisabled,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

// A CSV import parses and inserts up to 5000 rows from a body far larger than
// any other endpoint accepts, so it gets backup's tight hourly budget rather
// than the generous todo one the rest of /api/quotes is mounted under.
const quoteImportLimiter = rateLimit({
  handler: limitHandler('quote-import'),
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  skip: skipWhenDisabled,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

// Every check that misses the 15-minute cache spends one of GitHub's 60
// unauthenticated requests per hour, and that budget is shared by the whole
// deployment's egress IP. A button people can press is exactly how it runs out.
const versionCheckLimiter = rateLimit({
  handler: limitHandler('version-check'),
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  skip: skipWhenDisabled,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

// An install restarts the containers serving the request, so a retry loop here
// would keep the app permanently mid-restart. Five is generous for something a
// human decides to do.
const updateLimiter = rateLimit({
  handler: limitHandler('update'),
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  skip: skipWhenDisabled,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

module.exports = {
  authLimiter,
  sessionLimiter,
  todoLimiter,
  backupLimiter,
  quoteImportLimiter,
  versionCheckLimiter,
  updateLimiter,
  rateLimitDisabled,
};
