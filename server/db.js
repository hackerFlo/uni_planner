const Database = require('better-sqlite3');
const { log } = require('./logger');
const { DB_PATH } = require('./storage');

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

  -- One row per signed-in device. Without it the only revocation lever was
  -- users.token_version, which is shared by every device, so signing out on a
  -- phone signed you out on the desktop too. The JWT now carries this row's id
  -- as the sid claim: deleting one row logs out exactly one device, while
  -- bumping token_version still revokes everything at once for a password change.
  CREATE TABLE IF NOT EXISTS sessions (
    id         TEXT    PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    expires_at TEXT    NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

  -- Public-holiday responses, cached whole. The browser used to call
  -- date.nager.at itself, so holidays disappeared whenever that host was down,
  -- the installed PWA was offline, or the CSP was tightened -- and their absence
  -- looked exactly like "no holidays this year". One row per country-year now
  -- serves every account and every region, because payload keeps each holiday's
  -- counties field verbatim: switching from Bavaria to Berlin is a filter on
  -- data already here, not a refetch. Public reference data, identical for
  -- everyone, so it is deliberately not scoped by user_id -- AR-2 does not
  -- apply. For the same reason it stays out of backup.js: it is a cache, and
  -- restoring someone else's copy of it would be meaningless.
  CREATE TABLE IF NOT EXISTS holiday_cache (
    country    TEXT    NOT NULL,
    year       INTEGER NOT NULL,
    payload    TEXT    NOT NULL,
    fetched_at TEXT    NOT NULL,
    PRIMARY KEY (country, year)
  );

  -- The list of countries the upstream API knows about. One row by construction;
  -- the CHECK is what makes "insert or replace row 1" safe to write blindly.
  CREATE TABLE IF NOT EXISTS holiday_country_cache (
    id         INTEGER PRIMARY KEY CHECK (id = 1),
    payload    TEXT    NOT NULL,
    fetched_at TEXT    NOT NULL
  );

  -- The motivational quote library. user_id IS NULL means a built-in quote,
  -- seeded from server/data/quotes.csv and shared by every account; a non-NULL
  -- user_id means someone uploaded it, and only that account sees it. Reads use
  -- (user_id IS NULL OR user_id = ?), so everything that HAS an owner is still
  -- scoped to them and AR-2 holds.
  --
  -- AR-15: the built-in rows are deliberately NOT exported by backup.js -- they
  -- are re-seeded from the shipped CSV on every boot, so exporting them would
  -- only bloat the file. User-uploaded rows ARE exported.
  CREATE TABLE IF NOT EXISTS quotes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
    text       TEXT    NOT NULL,
    author     TEXT    NOT NULL,
    wikipedia  TEXT,
    source     TEXT,
    created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  -- COALESCE, not a plain UNIQUE(user_id, text): SQLite treats NULLs as
  -- distinct in a unique index, so without it the 191 built-ins would re-insert
  -- themselves on every single boot.
  CREATE UNIQUE INDEX IF NOT EXISTS idx_quotes_owner_text ON quotes(COALESCE(user_id, 0), text);

  CREATE INDEX IF NOT EXISTS idx_quotes_user_id ON quotes(user_id);

  -- Per-user, per-quote bookkeeping. disliked is permanent until the user
  -- restores it; shown_cycle is which rotation pass last showed the quote,
  -- which is what makes "no repeat until every other quote has been shown"
  -- work without a separate history table.
  --
  -- AR-15: only the disliked rows are exported by backup.js. shown_cycle and
  -- last_shown_at are derived scheduling state that self-heals on the next
  -- pick, so restoring them onto another machine would mean nothing.
  CREATE TABLE IF NOT EXISTS quote_state (
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    quote_id      INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
    disliked      INTEGER NOT NULL DEFAULT 0 CHECK(disliked IN (0, 1)),
    shown_cycle   INTEGER,
    last_shown_at TEXT,
    PRIMARY KEY (user_id, quote_id)
  );

  CREATE INDEX IF NOT EXISTS idx_quote_state_user ON quote_state(user_id, disliked);

  -- Which quote belongs to which calendar day, so a refresh does not reroll it.
  -- day is the CLIENT's local YYYY-MM-DD, sent with the request: the server has
  -- no reliable way to know the browser's timezone, and guessing it wrong means
  -- the quote changes at the wrong hour.
  --
  -- AR-15: not exported, for the same reason as shown_cycle above.
  CREATE TABLE IF NOT EXISTS quote_day (
    user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day      TEXT    NOT NULL,
    quote_id INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, day)
  );

  -- A horizontal rule the user drops into a day column to mark a caesura.
  -- planner_order shares ONE dense sequence per day with todos.planner_order:
  -- the client renumbers both kinds 0..n-1 after every drag, so a divider and
  -- a todo never hold the same slot and neither table can be reordered alone.
  --
  -- AR-15: user data, exported by routes/backup.js.
  CREATE TABLE IF NOT EXISTS day_dividers (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date          TEXT    NOT NULL,
    planner_order INTEGER,
    created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
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
const DAY_NAME_ERA_COLS = [
  'id', 'user_id', 'list_type', 'title', 'description',
  'completed', 'archived', 'day_assigned', 'created_at', 'updated_at',
];

// Rendered from PRAGMA table_info rather than hard-coded: this rebuild used to
// declare only the ten columns above, which silently destroyed planner_order,
// approx_time and the three recurrence columns that the ALTER TABLE guards had
// added moments earlier -- and then the list_type migration below, which reads
// those columns, killed the whole boot with "no such column".
const declareColumn = (c) =>
  c.name + ' ' + c.type +
  (c.notnull ? ' NOT NULL' : '') +
  (c.dflt_value === null ? '' : ' DEFAULT ' + c.dflt_value);

const schema = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='todos'`).get();
if (schema && schema.sql.includes("'monday'")) {
  const carried = db.prepare(`PRAGMA table_info(todos)`).all()
    .filter(c => !DAY_NAME_ERA_COLS.includes(c.name));
  const carriedDecls = carried.map(c => ',\n      ' + declareColumn(c)).join('');
  const carriedNames = carried.map(c => ', ' + c.name).join('');
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
      updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))${carriedDecls}
    );
    INSERT INTO todos_new (id, user_id, list_type, title, description, completed, archived,
                           day_assigned, created_at, updated_at${carriedNames})
      SELECT id, user_id, list_type, title, description, completed, archived,
             NULL, created_at, updated_at${carriedNames}
      FROM todos;
    DROP TABLE todos;
    ALTER TABLE todos_new RENAME TO todos;
    CREATE INDEX IF NOT EXISTS idx_todos_user_id ON todos(user_id);
    PRAGMA foreign_keys = ON;
  `);
  if (carried.some(c => c.name === 'recurrence_parent_id')) {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_todos_recurrence_parent ON todos(recurrence_parent_id)`);
  }
  log.info('db migrated', {
    change: 'day_assigned now stores ISO dates; cleared old day-name values',
    carried: carried.length,
  });
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
                           recurrence_interval_days, recurrence_parent_id, completed_at,
                           recurrence_pattern)
      SELECT t.id, t.user_id,
        (SELECT l.id FROM lists l WHERE l.user_id = t.user_id
           AND l.name = CASE t.list_type
                          WHEN 'university' THEN 'University'
                          WHEN 'private'    THEN 'Private'
                          ELSE 'Future'
                        END),
        t.title, t.description, t.completed, t.archived, t.day_assigned,
        t.created_at, t.updated_at, t.planner_order, t.approx_time,
        t.recurrence_interval_days, t.recurrence_parent_id, t.completed_at,
        t.recurrence_pattern
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
  CREATE INDEX IF NOT EXISTS idx_day_dividers_user_date ON day_dividers(user_id, date);
`);

// Built-in quotes, after every table exists. Idempotent and cheap (one
// transaction, ON CONFLICT DO NOTHING), so it runs on every open -- including
// in tests, which is what lets a route test find a populated library.
require('./quotesSeed').seedBuiltInQuotes(db);

module.exports = db;
