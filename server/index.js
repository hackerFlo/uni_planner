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
const { authLimiter, todoLimiter, backupLimiter } = require('./middleware/rateLimiter');
const authRoutes = require('./routes/auth');
const todoRoutes = require('./routes/todos');
const listRoutes = require('./routes/lists');
const backupRoutes = require('./routes/backup');
const dayNoteRoutes = require('./routes/dayNotes');
const examRoutes = require('./routes/exams');
const seed = process.env.NODE_ENV !== 'production' ? require('./seed') : () => Promise.resolve();

const app = express();
const PORT = process.env.PORT || 3001;

app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());

app.use('/api/auth', authLimiter, authRoutes);
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
  const server = app.listen(PORT, () => console.log(`[server] Listening on http://localhost:${PORT}`));
  server.timeout = 30000;        // 30 s — kills stalled connections
  server.keepAliveTimeout = 65000; // > 60 s to outlast load balancer idle timeouts
  startScheduler();

  const shutdown = () => server.close(() => process.exit(0));
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
});
