require('dotenv').config();
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('[fatal] JWT_SECRET is missing or too short (must be >= 32 chars). Refusing to start.');
  process.exit(1);
}
// Logger and config both validate their environment and throw on bad input.
// The uncaughtException handler below would log that and let the process idle
// out with exit code 0, which reads as a clean shutdown to Docker; fail loudly
// instead, like the JWT_SECRET check. Required before anything else so no
// module can pull in a half-configured logger.
let log;
let LEVEL;
let config;
try {
  ({ log, LEVEL } = require('./logger'));
  config = require('./config');
} catch (err) {
  console.error(`[fatal] ${err.message} Refusing to start.`);
  process.exit(1);
}
process.on('uncaughtException', (err) => log.error('uncaughtException', { err }));
process.on('unhandledRejection', (err) => log.error('unhandledRejection', { err }));
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { todoLimiter, backupLimiter } = require('./middleware/rateLimiter');
const requestId = require('./middleware/requestId');
const { jsonBodyParser } = require('./middleware/bodyParser');
const requestLog = require('./middleware/requestLog');
const { VERSION, COMMIT } = require('./version');
const { TRUST_PROXY_HOPS, COOKIE_SECURE_OVERRIDE, CORS_ORIGIN } = config;

// Before any route pulls in db.js. better-sqlite3 would otherwise fail first
// with an opaque SQLITE_CANTOPEN, which on a bind mount nearly always means the
// host folder is owned by the wrong uid -- unguessable from the error alone.
const nodePath = require('node:path');
const { DB_PATH, assertDataDirWritable } = require('./storage');
try {
  assertDataDirWritable(nodePath.dirname(DB_PATH));
} catch (err) {
  log.error('data directory unusable, refusing to start', { err });
  process.exit(1);
}

const authRoutes = require('./routes/auth');
const healthRoutes = require('./routes/health');
const todoRoutes = require('./routes/todos');
const listRoutes = require('./routes/lists');
const backupRoutes = require('./routes/backup');
const dayNoteRoutes = require('./routes/dayNotes');
const examRoutes = require('./routes/exams');
const { isMailerEnabled } = require('./mailer');
const seed = process.env.NODE_ENV !== 'production' ? require('./seed') : () => Promise.resolve();

const app = express();
const PORT = process.env.PORT || 3001;

app.set('trust proxy', TRUST_PROXY_HOPS);
// First in the chain so every later log line -- including a body-parser failure
// -- can be tied back to one request (EL-8).
app.use(requestId);
app.use(helmet());
// nginx serves the SPA and proxies /api on the same origin, so CORS never
// engages in this deployment. Mount it only when an origin is configured.
if (CORS_ORIGIN) app.use(cors({ origin: CORS_ORIGIN, credentials: true }));

// Auth responses must never be cached, nor have their Set-Cookie stripped, by
// an intermediary (Cloudflare, Access, any future CDN).
app.use('/api', (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
// Ahead of the body parser: a malformed body short-circuits straight to the
// error handler, and that request must still appear in the log.
app.use('/api', requestLog);
// 10 kB everywhere except the backup restore, which carries its own 5 MB
// parser. See middleware/bodyParser.js for why this cannot be a plain app.use.
app.use(jsonBodyParser());
app.use(cookieParser());

app.use('/api/health', healthRoutes); // public by design -- see routes/health.js
app.use('/api/auth', authRoutes); // rate limiters are per-route in routes/auth.js
app.use('/api/todos', todoLimiter, todoRoutes);
app.use('/api/lists', todoLimiter, listRoutes);
app.use('/api/backup', backupLimiter, backupRoutes);
app.use('/api/day-notes', todoLimiter, dayNoteRoutes);
app.use('/api/exams', todoLimiter, examRoutes);

// Without this an unknown /api path falls through to Express's HTML 404, the
// client's res.json() fails, and the user gets a message about the wrong thing.
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found', requestId: req.id });
});

app.use((err, req, res, _next) => {
  const status = err.status >= 400 && err.status < 500 ? err.status : 500;
  // A client sending bad JSON is not a server fault; do not cry ERROR over it.
  log[status === 500 ? 'error' : 'warn']('request failed', {
    reqId: req.id,
    method: req.method,
    path: req.originalUrl.split('?')[0],
    status,
    err,
    // Stacks are noisy and can quote source; keep them behind the debug level.
    ...(LEVEL === 'debug' ? { stack: err.stack } : {}),
  });
  res.status(status).json({
    error: status === 500 ? 'Internal server error' : 'Bad request',
    requestId: req.id,
  });
});

const { startScheduler } = require('./scheduler');

seed().then(() => {
  const server = app.listen(PORT, () => {
    // One line that answers "which build is running, and how is it configured".
    log.info('server started', {
      version: VERSION,
      commit: COMMIT,
      node: process.version,
      env: process.env.NODE_ENV || 'development',
      port: PORT,
      trustProxyHops: TRUST_PROXY_HOPS,
      secure: COOKIE_SECURE_OVERRIDE === null ? 'auto' : String(COOKIE_SECURE_OVERRIDE),
      cors: CORS_ORIGIN || 'off',
      db: process.env.DATABASE_PATH || 'server/planner.db',
      mailer: isMailerEnabled() ? 'on' : 'off',
      logLevel: LEVEL,
    });
  });
  server.timeout = 30000;        // 30 s — kills stalled connections
  server.keepAliveTimeout = 65000; // > 60 s to outlast load balancer idle timeouts
  startScheduler();

  const shutdown = () => server.close(() => process.exit(0));
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
});
