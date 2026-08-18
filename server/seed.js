const { log } = require('./logger');
const bcrypt = require('bcrypt');
const db = require('./db');

async function seed() {
  const email = process.env.SEED_USER_EMAIL;
  const password = process.env.SEED_USER_PASSWORD;
  if (!email || !password) return;

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return;

  const hash = await bcrypt.hash(password, 12);
  const userId = db.transaction(() => {
    const r = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(email, hash);
    db.prepare('INSERT INTO lists (user_id, name, color, sort_order) VALUES (?, ?, ?, ?)')
      .run(r.lastInsertRowid, 'Tasks', 'indigo', 0);
    return r.lastInsertRowid;
  })();
  log.warn('seed test account created -- never enable this in production', { userId });
}

module.exports = seed;
