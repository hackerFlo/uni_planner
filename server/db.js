const Database = require('better-sqlite3');
const path = require('path');
const { log } = require('./logger');

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, 'planner.db');
const db = new Database(DB_PATH);

log.info('db open', { path: DB_PATH });

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS day_notes (
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date       TEXT    NOT NULL,
    note       TEXT    NOT NULL,
    updated_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    PRIMARY KEY (user_id, date)
  );

  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT    NOT NULL,
    token_version INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE TABLE IF NOT EXISTS lists (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       TEXT    NOT NULL,
    color      TEXT    NOT NULL DEFAULT 'indigo',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  CREATE INDEX IF NOT EXISTS idx_lists_user_id ON lists(user_id);

  CREATE TABLE IF NOT EXISTS todos (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    list_id       INTEGER NOT NULL REFERENCES lists(id) ON DELETE RESTRICT,
    title         TEXT    NOT NULL,
    description   TEXT    NOT NULL DEFAULT '',
    completed     INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0, 1)),
    archived      INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0, 1)),
    day_assigned  TEXT,
    created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE INDEX IF NOT EXISTS idx_todos_user_id ON todos(user_id);

  CREATE TABLE IF NOT EXISTS exams (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title      TEXT    NOT NULL,
    exam_date  TEXT    NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  CREATE INDEX IF NOT EXISTS idx_exams_user_id ON exams(user_id);
`);

// Migrate: add planner_order column if missing
const todoCols = db.prepare(`PRAGMA table_info(todos)`).all();
if (!todoCols.some(c => c.name === 'planner_order')) {
  db.exec(`ALTER TABLE todos ADD COLUMN planner_order INTEGER`);
  log.info('db migrated', { change: 'added planner_order column' });
}
if (!todoCols.some(c => c.name === 'approx_time')) {
  db.exec(`ALTER TABLE todos ADD COLUMN approx_time TEXT`);
  log.info('db migrated', { change: 'added approx_time column' });
}
if (!todoCols.some(c => c.name === 'recurrence_interval_days')) {
  db.exec(`ALTER TABLE todos ADD COLUMN recurrence_interval_days INTEGER`);
  log.info('db migrated', { change: 'added recurrence_interval_days column' });
}
if (!todoCols.some(c => c.name === 'recurrence_parent_id')) {
  db.exec(`ALTER TABLE todos ADD COLUMN recurrence_parent_id INTEGER`);
  log.info('db migrated', { change: 'added recurrence_parent_id column' });
}
if (!todoCols.some(c => c.name === 'recurrence_pattern')) {
  db.exec(`ALTER TABLE todos ADD COLUMN recurrence_pattern TEXT`);
  log.info('db migrated', { change: 'added recurrence_pattern column' });
}
db.exec(`CREATE INDEX IF NOT EXISTS idx_todos_recurrence_parent ON todos(recurrence_parent_id)`);

// Migrate: if todos table still has the day-name CHECK constraint, recreate without it
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
  log.info('db migrated', { change: 'day_assigned now stores ISO dates; cleared old day-name values' });
}

// Migrate: add completed_at to todos
if (!todoCols.some(c => c.name === 'completed_at')) {
  db.exec(`ALTER TABLE todos ADD COLUMN completed_at TEXT`);
  log.info('db migrated', { change: 'added completed_at column' });
}

// Migrate: add notification columns to users
const userCols = db.prepare(`PRAGMA table_info(users)`).all();
if (!userCols.some(c => c.name === 'notify_enabled')) {
  db.exec(`ALTER TABLE users ADD COLUMN notify_enabled INTEGER NOT NULL DEFAULT 0`);
  db.exec(`ALTER TABLE users ADD COLUMN notify_time TEXT NOT NULL DEFAULT '22:00'`);
  db.exec(`ALTER TABLE users ADD COLUMN notify_email_enc TEXT`);
  log.info('db migrated', { change: 'added notification columns to users' });
}
if (!userCols.some(c => c.name === 'notify_last_sent')) {
  db.exec(`ALTER TABLE users ADD COLUMN notify_last_sent TEXT`);
  log.info('db migrated', { change: 'added notify_last_sent column' });
}
if (!userCols.some(c => c.name === 'notify_tz')) {
  db.exec(`ALTER TABLE users ADD COLUMN notify_tz TEXT NOT NULL DEFAULT 'UTC'`);
  log.info('db migrated', { change: 'added notify_tz column' });
}
if (!userCols.some(c => c.name === 'token_version')) {
  db.exec(`ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0`);
  log.info('db migrated', { change: 'added token_version column to users' });
}

// Migrate: replace list_type TEXT with list_id INTEGER -> lists(id)
// Re-read columns after any ALTER TABLE operations above
const currentTodoCols = db.prepare(`PRAGMA table_info(todos)`).all().map(c => c.name);
if (currentTodoCols.includes('list_type')) {
  // Ensure lists table exists (idempotent — already in initial schema block above)
  db.exec(`
    CREATE TABLE IF NOT EXISTS lists (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name       TEXT    NOT NULL,
      color      TEXT    NOT NULL DEFAULT 'indigo',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_lists_user_id ON lists(user_id);
  `);

  // Create list rows for each (user, list_type) pair found in todos
  db.exec(`
    INSERT INTO lists (user_id, name, color, sort_order)
      SELECT DISTINCT user_id,
        CASE list_type WHEN 'university' THEN 'University' WHEN 'private' THEN 'Private' ELSE 'Future' END,
        CASE list_type WHEN 'university' THEN 'indigo'    WHEN 'private' THEN 'emerald'  ELSE 'amber'  END,
        CASE list_type WHEN 'university' THEN 0           WHEN 'private' THEN 1           ELSE 2        END
      FROM todos;
  `);

  // Create a default "Tasks" list for users who have no todos at all
  db.exec(`
    INSERT INTO lists (user_id, name, color, sort_order)
      SELECT id, 'Tasks', 'indigo', 0 FROM users
      WHERE NOT EXISTS (SELECT 1 FROM lists WHERE lists.user_id = users.id);
  `);

  // Recreate todos table with list_id in place of list_type
  db.exec(`
    PRAGMA foreign_keys = OFF;
    CREATE TABLE todos_new (
      id                       INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id                  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      list_id                  INTEGER NOT NULL REFERENCES lists(id) ON DELETE RESTRICT,
      title                    TEXT    NOT NULL,
      description              TEXT    NOT NULL DEFAULT '',
      completed                INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0, 1)),
      archived                 INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0, 1)),
      day_assigned             TEXT,
      created_at               TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at               TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      planner_order            INTEGER,
      approx_time              TEXT,
      recurrence_interval_days INTEGER,
      recurrence_parent_id     INTEGER,
      completed_at             TEXT,
      recurrence_pattern       TEXT
    );
    INSERT INTO todos_new (id, user_id, list_id, title, description, completed, archived,
                           day_assigned, created_at, updated_at, planner_order, approx_time,
                           recurrence_interval_days, recurrence_parent_id, completed_at)
      SELECT t.id, t.user_id,
        (SELECT l.id FROM lists l WHERE l.user_id = t.user_id
           AND l.name = CASE t.list_type
                          WHEN 'university' THEN 'University'
                          WHEN 'private'    THEN 'Private'
                          ELSE 'Future'
                        END),
        t.title, t.description, t.completed, t.archived, t.day_assigned,
        t.created_at, t.updated_at, t.planner_order, t.approx_time,
        t.recurrence_interval_days, t.recurrence_parent_id, t.completed_at
      FROM todos t;
    DROP TABLE todos;
    ALTER TABLE todos_new RENAME TO todos;
    CREATE INDEX IF NOT EXISTS idx_todos_user_id ON todos(user_id);
    CREATE INDEX IF NOT EXISTS idx_todos_recurrence_parent ON todos(recurrence_parent_id);
    PRAGMA foreign_keys = ON;
  `);
  log.info('db migrated', { change: 'list_type -> list_id (lists table created)' });
}

// Indexes last: they reference columns (completed_at, list_id) that the
// migrations above add, so creating them earlier crashes a fresh database.
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_todos_user_day       ON todos(user_id, day_assigned);
  CREATE INDEX IF NOT EXISTS idx_todos_user_archived  ON todos(user_id, archived);
  CREATE INDEX IF NOT EXISTS idx_todos_user_completed ON todos(user_id, completed, completed_at);
  CREATE INDEX IF NOT EXISTS idx_todos_list_id        ON todos(list_id);
`);

module.exports = db;
