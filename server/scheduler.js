const cron = require('node-cron');
const { log } = require('./logger');
const db = require('./db');
const { decryptEmail } = require('./crypto');
const { sendDailySummary } = require('./mailer');
const { materializeWindowForUser } = require('./recurrence');
const { localDayBoundsUtc } = require('./time');

// Intl.DateTimeFormat instances are expensive to construct; cache by key.
const dtfCache = new Map();
function dtf(locale, tz, opts) {
  const key = `${locale}|${tz}|${JSON.stringify(opts)}`;
  if (!dtfCache.has(key)) {
    dtfCache.set(key, new Intl.DateTimeFormat(locale, { timeZone: tz, ...opts }));
  }
  return dtfCache.get(key);
}

function hhmm(tz, now) {
  return dtf('en-GB', tz, { hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
}

function isoDate(tz, now) {
  return dtf('en-CA', tz, { year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

async function materializeRecurrencesAtLocalMidnight(now) {
  let users;
  try {
    users = db.prepare(
      'SELECT DISTINCT u.id, u.notify_tz FROM users u INNER JOIN todos t ON t.user_id = u.id WHERE (t.recurrence_interval_days IS NOT NULL OR t.recurrence_pattern IS NOT NULL) AND t.archived = 0 AND t.recurrence_parent_id IS NULL'
    ).all();
  } catch (err) {
    log.error('scheduler recurrence query failed', { err });
    return;
  }

  for (const u of users) {
    try {
      const tz = u.notify_tz || 'UTC';
      if (hhmm(tz, now) !== '00:00') continue;

      const total = materializeWindowForUser(u.id, tz);
      if (total > 0) log.info('scheduler materialized recurrences', { count: total, userId: u.id });
    } catch (err) {
      log.error('scheduler recurrence materialization failed', { userId: u.id, err });
    }
  }
}

async function sendDueSummaries(now) {
  let users;
  try {
    users = db.prepare(
      `SELECT id, email, notify_email_enc, notify_time, notify_tz, notify_last_sent FROM users
       WHERE notify_enabled = 1`
    ).all();
  } catch (err) {
    log.error('scheduler db query failed', { err });
    return;
  }

  for (const user of users) {
    let todayStr, tomorrowStr;
    try {
      const tz = user.notify_tz || 'UTC';
      const userHhmm = hhmm(tz, now);
      todayStr = isoDate(tz, now);
      const tomorrowDate = new Date(todayStr + 'T12:00:00Z');
      tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1);
      tomorrowStr = isoDate(tz, tomorrowDate);

      // Send when user-local time is at or past notify_time and we haven't sent today.
      if (user.notify_last_sent && user.notify_last_sent >= todayStr) continue;
      if (userHhmm < user.notify_time) continue;

      if (!user.notify_email_enc) continue;
      const toEmail = decryptEmail(user.notify_email_enc);

      const { startIso, endIso } = localDayBoundsUtc(todayStr, tz);
      const completedTodos = db.prepare(
        `SELECT t.title, t.approx_time, l.name AS list_name, l.color AS list_color
         FROM todos t JOIN lists l ON l.id = t.list_id
         WHERE t.user_id = ? AND t.completed = 1
           AND t.completed_at >= ? AND t.completed_at < ?`
      ).all(user.id, startIso, endIso);

      const uncompletedTodos = db.prepare(
        `SELECT t.title, t.approx_time, l.name AS list_name, l.color AS list_color
         FROM todos t JOIN lists l ON l.id = t.list_id
         WHERE t.user_id = ? AND t.day_assigned = ? AND t.completed = 0 AND t.archived = 0`
      ).all(user.id, todayStr);

      const tomorrowTodos = db.prepare(
        `SELECT t.title, t.approx_time, l.name AS list_name, l.color AS list_color
         FROM todos t JOIN lists l ON l.id = t.list_id
         WHERE t.user_id = ? AND t.day_assigned = ? AND t.completed = 0 AND t.archived = 0
         ORDER BY t.planner_order ASC`
      ).all(user.id, tomorrowStr);

      if (completedTodos.length + uncompletedTodos.length + tomorrowTodos.length === 0) {
        db.prepare('UPDATE users SET notify_last_sent = ? WHERE id = ?').run(todayStr, user.id);
        continue;
      }

      const userName = (user.email || '').split('@')[0] || 'there';
      const dateStr = now.toLocaleDateString('en-GB', {
        timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      });
      const tomorrowDateStr = tomorrowDate.toLocaleDateString('en-GB', {
        timeZone: tz, weekday: 'long', day: 'numeric', month: 'long',
      });
      const hour = parseInt(dtf('en-GB', tz, { hour: 'numeric', hour12: false }).format(now), 10);

      await sendDailySummary(toEmail, {
        completedTodos,
        uncompletedTodos,
        tomorrowTodos,
        dateStr,
        tomorrowStr: tomorrowDateStr,
        userName,
        hour,
      });

      db.prepare('UPDATE users SET notify_last_sent = ? WHERE id = ?').run(todayStr, user.id);
      log.info('daily summary sent', { userId: user.id, completed: completedTodos.length, open: uncompletedTodos.length, tomorrow: tomorrowTodos.length });
    } catch (err) {
      log.error('daily summary failed', { userId: user.id, err });
    }
  }
}

function startScheduler() {
  cron.schedule('* * * * *', async () => {
    const now = new Date();
    await materializeRecurrencesAtLocalMidnight(now);
    await sendDueSummaries(now);
  });

  log.info('scheduler started', { jobs: 'daily summary, recurrence materialization' });
}

module.exports = { startScheduler };
