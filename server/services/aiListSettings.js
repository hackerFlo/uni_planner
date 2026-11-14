const { z } = require('zod');
const { DomainError } = require('../domain/errors');

const aiListSettingsSchema = z.strictObject({ enabled: z.boolean() });

function isEnabled(db, userId) {
  const row = db.prepare('SELECT ai_list_enabled FROM users WHERE id=?').get(userId);
  return Boolean(row?.ai_list_enabled);
}

// Enabling sends task text to a third party, so it is refused outright when the
// server has no key rather than being stored as a latent opt-in.
function setEnabled(db, userId, enabled, { available }) {
  if (enabled && !available) {
    throw new DomainError('CONFLICT', 'AI list sorting is not configured on this server', 409);
  }
  const { changes } = db.prepare('UPDATE users SET ai_list_enabled=? WHERE id=?').run(Number(enabled), userId);
  if (changes !== 1) throw new DomainError('AUTH_REQUIRED', 'Authentication required', 401);
  return { ai_list_available: Boolean(available), ai_list_enabled: enabled };
}

module.exports = { aiListSettingsSchema, isEnabled, setEnabled };
