const { decryptEmail } = require('../crypto');
const { settingsSchema, DEFAULT_PREFERENCES } = require('./preferences');
const { log } = require('../logger');
function exportSettings(db, userId, rlog) {
  const row = db.prepare(
    'SELECT notify_enabled, notify_time, notify_email_enc, notify_tz FROM users WHERE id = ?'
  ).get(userId);
  let notifyEmail = '';
  if (row?.notify_email_enc) {
    try {
      notifyEmail = decryptEmail(row.notify_email_enc);
    } catch (err) {
      // A key rotated away costs the address, never the rest of the backup.
      rlog.warn('backup export: notification email unreadable', { userId: userId, err });
    }
  }
  return {
    notify_enabled: !!row?.notify_enabled,
    notify_time: row?.notify_time || '22:00',
    notify_email: notifyEmail,
    notify_tz: row?.notify_tz || 'UTC',
  };
}

function buildSnapshot(db, userId, rlog = log) {
  const lists = db.prepare(
    'SELECT id, name, color, sort_order FROM lists WHERE user_id = ? ORDER BY sort_order ASC'
  ).all(userId);

  // The template's own identity travels with each generated instance, because
  // recurrence_parent_id is a local row id and means nothing after a restore.
  const todos = db.prepare(
    `SELECT t.title, t.description, l.name AS list_name, t.completed, t.archived,
            t.day_assigned, t.approx_time, t.planner_order, t.completed_at, t.created_at,
            t.agent_activity_at, t.agent_activity_action,
            t.recurrence_interval_days, t.recurrence_pattern,
            parent.title      AS recurrence_parent_title,
            parent.created_at AS recurrence_parent_created_at,
            pl.name           AS recurrence_parent_list_name
       FROM todos t
       JOIN lists l ON l.id = t.list_id AND l.user_id = t.user_id
       LEFT JOIN todos parent ON parent.id = t.recurrence_parent_id AND parent.user_id = t.user_id
       LEFT JOIN lists pl     ON pl.id = parent.list_id            AND pl.user_id = t.user_id
      WHERE t.user_id = ?`
  ).all(userId);

  const exams = db.prepare(
    'SELECT title, exam_date, created_at FROM exams WHERE user_id = ?'
  ).all(userId);

  const dayNotes = db.prepare(
    'SELECT date, note, updated_at FROM day_notes WHERE user_id = ? ORDER BY date ASC'
  ).all(userId);

  // AR-15: user data, and no row id travels -- a divider is identified by the
  // day it sits on and its slot in that day's shared todo/divider sequence.
  const dayDividers = db.prepare(
    'SELECT date, planner_order, created_at FROM day_dividers WHERE user_id = ? ORDER BY date ASC, planner_order ASC'
  ).all(userId);

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
  ).all(userId);

  const quoteDislikes = db.prepare(
    `SELECT q.text FROM quote_state s JOIN quotes q ON q.id = s.quote_id
      WHERE s.user_id = ? AND s.disliked = 1 AND (q.user_id IS NULL OR q.user_id = s.user_id)`
  ).all(userId).map(r => r.text);

  const profiles = db.prepare(
    'SELECT id,label,settings,revision,created_at,updated_at FROM preference_profiles WHERE user_id=? ORDER BY id'
  ).all(userId).map(row => ({ ...row, settings: { ...DEFAULT_PREFERENCES, ...settingsSchema.parse(JSON.parse(row.settings)) } }));

  return {
    version: 9,
    exported_at: new Date().toISOString(),
    lists: lists.map(l => ({ name: l.name, color: l.color, sort_order: l.sort_order })),
    todos,
    exams,
    day_notes: dayNotes,
    day_dividers: dayDividers,
    quotes,
    quote_dislikes: quoteDislikes,
    preference_profiles: profiles,
    settings: exportSettings(db, userId, rlog),
  };
}

module.exports = { buildSnapshot };
