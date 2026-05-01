const rateLimit = require('express-rate-limit');

const isDev = process.env.NODE_ENV !== 'production';
const skipInDev = () => isDev;

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  skip: skipInDev,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

const todoLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  skip: skipInDev,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

module.exports = { authLimiter, todoLimiter };
