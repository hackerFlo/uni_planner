const cron = require('node-cron');
const db = require('./db');
const { decryptEmail } = require('./crypto');
const { sendDailySummary } = require('./mailer');

function startScheduler() {
  cron.schedule('* * * * *', async () => {
    const now = new Date();
    const hhmm = now.toTimeString().slice(0, 5);
    const today = now.toISOString().slice(0, 10);
    const tomorrowDate = new Date(now);
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrow = tomorrowDate.toISOString().slice(0, 10);

    let users;
    try {
      users = db.prepare(
        `SELECT id, email, notify_email_enc FROM users
         WHERE notify_enabled = 1 AND notify_time = ?
           AND (notify_last_sent IS NULL OR notify_last_sent < ?)`
      ).all(hhmm, today);
    } catch (err) {
      console.error('[scheduler] DB query failed:', err.message);
      return;
    }

    for (const user of users) {
      try {
        if (!user.notify_email_enc) continue;
        const toEmail = decryptEmail(user.notify_email_enc);

        const completedTodos = db.prepare(
          `SELECT title, list_type, approx_time FROM todos
           WHERE user_id = ? AND completed = 1
             AND completed_at >= ? AND completed_at < ?`
        ).all(user.id, `${today}T00:00:00.000Z`, `${today}T23:59:59.999Z`);

        const uncompletedTodos = db.prepare(
          `SELECT title, list_type, approx_time FROM todos
           WHERE user_id = ? AND day_assigned = ? AND completed = 0 AND archived = 0`
        ).all(user.id, today);

        const tomorrowTodos = db.prepare(
          `SELECT title, list_type, approx_time FROM todos
           WHERE user_id = ? AND day_assigned = ? AND archived = 0
           ORDER BY planner_order ASC`
        ).all(user.id, tomorrow);

        if (completedTodos.length + uncompletedTodos.length + tomorrowTodos.length === 0) {
          db.prepare('UPDATE users SET notify_last_sent = ? WHERE id = ?').run(today, user.id);
          continue;
        }

        const userName = (user.email || '').split('@')[0] || 'there';
        const dateStr = now.toLocaleDateString('en-GB', {
          weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
        });
        const tomorrowStr = tomorrowDate.toLocaleDateString('en-GB', {
          weekday: 'long', day: 'numeric', month: 'long',
        });

        await sendDailySummary(toEmail, {
          completedTodos,
          uncompletedTodos,
          tomorrowTodos,
          dateStr,
          tomorrowStr,
          userName,
          hour: now.getHours(),
        });

        db.prepare('UPDATE users SET notify_last_sent = ? WHERE id = ?').run(today, user.id);
        console.log(`[scheduler] Sent daily summary to user ${user.id} (${completedTodos.length} completed, ${uncompletedTodos.length} open, ${tomorrowTodos.length} tomorrow)`);
      } catch (err) {
        console.error(`[scheduler] Failed for user ${user.id}:`, err.message);
      }
    }
  });

  console.log('[scheduler] Daily summary scheduler started');
}

module.exports = { startScheduler };
