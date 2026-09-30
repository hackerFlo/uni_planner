function migrateExports(db) {
  // Ephemeral owner downloads, excluded from backups: never durable planner data.
  db.exec(`CREATE TABLE IF NOT EXISTS export_artifacts (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    payload BLOB NOT NULL,
    byte_count INTEGER NOT NULL CHECK(byte_count > 0 AND byte_count <= 5242880),
    checksum TEXT NOT NULL CHECK(length(checksum) = 64),
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL CHECK(expires_at > created_at)
  );
  CREATE INDEX IF NOT EXISTS export_artifacts_owner ON export_artifacts(user_id, expires_at);
  CREATE INDEX IF NOT EXISTS export_artifacts_expiry ON export_artifacts(expires_at);`);
}
module.exports = { migrateExports };
