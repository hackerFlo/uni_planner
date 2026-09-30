const TRACKED_TABLES = ['lists', 'todos', 'day_notes', 'day_dividers', 'exams', 'quotes', 'quote_state', 'quote_day', 'preference_profiles'];

function trackLegacyWriters(db) {
  for (const table of TRACKED_TABLES) {
    if (!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table)) continue;
    for (const operation of ['INSERT', 'UPDATE', 'DELETE']) {
      const row = operation === 'DELETE' ? 'OLD' : 'NEW';
      // Table/operation names come from the fixed internal allowlists above.
      db.exec(`CREATE TRIGGER IF NOT EXISTS planner_${table}_${operation}
        AFTER ${operation} ON ${table} BEGIN
        UPDATE planner_versions SET revision = revision + 1 WHERE user_id = ${row}.user_id;
        END;`);
    }
  }
}

function migrateDomain(db) {
  // These are derived concurrency and ephemeral retry/undo records, not
  // portable planner content. Never export them or reactivate them on restore.
  db.exec(`
    CREATE TABLE IF NOT EXISTS planner_versions (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      epoch TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0 CHECK(revision >= 0));
    INSERT OR IGNORE INTO planner_versions(user_id,epoch) SELECT id,lower(hex(randomblob(16))) FROM users;
    CREATE TRIGGER IF NOT EXISTS planner_new_user AFTER INSERT ON users BEGIN
      INSERT INTO planner_versions(user_id,epoch) VALUES(NEW.id,lower(hex(randomblob(16)))); END;
    CREATE TABLE IF NOT EXISTS mutation_receipts (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      epoch TEXT NOT NULL, operation TEXT NOT NULL, retry_key TEXT NOT NULL,
      input_hash TEXT NOT NULL, response TEXT NOT NULL, expires_at INTEGER NOT NULL,
      PRIMARY KEY(user_id,epoch,operation,retry_key));
    CREATE INDEX IF NOT EXISTS receipts_expiry ON mutation_receipts(expires_at);
    CREATE TABLE IF NOT EXISTS planner_operations (
      id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      operation TEXT NOT NULL, actor TEXT NOT NULL, epoch TEXT NOT NULL, revision INTEGER NOT NULL,
      inverse TEXT, expires_at INTEGER NOT NULL, undone INTEGER NOT NULL DEFAULT 0);
    CREATE INDEX IF NOT EXISTS operations_owner ON planner_operations(user_id,id);
    CREATE INDEX IF NOT EXISTS operations_expiry ON planner_operations(expires_at);
  `);
  trackLegacyWriters(db);
  const columns = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
  if (columns.includes('notify_tz')) db.exec(`
    CREATE TRIGGER IF NOT EXISTS planner_notification_settings
      AFTER UPDATE OF notify_enabled,notify_time,notify_email_enc,notify_tz ON users
      WHEN OLD.notify_enabled IS NOT NEW.notify_enabled OR OLD.notify_time IS NOT NEW.notify_time
        OR OLD.notify_email_enc IS NOT NEW.notify_email_enc OR OLD.notify_tz IS NOT NEW.notify_tz
      BEGIN UPDATE planner_versions SET revision=revision+1 WHERE user_id=NEW.id; END;
  `);
}

module.exports = { migrateDomain };
