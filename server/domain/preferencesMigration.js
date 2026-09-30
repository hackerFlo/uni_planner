function migratePreferences(db) {
  // Portable user content: include these profiles in owner backup export and
  // restore. Run before migrateDomain so profile writes join revision tracking.
  db.exec(`CREATE TABLE IF NOT EXISTS preference_profiles (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    settings TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 0 CHECK(revision >= 0),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  ); CREATE INDEX IF NOT EXISTS preference_profiles_owner ON preference_profiles(user_id,id);`);
}

module.exports = { migratePreferences };
