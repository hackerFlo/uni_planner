const { DomainError } = require('../domain/errors');

const CAPABILITIES = Object.freeze(['planner_read', 'planner_write', 'notifications', 'export']);

function validCapabilities(value) {
  return Array.isArray(value) && value.includes('planner_read') && value.length <= CAPABILITIES.length
    && new Set(value).size === value.length && value.every(item => CAPABILITIES.includes(item));
}

function validateIdentity(identity) {
  if (!identity || !['issuer', 'subject'].every(key => typeof identity[key] === 'string'
    && identity[key].length > 0 && identity[key].length <= 512)) {
    throw new DomainError('AUTH_REQUIRED', 'A verified identity is required.', 401);
  }
}

function storedCapabilities(row) {
  if (!row) return [];
  try {
    const value = JSON.parse(row.capabilities);
    return validCapabilities(value) ? value : [];
  } catch {
    // Invalid persisted authorization state must fail closed.
    return [];
  }
}

function readStatus(db, userId) {
  const row = db.prepare(`SELECT l.capabilities, l.revoked_at, l.token_version,
    u.token_version AS current_version FROM agent_links l
    JOIN users u ON u.id = l.user_id WHERE l.user_id = ?`).get(userId);
  const capabilities = storedCapabilities(row);
  const linked = Boolean(row && !row.revoked_at && row.token_version === row.current_version && capabilities.length);
  return { linked, capabilities: linked ? capabilities : [], revokedAt: row?.revoked_at ?? null,
    requiresReenrollment: Boolean(row && !linked) };
}

function enroll(db, userId, identity, capabilities) {
  validateIdentity(identity);
  if (!validCapabilities(capabilities)) {
    throw new DomainError('VALIDATION_ERROR', 'Select valid planner permissions.', 400);
  }
  return db.transaction(() => {
    const user = db.prepare('SELECT token_version FROM users WHERE id = ?').get(userId);
    if (!user) throw new DomainError('AUTH_REQUIRED', 'Authentication required.', 401);
    assertBinding(db, userId, identity);
    db.prepare(`INSERT INTO agent_links (user_id, issuer, subject, token_version, capabilities)
      VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET
      token_version = excluded.token_version, capabilities = excluded.capabilities, revoked_at = NULL`)
      .run(userId, identity.issuer, identity.subject, user.token_version, JSON.stringify(capabilities));
    return readStatus(db, userId);
  })();
}

function assertBinding(db, userId, identity) {
  const account = db.prepare('SELECT issuer, subject FROM agent_links WHERE user_id = ?').get(userId);
  // This credential lookup intentionally precedes account resolution: identity
  // is supplied only by the verified assertion, never by a tool argument.
  const binding = db.prepare('SELECT user_id FROM agent_links WHERE issuer = ? AND subject = ?')
    .get(identity.issuer, identity.subject);
  if ((account && (account.issuer !== identity.issuer || account.subject !== identity.subject))
    || (binding && binding.user_id !== userId)) {
    throw new DomainError('CONFLICT', 'This connection cannot be enrolled.', 409);
  }
}

function resolve(db, identity) {
  validateIdentity(identity);
  const binding = db.prepare('SELECT user_id FROM agent_links WHERE issuer = ? AND subject = ?')
    .get(identity.issuer, identity.subject);
  const status = binding && readStatus(db, binding.user_id);
  if (!status?.linked) throw new DomainError('LINK_REQUIRED', 'Enroll this connection on the website.', 403);
  return Object.freeze({ userId: binding.user_id, actor: 'mcp', capabilities: Object.freeze(status.capabilities) });
}

function createLinkService(db) {
  return {
    enroll: (userId, identity, capabilities) => enroll(db, userId, identity, capabilities),
    resolve: identity => resolve(db, identity),
    status: userId => readStatus(db, userId),
    revoke(userId) {
      db.prepare('UPDATE agent_links SET revoked_at = COALESCE(revoked_at, ?) WHERE user_id = ?')
        .run(new Date().toISOString(), userId);
      return readStatus(db, userId);
    },
  };
}

module.exports = { createLinkService, validCapabilities, CAPABILITIES };
