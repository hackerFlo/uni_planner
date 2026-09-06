const express = require('express');
const router = express.Router();
const db = require('../db');
const { log } = require('../logger');
const { encryptEmail, decryptEmail } = require('../crypto');
const requireAuth = require('../middleware/auth');
const {
  validateDayAssigned,
  validateRecurrenceInterval,
  validateRecurrencePattern,
  sanitizeDayNote,
  sanitizeTitle,
  sanitizeDescription,
} = require('../middleware/validate');

const backupJsonParser = express.json({ limit: '5mb' });

// Must stay equal to routes/lists.js and client/src/constants/listPalette.js.
// It fell one colour behind them once, and every exported teal list came back
// grey with nothing logged and nothing rejected.
// Must stay equal to MAX_DIVIDERS_PER_DAY in routes/dayDividers.js.
const MAX_DIVIDERS_PER_DAY = 20;

const PALETTE = ['indigo', 'emerald', 'teal', 'amber', 'rose', 'sky', 'violet', 'pink', 'slate'];
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const cleanIsoDatetime = (v) => (typeof v === 'string' && ISO_DATETIME.test(v) ? v : null);

// Same rule the CSV import applies: a stored URL later becomes an href, so
// anything that is not http(s) is dropped rather than restored.
function safeBackupUrl(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 500) return null;
  try {
    const u = new URL(value.trim());
    return u.protocol === 'https:' || u.protocol === 'http:' ? value.trim() : null;
  } catch {
    return null;
  }
}

// Legacy list_type → display name mapping for old backup files
const LEGACY_LIST_NAMES = { university: 'University', private: 'Private', future: 'Future' };
const LEGACY_LIST_COLORS = { university: 'indigo', private: 'emerald', future: 'amber' };

// Row ids do not survive an export, so todos are identified across databases by
// this triple -- used both for de-duplication and for relinking a recurring
// instance to its template on restore.
const todoKey = (title, listName, createdAt) => `${title}|${listName?.toLowerCase()}|${createdAt}`;

// Notification settings are user data, so AR-15 puts them in the only export
// anyone has: a restore that drops them stops the daily mail with no error.
//
// The address travels as plaintext and is re-encrypted on restore, rather than
// being copied as ciphertext. notify_email_enc is AES-GCM bound to
// NOTIFICATION_ENCRYPT_KEY, so a verbatim copy restores bytes the destination
// cannot decrypt -- and that failure is invisible: the address looks saved,
// the daily mail simply never arrives. Plaintext here discloses nothing new,
// because GET /api/auth/notification-settings already returns exactly this
// value to exactly this authenticated owner, and the file goes only to them.
function exportSettings(req) {
  const row = db.prepare(
    'SELECT notify_enabled, notify_time, notify_email_enc, notify_tz FROM users WHERE id = ?'
  ).get(req.user.id);
  let notifyEmail = '';
  if (row?.notify_email_enc) {
    try {
      notifyEmail = decryptEmail(row.notify_email_enc);
    } catch (err) {
      // A key rotated away costs the address, never the rest of the backup.
      (req.log || log).warn('backup export: notification email unreadable', { userId: req.user.id, err });
    }
  }
  return {
    notify_enabled: !!row?.notify_enabled,
    notify_time: row?.notify_time || '22:00',
    notify_email: notifyEmail,
    notify_tz: row?.notify_tz || 'UTC',
  };
}

