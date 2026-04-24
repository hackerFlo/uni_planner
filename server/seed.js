const bcrypt = require('bcrypt');
const db = require('./db');

async function seed() {
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get('test@uni.local');
  if (existing) return;

  const hash = await bcrypt.hash('TestPass123!', 12);
  db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run('test@uni.local', hash);
  console.log('[seed] Test account created: test@uni.local / TestPass123!');
}

module.exports = seed;
