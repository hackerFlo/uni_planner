require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { authLimiter, todoLimiter } = require('./middleware/rateLimiter');
const authRoutes = require('./routes/auth');
const todoRoutes = require('./routes/todos');
const seed = process.env.NODE_ENV !== 'production' ? require('./seed') : () => Promise.resolve();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/todos', todoLimiter, todoRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const { startScheduler } = require('./scheduler');

seed().then(() => {
  const server = app.listen(PORT, () => console.log(`[server] Listening on http://localhost:${PORT}`));
  startScheduler();

  const shutdown = () => server.close(() => process.exit(0));
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
});
