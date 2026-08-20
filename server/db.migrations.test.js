const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const Database = require('better-sqlite3');

// db.js opens its handle at module load and caches it, so a migration can only
// be exercised once per process. Each fixture therefore gets its own child
// process instead of a require() this file could never repeat.
const MARKER = '<<<RESULT>>>';

function migrateAndInspect(dbPath) {
  const script = [
    'const db = require(' + JSON.stringify(path.join(__dirname, 'db')) + ');',
    'const cols = db.prepare("PRAGMA table_info(todos)").all().map(c => c.name);',
    'const todos = db.prepare("SELECT * FROM todos ORDER BY id").all();',
    'const lists = db.prepare("SELECT id, name, color FROM lists ORDER BY id").all();',
    'process.stdout.write(' + JSON.stringify(MARKER) + ' + JSON.stringify({ cols, todos, lists }));',
  ].join('\n');

  let out;
  try {
    out = execFileSync(process.execPath, ['-e', script], {
      env: { ...process.env, DATABASE_PATH: dbPath, LOG_LEVEL: 'error' },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    // Rethrown rather than swallowed (EL-1): the child's stderr is the only
    // place the real SQLite error appears.
    throw new Error('db.js failed to migrate: ' + String(err.stderr || err.message).trim());
  }
  return JSON.parse(out.slice(out.indexOf(MARKER) + MARKER.length));
}

function fixture(name, sql) {
  const dbPath = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'uni-planner-migrations-')), 'planner.db'
  );
  const seed = new Database(dbPath);
  seed.exec(sql);
  seed.close();
  return { name, dbPath };
}

const NOW_DEFAULT = "(strftime('%Y-%m-%dT%H:%M:%fZ','now'))";

const LEGACY_USERS = `
  CREATE TABLE users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT    NOT NULL,
    created_at    TEXT    NOT NULL DEFAULT ${NOW_DEFAULT}
  );
  INSERT INTO users (id, email, password_hash) VALUES (1, 'legacy@example.com', 'x');
`;

// The shape before day_assigned held ISO dates: a CHECK constraint listing the
// weekday names, and list_type instead of list_id.
const DAY_NAME_ERA = fixture('day-name era', LEGACY_USERS + `
  CREATE TABLE todos (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    list_type     TEXT    NOT NULL CHECK(list_type IN ('university', 'private', 'future')),
    title         TEXT    NOT NULL,
    description   TEXT    NOT NULL DEFAULT '',
    completed     INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0, 1)),
    archived      INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0, 1)),
    day_assigned  TEXT CHECK(day_assigned IN ('monday','tuesday','wednesday','thursday','friday','saturday','sunday')),
    created_at    TEXT    NOT NULL DEFAULT ${NOW_DEFAULT},
    updated_at    TEXT    NOT NULL DEFAULT ${NOW_DEFAULT}
  );
  INSERT INTO todos (id, user_id, list_type, title, description, day_assigned, created_at, updated_at)
  VALUES (1, 1, 'university', 'Read chapter 4', 'from the old world', 'monday',
          '2024-01-02T09:00:00.000Z', '2024-01-02T09:00:00.000Z');
`);

// One era later: list_type is still there, but the recurrence columns have
// already been added by the ALTER TABLE guards and carry real data.
const LIST_TYPE_ERA = fixture('list_type era', LEGACY_USERS + `
  CREATE TABLE todos (
    id                       INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id                  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    list_type                TEXT    NOT NULL CHECK(list_type IN ('university', 'private', 'future')),
    title                    TEXT    NOT NULL,
    description              TEXT    NOT NULL DEFAULT '',
    completed                INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0, 1)),
    archived                 INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0, 1)),
    day_assigned             TEXT,
    created_at               TEXT    NOT NULL DEFAULT ${NOW_DEFAULT},
    updated_at               TEXT    NOT NULL DEFAULT ${NOW_DEFAULT},
    planner_order            INTEGER,
    approx_time              TEXT,
    recurrence_interval_days INTEGER,
    recurrence_parent_id     INTEGER,
    recurrence_pattern       TEXT,
    completed_at             TEXT
  );
  INSERT INTO todos (id, user_id, list_type, title, day_assigned, planner_order, approx_time,
                     recurrence_interval_days, recurrence_pattern, created_at, updated_at)
  VALUES (1, 1, 'private', 'Water the plants', '2026-03-02', 3, '18:30', 2, 'weekdays',
          '2026-03-01T08:00:00.000Z', '2026-03-01T08:00:00.000Z');
`);

const CARRIED_COLUMNS = [
  'planner_order', 'approx_time', 'recurrence_interval_days',
  'recurrence_parent_id', 'recurrence_pattern', 'completed_at',
];

test.describe('migrating a list_type-era database', () => {
  let migrated;
  test.before(() => { migrated = migrateAndInspect(LIST_TYPE_ERA.dbPath); });

  // A1: recurrence_pattern was declared on todos_new but left out of both the
  // INSERT column list and the SELECT, so the value silently became NULL.
  test('keeps the recurrence rule through the list_id rebuild', () => {
    assert.equal(migrated.todos[0].recurrence_pattern, 'weekdays');
  });

  test('keeps the other recurrence and planner fields too', () => {
    const { planner_order, approx_time, recurrence_interval_days } = migrated.todos[0];
    assert.deepEqual(
      { planner_order, approx_time, recurrence_interval_days },
      { planner_order: 3, approx_time: '18:30', recurrence_interval_days: 2 },
    );
  });

  test('points the todo at a list named after its old list_type', () => {
    const list = migrated.lists.find(l => l.id === migrated.todos[0].list_id);
    assert.equal(list.name, 'Private');
  });
});

test.describe('migrating a day-name-era database', () => {
  let migrated;
  test.before(() => { migrated = migrateAndInspect(DAY_NAME_ERA.dbPath); });

  // A2: the day-name rebuild recreated todos with only the 10 original columns,
  // destroying the five the ALTER TABLE guards had just added. The very next
  // migration selects those columns, so the whole boot died on "no such column".
  test('opens at all, rather than dying on a column the rebuild dropped', () => {
    assert.equal(migrated.todos.length, 1);
  });

  test('still has every column the guards added before the rebuild', () => {
    assert.deepEqual(CARRIED_COLUMNS.filter(c => !migrated.cols.includes(c)), []);
  });

  test('reaches the modern shape: list_id, not list_type', () => {
    assert.deepEqual(
      { hasListId: migrated.cols.includes('list_id'), hasListType: migrated.cols.includes('list_type') },
      { hasListId: true, hasListType: false },
    );
  });

  test('keeps the row content that predates all of it', () => {
    const { title, description } = migrated.todos[0];
    assert.deepEqual({ title, description }, { title: 'Read chapter 4', description: 'from the old world' });
  });

  // The weekday names cannot be mapped to a date, so clearing them is the
  // deliberate part of this migration -- not the same thing as losing a column.
  test('clears the unmappable day-name assignment', () => {
    assert.equal(migrated.todos[0].day_assigned, null);
  });
});
