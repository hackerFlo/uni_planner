const { createHash, randomUUID } = require('node:crypto');
const { z } = require('zod');
const { DomainError } = require('../domain/errors');
const { parse, mutationControlSchema } = require('../domain/schemas');
const { assertVersion } = require('../domain/mutation');
const { encryptEmail, decryptEmail } = require('../crypto');
const { localDayBoundsUtc } = require('../time');

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const EMAIL_RE = /^[^\s@]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;
function validEmail(value) {
  // eslint-disable-next-line no-control-regex -- prevent SMTP header injection
  return value.length <= 254 && !/[\x00-\x1f\x7f]/.test(value) && EMAIL_RE.test(value);
}
function validTimezone(value) {
  try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; }
  catch { return false; } // Invalid user-provided timezones are validation failures.
}
const notificationSchemas = {
  update: z.strictObject({
    notify_enabled: z.boolean().optional(),
    notify_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
    notify_email: z.string().refine(value => value === '' || validEmail(value)).optional(),
    notify_tz: z.string().min(1).max(64).regex(/^[A-Za-z_]+(?:\/[A-Za-z_+\-0-9]+){0,2}$/).refine(validTimezone).optional(),
  }).refine(value => Object.keys(value).length > 0),
  sendTest: mutationControlSchema,
};

function defaultAuthorize(context) {
  if (!Number.isSafeInteger(context?.userId) || context.userId < 1 || context.actor !== 'web') {
    throw new DomainError('FORBIDDEN', 'A trusted authorized principal is required', 403);
  }
}

function userSettings(db, userId) {
  const row = db.prepare('SELECT notify_enabled,notify_time,notify_email_enc,notify_tz,email FROM users WHERE id=?').get(userId);
  if (!row) throw new DomainError('AUTH_REQUIRED', 'Authentication required', 401);
  return row;
}

function protectedEmail(action) {
  try { return action(); }
  catch { throw new DomainError('UPSTREAM_UNAVAILABLE', 'Encryption not configured or stored address unreadable', 500); }
}

function settings(db, userId) {
  const row = userSettings(db, userId);
  return { notify_enabled: Boolean(row.notify_enabled), notify_time: row.notify_time || '22:00',
    notify_tz: row.notify_tz || 'UTC', notify_email: row.notify_email_enc ? protectedEmail(() => decryptEmail(row.notify_email_enc)) : '' };
}

function update(db, userId, input) {
  userSettings(db, userId);
  const updates = {};
  for (const field of ['notify_time', 'notify_tz']) if (input[field] !== undefined) updates[field] = input[field];
  if (input.notify_enabled !== undefined) updates.notify_enabled = Number(input.notify_enabled);
  if (input.notify_email !== undefined) updates.notify_email_enc = input.notify_email === '' ? null : protectedEmail(() => encryptEmail(input.notify_email));
  const keys = Object.keys(updates);
  db.prepare(`UPDATE users SET ${keys.map(key => `${key}=?`).join(',')} WHERE id=?`).run(...keys.map(key => updates[key]), userId);
  return settings(db, userId);
}

function currentVersion(db, userId) {
  const value = db.prepare('SELECT epoch,revision FROM planner_versions WHERE user_id=?').get(userId);
  if (!value) throw new DomainError('AUTH_REQUIRED', 'Authentication required', 401);
  return value;
}

function dateParts(timestamp, timeZone) {
  const now = new Date(timestamp);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const tomorrowDate = new Date(`${today}T12:00:00Z`);
  tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1);
  // Advance the calendar date directly; formatting UTC noon in UTC+14 would
  // otherwise skip a local day. Labels use UTC for this calendar-only value.
  return { today, tomorrow: tomorrowDate.toISOString().slice(0, 10),
    dateStr: now.toLocaleDateString('en-GB', { timeZone, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    tomorrowStr: tomorrowDate.toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }),
    hour: Number(new Intl.DateTimeFormat('en-GB', { timeZone, hour: 'numeric', hour12: false }).format(now)),
    ...localDayBoundsUtc(today, timeZone) };
}

