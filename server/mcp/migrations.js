function migrateMcp(db) {
  // Authorization state is deliberately excluded from portable user backups
  // (AR-15 exception): restoring planner content must never restore a grant.
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_links (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      issuer TEXT NOT NULL,
      subject TEXT NOT NULL,
      token_version INTEGER NOT NULL CHECK (token_version >= 0),
      capabilities TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      revoked_at TEXT,
      UNIQUE (issuer, subject)
    );
  `);
}

module.exports = { migrateMcp };