router.get('/', requireAuth, (req, res) => {
  const lists = db.prepare(
    'SELECT id, name, color, sort_order FROM lists WHERE user_id = ? ORDER BY sort_order ASC'
  ).all(req.user.id);

  // The template's own identity travels with each generated instance, because
  // recurrence_parent_id is a local row id and means nothing after a restore.
  const todos = db.prepare(
    `SELECT t.title, t.description, l.name AS list_name, t.completed, t.archived,
            t.day_assigned, t.approx_time, t.planner_order, t.completed_at, t.created_at,
            t.recurrence_interval_days, t.recurrence_pattern,
            parent.title      AS recurrence_parent_title,
            parent.created_at AS recurrence_parent_created_at,
            pl.name           AS recurrence_parent_list_name
       FROM todos t
       JOIN lists l ON l.id = t.list_id
       LEFT JOIN todos parent ON parent.id = t.recurrence_parent_id AND parent.user_id = t.user_id
       LEFT JOIN lists pl     ON pl.id = parent.list_id            AND pl.user_id = t.user_id
      WHERE t.user_id = ?`
  ).all(req.user.id);

  const exams = db.prepare(
    'SELECT title, exam_date, created_at FROM exams WHERE user_id = ?'
  ).all(req.user.id);

  const dayNotes = db.prepare(
    'SELECT date, note, updated_at FROM day_notes WHERE user_id = ? ORDER BY date ASC'
  ).all(req.user.id);

  // AR-15: user data, and no row id travels -- a divider is identified by the
  // day it sits on and its slot in that day's shared todo/divider sequence.
  const dayDividers = db.prepare(
    'SELECT date, planner_order, created_at FROM day_dividers WHERE user_id = ? ORDER BY date ASC, planner_order ASC'
  ).all(req.user.id);

  // AR-15. Only the two halves that are genuinely this user's:
  //  - quotes they uploaded. The 191 built-ins are re-seeded from the CSV
  //    shipped in the image on every boot, so exporting them would add ~25 kB
  //    to every backup to restore rows that are already there.
  //  - which quotes they have hidden. Carried by quote text, never by row id:
  //    ids are local and a restored built-in has a different one (see the
  //    todoKey comment above for the same reasoning).
  // Deliberately NOT exported: quote_day and quote_state.shown_cycle. That is
  // rotation bookkeeping which self-heals on the next pick, and restoring
  // another machine's idea of "already seen" would mean nothing.
  const quotes = db.prepare(
    'SELECT text, author, wikipedia, source, created_at FROM quotes WHERE user_id = ?'
  ).all(req.user.id);

  const quoteDislikes = db.prepare(
    `SELECT q.text FROM quote_state s JOIN quotes q ON q.id = s.quote_id
      WHERE s.user_id = ? AND s.disliked = 1`
  ).all(req.user.id).map(r => r.text);

  res.json({
    version: 7,
    exported_at: new Date().toISOString(),
    lists: lists.map(l => ({ name: l.name, color: l.color, sort_order: l.sort_order })),
    todos,
    exams,
    day_notes: dayNotes,
    day_dividers: dayDividers,
    quotes,
    quote_dislikes: quoteDislikes,
    settings: exportSettings(req),
  });
});

const NOTIFY_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const NOTIFY_TZ_RE = /^[A-Za-z_]+(?:\/[A-Za-z_+\-0-9]+){0,2}$/;
// Deliberately the same shape routes/auth.js accepts: a control character in a
// recipient ends the To: header and lets the rest become headers of the file
// author's choosing, and a backup file is untrusted input like any body (AR-1).
const NOTIFY_EMAIL_RE = /^[^\s@]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;

function cleanNotifyTz(tz) {
  if (typeof tz !== 'string' || tz.length > 64 || !NOTIFY_TZ_RE.test(tz)) return null;
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
  } catch {
    return null; // An unknown zone is the answer here, not a failure to report.
  }
  return tz;
}

function cleanNotifyEmail(value) {
  if (typeof value !== 'string' || value.length > 254) return null;
  // eslint-disable-next-line no-control-regex -- matching them is the point
  if (/[\x00-\x1f\x7f]/.test(value)) return null;
  return NOTIFY_EMAIL_RE.test(value) ? value : null;
}

// Each field is whitelisted on its own, so one malformed value costs only
// itself -- the rest of the settings, and the whole rest of the restore, stand.
function collectSettingUpdates(raw, rlog, userId) {
  const updates = {};
  if (raw.notify_enabled !== undefined) updates.notify_enabled = raw.notify_enabled ? 1 : 0;
  if (NOTIFY_TIME_RE.test(String(raw.notify_time))) updates.notify_time = raw.notify_time;
  const tz = cleanNotifyTz(raw.notify_tz);
  if (tz) updates.notify_tz = tz;
  if (raw.notify_email === '') updates.notify_email_enc = null;
  else if (cleanNotifyEmail(raw.notify_email)) {
    try {
      updates.notify_email_enc = encryptEmail(raw.notify_email);
    } catch (err) {
      // No key configured on this machine. The address is the only casualty;
      // it is never logged (S-5), and the logger redacts the field name anyway.
      rlog.warn('backup restore: notification email not encryptable', { userId, err });
    }
  }
  return updates;
}

