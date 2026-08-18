const rateLimit = require('express-rate-limit');
const { log } = require('../logger');

const isDev = process.env.NODE_ENV !== 'production';
const skipInDev = () => isDev;

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
  skip: skipInDev,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

const todoLimiter = rateLimit({
  handler: limitHandler('todo'),
  windowMs: 15 * 60 * 1000,
  max: 300,
  skip: skipInDev,
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
  skip: skipInDev,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

const backupLimiter = rateLimit({
  handler: limitHandler('backup'),
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  skip: skipInDev,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

module.exports = { authLimiter, sessionLimiter, todoLimiter, backupLimiter };
