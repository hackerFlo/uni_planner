const cron = require('node-cron');
const db = require('./db');
const { decryptEmail } = require('./crypto');
const { sendDailySummary } = require('./mailer');

function startScheduler() {
  cron.schedule('* * * * *', async () => {
    const now = new Date();
    const hhmm = now.toTimeString().slice(0, 5); // "HH:MM" in server local time
    const today = now.toISOString().slice(0, 10); // "YYYY-MM-DD" UTC

    let users;
    try {
      users = db.prepare(
        `SELECT id, notify_email_enc FROM users
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

        const todos = db.prepare(
          `SELECT title, description, list_type FROM todos
           WHERE user_id = ? AND completed = 1
             AND completed_at >= ? AND completed_at < ?`
        ).all(user.id, `${today}T00:00:00.000Z`, `${today}T23:59:59.999Z`);

        if (todos.length > 0) {
          const dateStr = now.toLocaleDateString('en-GB', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
          });
          await sendDailySummary(toEmail, todos, dateStr);
          console.log(`[scheduler] Sent daily summary to user ${user.id} (${todos.length} tasks)`);
        }

        db.prepare('UPDATE users SET notify_last_sent = ? WHERE id = ?').run(today, user.id);
      } catch (err) {
        console.error(`[scheduler] Failed for user ${user.id}:`, err.message);
      }
    }
  });

  console.log('[scheduler] Daily summary scheduler started');
}

module.exports = { startScheduler };