function summaryTasks(db, userId, dates) {
  const select = `SELECT t.title,t.approx_time,l.name AS list_name,l.color AS list_color
    FROM todos t JOIN lists l ON l.id=t.list_id AND l.user_id=t.user_id WHERE t.user_id=?`;
  const completedTodos = db.prepare(`${select} AND t.completed=1 AND t.completed_at>=? AND t.completed_at<? LIMIT 1001`).all(userId, dates.startIso, dates.endIso);
  const uncompletedTodos = db.prepare(`${select} AND t.day_assigned=? AND t.completed=0 AND t.archived=0 LIMIT 1001`).all(userId, dates.today);
  const tomorrowTodos = db.prepare(`${select} AND t.day_assigned=? AND t.archived=0 ORDER BY t.planner_order ASC LIMIT 1001`).all(userId, dates.tomorrow);
  if ([completedTodos, uncompletedTodos, tomorrowTodos].some(rows => rows.length > 1000)) {
    throw new DomainError('RESULT_TOO_LARGE', 'Daily summary contains too many tasks');
  }
  return { completedTodos, uncompletedTodos, tomorrowTodos };
}

function deliverySnapshot(db, userId, timestamp, attemptId) {
  const row = userSettings(db, userId);
  if (!row.notify_email_enc) throw new DomainError('VALIDATION_ERROR', 'No notification email saved. Save your settings first.');
  const recipient = protectedEmail(() => decryptEmail(row.notify_email_enc));
  if (!validEmail(recipient)) throw new DomainError('VALIDATION_ERROR', 'Saved notification address is invalid');
  const timezone = row.notify_tz || 'UTC';
  if (!validTimezone(timezone)) throw new DomainError('VALIDATION_ERROR', 'Saved timezone is invalid');
  const dates = dateParts(timestamp, timezone);
  return { recipient, payload: { ...summaryTasks(db, userId, dates), dateStr: dates.dateStr,
    tomorrowStr: dates.tomorrowStr, hour: dates.hour, userName: (row.email || '').split('@')[0] || 'there',
    messageId: `<notification-${attemptId}@uni-planner.invalid>` } };
}

function expireAttempts(db, userId, timestamp, timeoutMs) {
  db.prepare(`UPDATE notification_attempts SET state='unknown',error_code='DELIVERY_UNKNOWN',updated_at=?
    WHERE user_id=? AND state='pending' AND created_at<=?`).run(timestamp, userId, timestamp - timeoutMs);
  db.prepare("DELETE FROM notification_attempts WHERE user_id=? AND state!='pending' AND expires_at<=?").run(userId, timestamp);
}

function replayAttempt(row, hash) {
  if (row.input_hash !== hash) throw new DomainError('CONFLICT', 'Retry key was used for different input', 409);
  if (row.state === 'unknown') throw new DomainError('DELIVERY_UNKNOWN', 'Delivery may have completed. Do not retry with a new key.', 409);
  if (row.state === 'failed') throw new DomainError(row.error_code || 'FORBIDDEN', 'Delivery was not started for this attempt.', 403);
  return { ok: row.state === 'sent', status: row.state === 'sent' ? 'sent' : 'in_progress', attemptId: row.id, replayed: true };
}

function enforceSendQuota(db, userId, timestamp) {
  const { n, pending } = db.prepare(`SELECT COUNT(*) AS n,SUM(state='pending') AS pending
    FROM notification_attempts WHERE user_id=? AND created_at>?`).get(userId, timestamp - HOUR_MS);
  if (n >= 3 || pending) throw new DomainError('RATE_LIMITED', 'Test email limit reached; try later.', 429);
}

