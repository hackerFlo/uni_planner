const { DomainError } = require('./errors');

const KEYS = Object.freeze({ lists: ['id'], exams: ['id'], todos: ['id'], day_notes: ['date'],
  day_dividers: ['id'], quotes: ['id'], quote_state: ['quote_id'], quote_day: ['day'] });
const TABLE_ORDER = Object.keys(KEYS);
const MAX_ROWS = 5000;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const conflict = () => new DomainError('UNDO_CONFLICT', 'The recorded rows can no longer be restored', 409);

function allowed(table) {
  if (!Object.hasOwn(KEYS, table)) throw new DomainError('FORBIDDEN', 'Unsupported recovery type', 403);
  return KEYS[table];
}

function snapshot(db, context, tables) {
  const snapshots = {};
  for (const table of tables) {
    const keys = allowed(table);
    const rows = db.prepare(`SELECT * FROM ${table} WHERE user_id=? ORDER BY ${keys.join(',')} LIMIT ?`)
      .all(context.userId, MAX_ROWS + 1);
    if (rows.length > MAX_ROWS) return null;
    snapshots[table] = rows;
  }
  return snapshots;
}

function differences(before, after) {
  const changes = [];
  for (const table of Object.keys(before)) {
    const keyFor = row => JSON.stringify(KEYS[table].map(key => row[key]));
    const old = new Map(before[table].map(row => [keyFor(row), row]));
    const latest = new Map(after[table].map(row => [keyFor(row), row]));
    for (const key of new Set([...old.keys(), ...latest.keys()])) {
      const a = old.get(key) || null;
      const b = latest.get(key) || null;
      if (!same(a, b)) changes.push({ table, before: a, after: b });
    }
  }
  return changes;
}

function validateChange(db, context, change) {
  if (!change || typeof change !== 'object' || Object.keys(change).some(k => !['table', 'before', 'after'].includes(k))) throw conflict();
  const keys = allowed(change.table);
  const columns = db.prepare(`PRAGMA table_info(${change.table})`).all().map(c => c.name);
  for (const row of [change.before, change.after].filter(Boolean)) {
    if (row.user_id !== context.userId || Object.keys(row).length !== columns.length ||
        !columns.every(c => Object.hasOwn(row, c)) || keys.some(k => row[k] === undefined)) throw conflict();
  }
  const row = change.after || change.before;
  if (!row) throw conflict();
  const where = ['user_id', ...keys].map(key => `${key}=?`).join(' AND ');
  const values = [context.userId, ...keys.map(key => row[key])];
  const current = db.prepare(`SELECT * FROM ${change.table} WHERE ${where}`).get(...values) || null;
  if (!same(current, change.after)) throw conflict();
  return { ...change, keys, columns, where, values };
}

function applyChange(db, change, phase) {
  const { table, before, after, columns, where, values, keys } = change;
  if (phase === 'insert' && before && !after) {
    db.prepare(`INSERT INTO ${table}(${columns.join(',')}) VALUES(${columns.map(() => '?').join(',')})`)
      .run(...columns.map(c => before[c]));
  }
  if (phase === 'update' && before && after) {
    const fields = columns.filter(c => c !== 'user_id' && !keys.includes(c));
    db.prepare(`UPDATE ${table} SET ${fields.map(c => `${c}=?`).join(',')} WHERE ${where}`)
      .run(...fields.map(c => before[c]), ...values);
  }
  if (phase === 'delete' && !before && after) db.prepare(`DELETE FROM ${table} WHERE ${where}`).run(...values);
}

function restore(db, context, payload) {
  if (!Array.isArray(payload) || payload.length > MAX_ROWS) throw conflict();
  try {
    return db.transaction(() => {
      const changes = payload.map(change => validateChange(db, context, change));
      changes.sort((a, b) => TABLE_ORDER.indexOf(a.table) - TABLE_ORDER.indexOf(b.table));
      for (const phase of ['insert', 'update', 'delete']) {
        const ordered = phase === 'delete' ? [...changes].reverse() : changes;
        for (const change of ordered) applyChange(db, change, phase);
      }
    })();
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw conflict();
  }
}

function createJournal(db) {
  function capture(context, tables, action) {
    return db.transaction(() => {
      const before = snapshot(db, context, tables);
      const data = action();
      const after = before && snapshot(db, context, tables);
      if (!after) return { data, changed: true, undoReason: 'Operation exceeds recovery limits' };
      const changes = differences(before, after);
      if (changes.length > MAX_ROWS) return { data, changed: true, undoReason: 'Operation exceeds recovery limits' };
      return { data, changed: changes.length > 0,
        ...(changes.length ? { inverse: { type: 'planner_rows', payload: changes } } : {}) };
    })();
  }
  return { capture, restore: (context, payload) => restore(db, context, payload) };
}

module.exports = { createJournal };
