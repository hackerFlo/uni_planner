function migrateNotifications(db) {
  // Ephemeral delivery deduplication is not portable user content (AR-15).
  // Never export/import recipient addresses, SMTP content, credentials, or
  // attempts. A restart cannot know whether an abandoned SMTP send completed.
  db.exec(`CREATE TABLE IF NOT EXISTS notification_attempts (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    retry_key TEXT NOT NULL,
    input_hash TEXT NOT NULL,
    epoch TEXT NOT NULL,
    revision INTEGER NOT NULL,
    state TEXT NOT NULL CHECK(state IN ('pending','sent','failed','unknown')),
    error_code TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    UNIQUE(user_id,retry_key));
    CREATE INDEX IF NOT EXISTS notification_attempts_owner_time ON notification_attempts(user_id,created_at);
    CREATE INDEX IF NOT EXISTS notification_attempts_expiry ON notification_attempts(expires_at);
    UPDATE notification_attempts SET state='unknown',error_code='DELIVERY_UNKNOWN' WHERE state='pending';`);
}

module.exports = { migrateNotifications };