function restoreSettings(raw, rlog, userId) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const updates = collectSettingUpdates(raw, rlog, userId);
  const keys = Object.keys(updates);
  if (keys.length === 0) return false;
  const set = keys.map(k => k + ' = ?').join(', ');
  db.prepare(`UPDATE users SET ${set} WHERE id = ?`).run(...keys.map(k => updates[k]), userId);
  return true;
}

router.post('/restore', requireAuth, backupJsonParser, (req, res) => {
  const {
    todos, lists: backupLists, exams: backupExams,
    day_notes: backupNotes, day_dividers: backupDividers,
    settings: backupSettings,
    quotes: backupQuotes, quote_dislikes: backupDislikes,
  } = req.body;
  if (!Array.isArray(todos)) return res.status(400).json({ error: 'Invalid backup file' });

  // Build a name→id map for existing user lists
  const existingLists = db.prepare(
    'SELECT id, name FROM lists WHERE user_id = ? ORDER BY sort_order ASC'
  ).all(req.user.id);
  const listNameToId = new Map(existingLists.map(l => [l.name.toLowerCase(), l.id]));

  // Ensure lists from backup exist (create if missing)
  const insertList = db.prepare(
    'INSERT INTO lists (user_id, name, color, sort_order) VALUES (?, ?, ?, ?)'
  );
  const getMaxOrder = () => {
    const r = db.prepare('SELECT MAX(sort_order) AS m FROM lists WHERE user_id = ?').get(req.user.id);
    return (r?.m ?? -1) + 1;
  };

  function ensureList(name, color) {
    const key = name.toLowerCase();
    if (listNameToId.has(key)) return listNameToId.get(key);
    const safeColor = PALETTE.includes(color) ? color : 'slate';
    const result = insertList.run(req.user.id, name, safeColor, getMaxOrder());
    listNameToId.set(key, result.lastInsertRowid);
    return result.lastInsertRowid;
  }

  // Pre-create lists from backup manifest (version 2)
  if (Array.isArray(backupLists)) {
    for (const l of backupLists) {
      if (typeof l.name === 'string' && l.name.trim().length > 0) {
        ensureList(l.name.trim().slice(0, 40), l.color);
      }
    }
  }

  // Determine list_name for each todo row
  function resolveListName(t) {
    if (typeof t.list_name === 'string' && t.list_name.trim()) return t.list_name.trim();
    // Legacy v1: list_type field
    if (typeof t.list_type === 'string' && LEGACY_LIST_NAMES[t.list_type]) {
      return LEGACY_LIST_NAMES[t.list_type];
    }
    return null;
  }
  function resolveListColor(t) {
    if (typeof t.list_type === 'string' && LEGACY_LIST_COLORS[t.list_type]) return LEGACY_LIST_COLORS[t.list_type];
    return 'slate';
  }

  // A Map rather than a Set: a template that is already present must still be
  // reachable as a relink target for instances arriving in this file.
  const existing = db.prepare(
    `SELECT t.id, t.title, l.name AS list_name, t.created_at FROM todos t JOIN lists l ON l.id = t.list_id WHERE t.user_id = ?`
  ).all(req.user.id);
  const existingIds = new Map(existing.map(t => [todoKey(t.title, t.list_name, t.created_at), t.id]));

  const existingExams = db.prepare(
    'SELECT title, exam_date FROM exams WHERE user_id = ?'
  ).all(req.user.id);
  const existingExamSet = new Set(existingExams.map(e => `${e.title}|${e.exam_date}`));

  const insert = db.prepare(`
    INSERT INTO todos (user_id, title, description, list_id, completed, archived, day_assigned, approx_time, planner_order, completed_at, created_at, updated_at, recurrence_interval_days, recurrence_pattern)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const linkToTemplate = db.prepare(
    'UPDATE todos SET recurrence_parent_id = ? WHERE id = ? AND user_id = ?'
  );

  const insertExam = db.prepare(
    'INSERT INTO exams (user_id, title, exam_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
  );

  const insertNote = db.prepare(`
    INSERT INTO day_notes (user_id, date, note, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, date) DO NOTHING
  `);

  const insertDivider = db.prepare(
    'INSERT INTO day_dividers (user_id, date, planner_order, created_at) VALUES (?, ?, ?, ?)'
  );

  let imported = 0;
  let skipped = 0;
  let examsImported = 0;
  let examsSkipped = 0;
  let notesImported = 0;
  let notesSkipped = 0;
  let dividersImported = 0;
  let dividersSkipped = 0;
  let quotesImported = 0;
  let quotesSkipped = 0;
  let dislikesImported = 0;
  let dislikesSkipped = 0;
  let settingsRestored = false;

  const run = db.transaction(() => {
    const importedIds = new Map();
    const pendingLinks = [];

    for (const t of todos) {
      // A backup file is untrusted input like any other body (AR-1), so it goes
      // through the same sanitisers as POST /todos rather than a bare slice().
      const title = sanitizeTitle(t.title);
      if (title === null) { skipped++; continue; }
      const description = sanitizeDescription(t.description);
      if (description === null) { skipped++; continue; }
      const listName = resolveListName(t);
      if (!listName) { skipped++; continue; }
      const day = validateDayAssigned(t.day_assigned);
      if (day === false) { skipped++; continue; }
      const key = todoKey(title, listName, t.created_at);
      if (existingIds.has(key)) { skipped++; continue; }
      const listId = ensureList(listName.slice(0, 40), resolveListColor(t));
      const now = new Date().toISOString();
      // A malformed recurrence field costs the recurrence, never the whole todo.
      const interval = validateRecurrenceInterval(t.recurrence_interval_days);
      const pattern = validateRecurrencePattern(t.recurrence_pattern);
      const result = insert.run(
        req.user.id,
        title,
        description,
        listId,
        t.completed ? 1 : 0,
        t.archived ? 1 : 0,
        day,
        t.approx_time ? String(t.approx_time).slice(0, 50) : null,
        Number.isInteger(t.planner_order) ? t.planner_order : null,
        cleanIsoDatetime(t.completed_at),
        cleanIsoDatetime(t.created_at) || now,
        now,
        interval === false ? null : interval,
        pattern === false ? null : pattern,
      );
      importedIds.set(key, result.lastInsertRowid);
      if (t.recurrence_parent_created_at) {
        pendingLinks.push({
          id: result.lastInsertRowid,
          parentKey: todoKey(
            t.recurrence_parent_title,
            t.recurrence_parent_list_name,
            t.recurrence_parent_created_at,
          ),
        });
      }
      imported++;
    }

    // Second pass: the template may have been inserted after its instances.
    // Without this the scheduler cannot see the instances, and materialises
    // duplicates for days that are already filled.
    for (const link of pendingLinks) {
      const parentId = importedIds.get(link.parentKey) ?? existingIds.get(link.parentKey);
      if (parentId && parentId !== link.id) linkToTemplate.run(parentId, link.id, req.user.id);
    }

    if (Array.isArray(backupExams)) {
      for (const e of backupExams) {
        if (!e.title || typeof e.title !== 'string' || e.title.trim().length === 0) { examsSkipped++; continue; }
        const examDate = validateDayAssigned(e.exam_date);
        if (examDate === false) { examsSkipped++; continue; }
        const key = `${e.title.trim().slice(0, 200)}|${examDate}`;
        if (existingExamSet.has(key)) { examsSkipped++; continue; }
        const now = new Date().toISOString();
        insertExam.run(
          req.user.id,
          e.title.trim().slice(0, 200),
          examDate,
          cleanIsoDatetime(e.created_at) || now,
          now,
        );
        existingExamSet.add(key);
        examsImported++;
      }
    }

    if (Array.isArray(backupNotes)) {
      for (const n of backupNotes) {
        const date = validateDayAssigned(n.date);
        const note = sanitizeDayNote(n.note ?? '');
        if (!date || note === '') { notesSkipped++; continue; }
        const result = insertNote.run(
          req.user.id,
          date,
          note,
          cleanIsoDatetime(n.updated_at) || new Date().toISOString(),
        );
        if (result.changes > 0) notesImported++; else notesSkipped++;
      }
    }

    // Absent on any file written before version 7, which restores as zero
    // dividers rather than as a failure.
    if (Array.isArray(backupDividers)) {
      // (date, planner_order) is the identity here: todos and dividers share
      // one dense sequence per day, so two dividers cannot hold the same slot.
      // That is also what makes a repeated restore a no-op, the way the day
      // note upsert is, rather than a column of duplicated rules.
      const existingSlots = new Set(db.prepare(
        'SELECT date, planner_order FROM day_dividers WHERE user_id = ?'
      ).all(req.user.id).map(r => `${r.date}|${r.planner_order}`));
      const perDay = new Map(db.prepare(
        'SELECT date, COUNT(*) AS n FROM day_dividers WHERE user_id = ? GROUP BY date'
      ).all(req.user.id).map(r => [r.date, r.n]));

      for (const d of backupDividers) {
        const date = validateDayAssigned(d?.date);
        const order = Number.isSafeInteger(d?.planner_order) && d.planner_order >= 0 ? d.planner_order : null;
        // The same per-day cap POST /api/day-dividers enforces: a backup file
        // is untrusted input and must not be a way around it (AR-1).
        const full = (perDay.get(date) ?? 0) >= MAX_DIVIDERS_PER_DAY;
        if (!date || order === null || full || existingSlots.has(`${date}|${order}`)) {
          dividersSkipped++;
          continue;
        }
        insertDivider.run(req.user.id, date, order, cleanIsoDatetime(d.created_at) || new Date().toISOString());
        existingSlots.add(`${date}|${order}`);
        perDay.set(date, (perDay.get(date) ?? 0) + 1);
        dividersImported++;
      }
    }

    // Uploaded quotes. Validated with the same parser the live import uses, so
    // a hand-edited backup cannot put anything in the table that an upload
    // could not (AR-1). ON CONFLICT DO NOTHING makes a repeated restore a
    // no-op rather than a duplicate.
    if (Array.isArray(backupQuotes)) {
      const insertQuote = db.prepare(
        'INSERT INTO quotes (user_id, text, author, wikipedia, source) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING'
      );
      const builtInExists = db.prepare('SELECT 1 FROM quotes WHERE user_id IS NULL AND text = ?');
      for (const q of backupQuotes) {
        const text = typeof q?.text === 'string' ? q.text.trim() : '';
        const author = typeof q?.author === 'string' ? q.author.trim() : '';
        if (!text || !author || text.length > 1000 || author.length > 200) { quotesSkipped++; continue; }
        if (builtInExists.get(text)) { quotesSkipped++; continue; }
        const changes = insertQuote.run(
          req.user.id, text, author, safeBackupUrl(q?.wikipedia), safeBackupUrl(q?.source)
        ).changes;
        if (changes > 0) quotesImported++; else quotesSkipped++;
      }
    }

    // Dislikes arrive as quote text and are matched against whatever that text
    // resolves to here -- a built-in on this machine, or a quote just restored
    // above. Text that matches nothing is skipped rather than invented.
    if (Array.isArray(backupDislikes)) {
      const findVisible = db.prepare(
        'SELECT id FROM quotes WHERE text = ? AND (user_id IS NULL OR user_id = ?)'
      );
      const setDisliked = db.prepare(
        'INSERT INTO quote_state (user_id, quote_id, disliked) VALUES (?, ?, 1) ' +
        'ON CONFLICT(user_id, quote_id) DO UPDATE SET disliked = 1'
      );
      for (const text of backupDislikes) {
        if (typeof text !== 'string' || !text.trim()) { dislikesSkipped++; continue; }
        const row = findVisible.get(text.trim(), req.user.id);
        if (!row) { dislikesSkipped++; continue; }
        setDisliked.run(req.user.id, row.id);
        dislikesImported++;
      }
    }

    settingsRestored = restoreSettings(backupSettings, req.log || log, req.user.id);
  });

  run();
  res.json({
    imported, skipped, examsImported, examsSkipped,
    notesImported, notesSkipped, dividersImported, dividersSkipped, settingsRestored,
    quotesImported, quotesSkipped, dislikesImported, dislikesSkipped,
  });
});

module.exports = router;
