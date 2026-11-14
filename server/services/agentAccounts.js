const { randomBytes } = require('node:crypto');
const { deleteAgentSessions } = require('../sessions');

// 24 random bytes -> 32 url-safe characters (192 bits), inside the login form's
// 128-character ceiling. Shown to the owner once; only its bcrypt hash is kept.
const GENERATED_PASSWORD_BYTES = 24;

const normalizeEmail = email => email.trim().toLowerCase();
const generatePassword = () => randomBytes(GENERATED_PASSWORD_BYTES).toString('base64url');

function publicAccount(row) {
  if (!row) return null;
  return { email: row.email, disabled: Boolean(row.disabled), created_at: row.created_at, last_login_at: row.last_login_at };
}

// Login emails are one namespace shared by owners and agent accounts, otherwise
// the login form could not tell which principal an address means.
function createAgentAccountService(db) {
  const byOwner = db.prepare('SELECT * FROM agent_accounts WHERE owner_user_id = ?');
  const byEmail = db.prepare('SELECT * FROM agent_accounts WHERE email = ?');
  const ownerByEmail = db.prepare('SELECT id FROM users WHERE email = ?');

  function emailInUse(email, { exceptUserId = null, exceptAgentId = null } = {}) {
    const user = ownerByEmail.get(email);
    if (user && user.id !== exceptUserId) return true;
    const agent = byEmail.get(email);
    return Boolean(agent && agent.id !== exceptAgentId);
  }

  // Revoking is both levers at once, like the owner's credential change: the
  // bumped token_version kills tokens in flight, the deleted rows kill replays.
  function revoke(agent) {
    db.prepare('UPDATE agent_accounts SET token_version = token_version + 1 WHERE id = ?').run(agent.id);
    deleteAgentSessions(agent.id);
  }

  function ifPresent(ownerId, action) {
    const agent = byOwner.get(ownerId);
    return agent ? action(agent) : null;
  }

  return {
    normalizeEmail,
    generatePassword,
    emailInUse,
    find: ownerId => publicAccount(byOwner.get(ownerId)),
    findByEmail: email => byEmail.get(email),
    // Returns null when this owner already has an account or the email is taken.
    create: (ownerId, email, passwordHash) => db.transaction(() => {
      if (byOwner.get(ownerId) || emailInUse(email)) return null;
      db.prepare('INSERT INTO agent_accounts (owner_user_id, email, password_hash) VALUES (?, ?, ?)')
        .run(ownerId, email, passwordHash);
      return publicAccount(byOwner.get(ownerId));
    })(),
    resetPassword: (ownerId, passwordHash) => db.transaction(() => ifPresent(ownerId, agent => {
      db.prepare('UPDATE agent_accounts SET password_hash = ? WHERE id = ?').run(passwordHash, agent.id);
      revoke(agent);
      return true;
    }))(),
    setDisabled: (ownerId, disabled) => db.transaction(() => ifPresent(ownerId, agent => {
      db.prepare('UPDATE agent_accounts SET disabled = ? WHERE id = ?').run(Number(disabled), agent.id);
      if (disabled) revoke(agent);
      return publicAccount(byOwner.get(ownerId));
    }))(),
    signOut: ownerId => db.transaction(() => ifPresent(ownerId, agent => { revoke(agent); return true; }))(),
    remove: ownerId => db.prepare('DELETE FROM agent_accounts WHERE owner_user_id = ?').run(ownerId).changes > 0,
    recordLogin: id => db.prepare("UPDATE agent_accounts SET last_login_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").run(id),
  };
}

module.exports = { createAgentAccountService, publicAccount };
