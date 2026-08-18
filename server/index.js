require('dotenv').config();
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('[fatal] JWT_SECRET is missing or too short (must be >= 32 chars). Refusing to start.');
  process.exit(1);
}
process.on('uncaughtException', (err) => console.error('[fatal] uncaughtException:', err));
process.on('unhandledRejection', (err) => console.error('[fatal] unhandledRejection:', err));
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { todoLimiter, backupLimiter } = require('./middleware/rateLimiter');
// Config validation throws on bad input. The uncaughtException handler above
// would log it and let the process idle out with exit code 0, which reads as a
// clean shutdown to Docker; fail loudly instead, like the JWT_SECRET check.
let config;
try {
  config = require('./config');
} catch (err) {
  console.error(`[fatal] ${err.message} Refusing to start.`);
  process.exit(1);
}
const { TRUST_PROXY_HOPS, COOKIE_SECURE_OVERRIDE, CORS_ORIGIN } = config;
const authRoutes = require('./routes/auth');
const todoRoutes = require('./routes/todos');
const listRoutes = require('./routes/lists');
const backupRoutes = require('./routes/backup');
const dayNoteRoutes = require('./routes/dayNotes');
const examRoutes = require('./routes/exams');
const seed = process.env.NODE_ENV !== 'production' ? require('./seed') : () => Promise.resolve();

const app = express();
const PORT = process.env.PORT || 3001;

app.set('trust proxy', TRUST_PROXY_HOPS);
app.use(helmet());
// nginx serves the SPA and proxies /api on the same origin, so CORS never
// engages in this deployment. Mount it only when an origin is configured.
if (CORS_ORIGIN) app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());

// Auth responses must never be cached, nor have their Set-Cookie stripped, by
// an intermediary (Cloudflare, Access, any future CDN).
app.use('/api', (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

app.use('/api/auth', authRoutes); // rate limiters are per-route in routes/auth.js
app.use('/api/todos', todoLimiter, todoRoutes);
app.use('/api/lists', todoLimiter, listRoutes);
app.use('/api/backup', backupLimiter, backupRoutes);
app.use('/api/day-notes', todoLimiter, dayNoteRoutes);
app.use('/api/exams', todoLimiter, examRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const { startScheduler } = require('./scheduler');

seed().then(() => {
  const server = app.listen(PORT, () => {
    console.log(`[server] Listening on http://localhost:${PORT}`);
    const cookieSecure = COOKIE_SECURE_OVERRIDE === null ? 'auto (from request scheme)' : COOKIE_SECURE_OVERRIDE;
    console.log(`[server] trust proxy=${TRUST_PROXY_HOPS} hop(s), cookie secure=${cookieSecure}, cors=${CORS_ORIGIN || 'off (same-origin)'}`);
  });
  server.timeout = 30000;        // 30 s — kills stalled connections
  server.keepAliveTimeout = 65000; // > 60 s to outlast load balancer idle timeouts
  startScheduler();

  const shutdown = () => server.close(() => process.exit(0));
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
});