function reserve(db, context, input, options) {
  const timestamp = options.now();
  // Commit stale-attempt recovery even when replay subsequently throws an
  // unknown-delivery error; rolling it back could permit a late success claim.
  db.transaction(() => expireAttempts(db, context.userId, timestamp, options.timeoutMs))();
  return db.transaction(() => {
    options.authorize(context, 'send_test_notification');
    const hash = createHash('sha256').update(JSON.stringify(input.expectedVersion)).digest('hex');
    const prior = db.prepare('SELECT * FROM notification_attempts WHERE user_id=? AND retry_key=?').get(context.userId, input.idempotencyKey);
    if (prior) return { replay: replayAttempt(prior, hash) };
    if (!options.enabled()) throw new DomainError('UPSTREAM_UNAVAILABLE', 'Email delivery is not configured.', 503);
    assertVersion(currentVersion(db, context.userId), input.expectedVersion);
    enforceSendQuota(db, context.userId, timestamp);
    const id = randomUUID();
    const snapshot = deliverySnapshot(db, context.userId, timestamp, id);
    db.prepare(`INSERT INTO notification_attempts(id,user_id,retry_key,input_hash,epoch,revision,state,created_at,updated_at,expires_at)
      VALUES(?,?,?,?,?,?,'pending',?,?,?)`).run(id, context.userId, input.idempotencyKey, hash,
      input.expectedVersion.epoch, input.expectedVersion.revision, timestamp, timestamp, timestamp + DAY_MS);
    return { id, ...snapshot };
  })();
}

function transition(db, userId, id, state, timestamp, errorCode = null) {
  return db.prepare("UPDATE notification_attempts SET state=?,error_code=?,updated_at=? WHERE id=? AND user_id=? AND state='pending'")
    .run(state, errorCode, timestamp, id, userId).changes;
}

async function boundedSend(sender, recipient, payload, timeoutMs) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Delivery deadline exceeded')), timeoutMs); });
  try { await Promise.race([sender(recipient, payload), timeout]); }
  finally { clearTimeout(timer); }
}

async function deliver(db, context, attempt, options) {
  try { options.authorize(context, 'send_test_notification'); }
  catch (error) {
    transition(db, context.userId, attempt.id, 'failed', options.now(), 'FORBIDDEN');
    throw error;
  }
  try { await boundedSend(options.sender, attempt.recipient, attempt.payload, options.timeoutMs); }
  catch {
    transition(db, context.userId, attempt.id, 'unknown', options.now(), 'DELIVERY_UNKNOWN');
    throw new DomainError('DELIVERY_UNKNOWN', 'Delivery may have completed. Do not retry with a new key.', 409);
  }
  if (!transition(db, context.userId, attempt.id, 'sent', options.now())) {
    throw new DomainError('DELIVERY_UNKNOWN', 'Delivery completion could not be confirmed.', 409);
  }
  return { ok: true, status: 'sent', attemptId: attempt.id, replayed: false, sentTo: attempt.recipient };
}

function senderOptions(options) {
  const { sendDailySummary, isMailerEnabled } = require('../mailer');
  return { sender: options.sendTestEmail || sendDailySummary,
    enabled: options.sendTestEmail ? () => true : isMailerEnabled };
}

function createNotificationService(db, options = {}) {
  const authorize = (context, operation) => {
    const result = (options.authorize || defaultAuthorize)(context, operation);
    if (result && typeof result.then === 'function') throw new DomainError('FORBIDDEN', 'Synchronous live authorization is required', 403);
  };
  const config = { ...senderOptions(options), authorize, now: options.now || Date.now,
    timeoutMs: Math.min(15000, Math.max(1, options.timeoutMs || 10000)) };
  return {
    settings(context) { authorize(context, 'get_notification_settings'); return settings(db, context.userId); },
    update(context, args) {
      authorize(context, 'update_notification_settings');
      const input = parse(notificationSchemas.update, args);
      return db.transaction(() => update(db, context.userId, input))();
    },
    async sendTest(context, args) {
      authorize(context, 'send_test_notification');
      const input = parse(notificationSchemas.sendTest, args);
      const attempt = reserve(db, context, input, config);
      return attempt.replay || deliver(db, context, attempt, config);
    },
  };
}

module.exports = { createNotificationService, notificationSchemas };
