const cron = require('node-cron');
const db = require('./db');
const { decryptEmail } = require('./crypto');
const { sendDailySummary } = require('./mailer');
const { materializeForTemplate } = require('./recurrence');

function startScheduler() {
  cron.schedule('* * * * *', async () => {
    const now = new Date();

    let users;
    try {
      users = db.prepare(
        `SELECT id, email, notify_email_enc, notify_time, notify_tz, notify_last_sent FROM users
         WHERE notify_enabled = 1`
      ).all();
    } catch (err) {
      console.error('[scheduler] DB query failed:', err.message);
      return;
    }

    // Recurrence materialization at user-local midnight for all users with active templates
    let allUsers;
    try {
      allUsers = db.prepare(
        'SELECT DISTINCT u.id, u.notify_tz FROM users u INNER JOIN todos t ON t.user_id = u.id WHERE t.recurrence_interval_days IS NOT NULL AND t.archived = 0 AND t.recurrence_parent_id IS NULL'
      ).all();
    } catch { allUsers = []; }

    for (const u of allUsers) {
      try {
        const tz = u.notify_tz || 'UTC';
        const uHhmm = new Intl.DateTimeFormat('en-GB', {
          timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
        }).format(now);
        if (uHhmm !== '00:00') continue;

        const templates = db.prepare(
          'SELECT id FROM todos WHERE user_id = ? AND recurrence_interval_days IS NOT NULL AND archived = 0 AND recurrence_parent_id IS NULL'
        ).all(u.id);
        let total = 0;
        for (const t of templates) total += materializeForTemplate(t.id, tz);
        if (total > 0) console.log(`[scheduler] Materialized ${total} recurring instances for user ${u.id}`);
      } catch (err) {
        console.error(`[scheduler] Recurrence materialization failed for user ${u.id}:`, err.message);
      }
    }

    for (const user of users) {
      let hhmm, today, tomorrow;
      try {
        const tz = user.notify_tz || 'UTC';
        hhmm = new Intl.DateTimeFormat('en-GB', {
          timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
        }).format(now);
        today = new Intl.DateTimeFormat('en-CA', {
          timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
        }).format(now);
        const tomorrowDate = new Date(today + 'T12:00:00Z');
        tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1);
        tomorrow = new Intl.DateTimeFormat('en-CA', {
          timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
        }).format(tomorrowDate);
      } catch (err) {
        console.error(`[scheduler] Bad notify_tz for user ${user.id}:`, err.message);
        continue;
      }

      // Send when user-local time is at or past notify_time and we haven't sent today.
      // Lexicographic compare is correct for zero-padded "HH:MM".
      if (user.notify_last_sent && user.notify_last_sent >= today) continue;
      if (hhmm < user.notify_time) continue;

      try {
        if (!user.notify_email_enc) continue;
        const toEmail = decryptEmail(user.notify_email_enc);
        const tz = user.notify_tz || 'UTC';

        const completedTodos = db.prepare(
          `SELECT t.title, t.approx_time, l.name AS list_name, l.color AS list_color
           FROM todos t JOIN lists l ON l.id = t.list_id
           WHERE t.user_id = ? AND t.completed = 1
             AND t.completed_at >= ? AND t.completed_at < ?`
        ).all(user.id, `${today}T00:00:00.000Z`, `${today}T23:59:59.999Z`);

        const uncompletedTodos = db.prepare(
          `SELECT t.title, t.approx_time, l.name AS list_name, l.color AS list_color
           FROM todos t JOIN lists l ON l.id = t.list_id
           WHERE t.user_id = ? AND t.day_assigned = ? AND t.completed = 0 AND t.archived = 0`
        ).all(user.id, today);

        const tomorrowTodos = db.prepare(
          `SELECT t.title, t.approx_time, l.name AS list_name, l.color AS list_color
           FROM todos t JOIN lists l ON l.id = t.list_id
           WHERE t.user_id = ? AND t.day_assigned = ? AND t.archived = 0
           ORDER BY t.planner_order ASC`
        ).all(user.id, tomorrow);

        if (completedTodos.length + uncompletedTodos.length + tomorrowTodos.length === 0) {
          db.prepare('UPDATE users SET notify_last_sent = ? WHERE id = ?').run(today, user.id);
          continue;
        }

        const userName = (user.email || '').split('@')[0] || 'there';
        const dateStr = now.toLocaleDateString('en-GB', {
          timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
        });
        const tomorrowDateObj = new Date(today + 'T12:00:00Z');
        tomorrowDateObj.setUTCDate(tomorrowDateObj.getUTCDate() + 1);
        const tomorrowStr = tomorrowDateObj.toLocaleDateString('en-GB', {
          timeZone: tz, weekday: 'long', day: 'numeric', month: 'long',
        });
        const hour = parseInt(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: 'numeric', hour12: false }).format(now), 10);

        await sendDailySummary(toEmail, {
          completedTodos,
          uncompletedTodos,
          tomorrowTodos,
          dateStr,
          tomorrowStr,
          userName,
          hour,
        });

        db.prepare('UPDATE users SET notify_last_sent = ? WHERE id = ?').run(today, user.id);
        console.log(`[scheduler] Sent daily summary to user ${user.id} (${completedTodos.length} completed, ${uncompletedTodos.length} open, ${tomorrowTodos.length} tomorrow)`);
      } catch (err) {
        console.error(`[scheduler] Failed for user ${user.id}:`, err.message);
      }
    }
  });

  console.log('[scheduler] Daily summary scheduler started (with recurrence materialization)');
}

module.exports = { startScheduler };
