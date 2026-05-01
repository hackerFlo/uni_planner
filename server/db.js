const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(process.env.DATABASE_PATH || path.join(__dirname, 'planner.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT    NOT NULL,
    created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE TABLE IF NOT EXISTS todos (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    list_type     TEXT    NOT NULL CHECK(list_type IN ('university', 'private', 'future')),
    title         TEXT    NOT NULL,
    description   TEXT    NOT NULL DEFAULT '',
    completed     INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0, 1)),
    archived      INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0, 1)),
    day_assigned  TEXT    CHECK(day_assigned IN (
                    'monday','tuesday','wednesday','thursday',
                    'friday','saturday','sunday') OR day_assigned IS NULL),
    created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE INDEX IF NOT EXISTS idx_todos_user_id ON todos(user_id);
`);

// Migrate: add planner_order column if missing
const todoCols = db.prepare(`PRAGMA table_info(todos)`).all();
if (!todoCols.some(c => c.name === 'planner_order')) {
  db.exec(`ALTER TABLE todos ADD COLUMN planner_order INTEGER`);
  console.log('[db] Migrated: added planner_order column');
}
if (!todoCols.some(c => c.name === 'approx_time')) {
  db.exec(`ALTER TABLE todos ADD COLUMN approx_time TEXT`);
  console.log('[db] Migrated: added approx_time column');
}

// Migrate: if todos table still has the day-name CHECK constraint, recreate without it
// day_assigned now stores ISO dates (YYYY-MM-DD) instead of day names
const schema = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='todos'`).get();
if (schema && schema.sql.includes("'monday'")) {
  db.exec(`
    PRAGMA foreign_keys = OFF;
    CREATE TABLE todos_new (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      list_type     TEXT    NOT NULL CHECK(list_type IN ('university', 'private', 'future')),
      title         TEXT    NOT NULL,
      description   TEXT    NOT NULL DEFAULT '',
      completed     INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0, 1)),
      archived      INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0, 1)),
      day_assigned  TEXT,
      created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
    INSERT INTO todos_new
      SELECT id, user_id, list_type, title, description, completed, archived,
             NULL, created_at, updated_at
      FROM todos;
    DROP TABLE todos;
    ALTER TABLE todos_new RENAME TO todos;
    CREATE INDEX IF NOT EXISTS idx_todos_user_id ON todos(user_id);
    PRAGMA foreign_keys = ON;
  `);
  console.log('[db] Migrated: day_assigned now stores ISO dates; cleared old day-name values');
}

// Migrate: add completed_at to todos
if (!todoCols.some(c => c.name === 'completed_at')) {
  db.exec(`ALTER TABLE todos ADD COLUMN completed_at TEXT`);
  console.log('[db] Migrated: added completed_at column');
}

// Migrate: add notification columns to users
const userCols = db.prepare(`PRAGMA table_info(users)`).all();
if (!userCols.some(c => c.name === 'notify_enabled')) {
  db.exec(`ALTER TABLE users ADD COLUMN notify_enabled INTEGER NOT NULL DEFAULT 0`);
  db.exec(`ALTER TABLE users ADD COLUMN notify_time TEXT NOT NULL DEFAULT '22:00'`);
  db.exec(`ALTER TABLE users ADD COLUMN notify_email_enc TEXT`);
  console.log('[db] Migrated: added notification columns to users');
}
if (!userCols.some(c => c.name === 'notify_last_sent')) {
  db.exec(`ALTER TABLE users ADD COLUMN notify_last_sent TEXT`);
  console.log('[db] Migrated: added notify_last_sent column');
}

module.exports = db;
