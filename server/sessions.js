const { randomUUID } = require('node:crypto');
const db = require('./db');
const { SESSION_COOKIE_MAX_AGE_MS } = require('./config');

// One row per signed-in device, identified by the `sid` claim in the JWT.
//
// There are deliberately two revocation levers and they mean different things:
//   sid            -- this device. Deleting the row logs out one browser.
//   token_version  -- every device at once. Bumped on a password or email
//                     change, because that is the "someone may have my
//                     credentials" lever and it has to be total.
//
// The row's lifetime is derived from the cookie's, so the cookie, the JWT `exp`
// and the row cannot drift apart into a session that is valid by one measure and
// dead by another.

function createSession(userId, { now = new Date() } = {}) {
  const id = randomUUID();
  const expiresAt = new Date(now.getTime() + SESSION_COOKIE_MAX_AGE_MS).toISOString();
  db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)')
    .run(id, userId, expiresAt);
  return id;
}

// Scoped by user_id as well as id: a session id is a bearer-ish value, and
// pairing it with the token's user makes a mismatched pair fail closed (AR-2).
function findLiveSession(sessionId, userId, { now = new Date() } = {}) {
  if (typeof sessionId !== 'string' || sessionId === '') return null;
  const row = db.prepare(
    'SELECT id, expires_at FROM sessions WHERE id = ? AND user_id = ?'
  ).get(sessionId, userId);
  if (!row) return null;
  return row.expires_at > now.toISOString() ? row : null;
}

function deleteSession(sessionId, userId) {
  return db.prepare('DELETE FROM sessions WHERE id = ? AND user_id = ?')
    .run(sessionId, userId).changes;
}

function deleteAllSessions(userId) {
  return db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId).changes;
}

// Expired rows are already refused by findLiveSession; this only stops the table
// growing forever. Called on login and once a day by the scheduler.
function sweepExpiredSessions({ now = new Date() } = {}) {
  return db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now.toISOString()).changes;
}

module.exports = {
  createSession,
  findLiveSession,
  deleteSession,
  deleteAllSessions,
  sweepExpiredSessions,
};
