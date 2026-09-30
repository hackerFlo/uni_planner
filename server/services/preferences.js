const { createHash } = require('node:crypto');
const { z } = require('zod');
const { dateSchema, parse } = require('../domain/schemas');
const { DomainError } = require('../domain/errors');

const DEFAULT_PREFERENCES = Object.freeze({ theme: 'system', density: 'comfortable', reduceMotion: false,
  agentActivityIcon: 'fuzzy',
  holidayCountry: 'DE', holidaySubdivision: 'DE-BY', showHolidays: true, showQuotes: true, quotesSnoozedOn: null });
const settingsSchema = z.strictObject({ theme: z.enum(['system', 'light', 'dark']).optional(),
  density: z.enum(['comfortable', 'compact']).optional(), reduceMotion: z.boolean().optional(),
  agentActivityIcon: z.enum(['fuzzy', 'ring', 'robot']).optional(),
  holidayCountry: z.string().regex(/^[A-Z]{2}$/).optional(),
  holidaySubdivision: z.union([z.string().regex(/^[A-Z]{2}-[A-Z0-9]{1,3}$/), z.literal(''), z.null()])
    .transform(value => value === '' ? null : value).optional(),
  showHolidays: z.boolean().optional(), showQuotes: z.boolean().optional(), quotesSnoozedOn: dateSchema.nullable().optional() });
const profileId = z.uuid();
const pageSchema = z.strictObject({ limit: z.number().int().min(1).max(50).default(50), cursor: z.string().max(1024).optional() });
const cursorSchema = z.strictObject({ digest: z.string().regex(/^[a-f0-9]{64}$/), offset: z.number().int().min(0).max(50), limit: z.number().int().min(1).max(50) });
const preferenceSchemas = {
  create: z.strictObject({ id: profileId, label: z.string().trim().min(1).max(80)
    .refine(value => [...value].every(char => char.codePointAt(0) >= 32 && char.codePointAt(0) !== 127)), settings: settingsSchema.default({}) }),
  get: z.strictObject({ id: profileId }),
  update: z.strictObject({ id: profileId, patch: settingsSchema.refine(value => Object.keys(value).length > 0) }),
  reset: z.strictObject({ id: profileId }), list: pageSchema,
};

function profileResult(row) {
  if (!row) throw new DomainError('NOT_FOUND', 'Preference profile not found', 404);
  let settings;
  try { settings = settingsSchema.parse(JSON.parse(row.settings)); }
  catch { throw new DomainError('INTERNAL_ERROR', 'Preference profile could not be loaded', 500); }
  return { id: row.id, label: row.label, settings: { ...DEFAULT_PREFERENCES, ...settings }, revision: row.revision,
    created_at: row.created_at, updated_at: row.updated_at };
}

function ownedProfile(db, userId, id) {
  return db.prepare('SELECT id,label,settings,revision,created_at,updated_at FROM preference_profiles WHERE user_id=? AND id=?').get(userId, id);
}

function createProfile(db, userId, input) {
  return db.transaction(() => {
    const existing = ownedProfile(db, userId, input.id);
    if (existing) return profileResult(existing);
    if (db.prepare('SELECT count(*) AS count FROM preference_profiles WHERE user_id=?').get(userId).count >= 50) {
      throw new DomainError('RATE_LIMITED', 'Preference profile limit reached', 429);
    }
    try {
      db.prepare('INSERT INTO preference_profiles(id,user_id,label,settings) VALUES(?,?,?,?)')
        .run(input.id, userId, input.label, JSON.stringify({ ...DEFAULT_PREFERENCES, ...input.settings }));
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') throw new DomainError('CONFLICT', 'Preference profile cannot be created', 409);
      throw error;
    }
    return profileResult(ownedProfile(db, userId, input.id));
  })();
}

function updateProfile(db, userId, id, patch) {
  return db.transaction(() => {
    const current = profileResult(ownedProfile(db, userId, id));
    const settings = { ...current.settings, ...patch };
    if (JSON.stringify(current.settings) !== JSON.stringify(settings)) {
      db.prepare(`UPDATE preference_profiles SET settings=?,revision=revision+1,
        updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id=? AND id=?`)
        .run(JSON.stringify(settings), userId, id);
    }
    return profileResult(ownedProfile(db, userId, id));
  })();
}

function listProfiles(db, userId, input) {
  const profiles = db.prepare('SELECT id,label,revision,created_at,updated_at FROM preference_profiles WHERE user_id=? ORDER BY id LIMIT 50').all(userId);
  const digest = createHash('sha256').update(JSON.stringify([userId, profiles])).digest('hex');
  let cursor = null;
  if (input.cursor) {
    try { cursor = cursorSchema.parse(JSON.parse(Buffer.from(input.cursor, 'base64url').toString('utf8'))); }
    catch { throw new DomainError('VALIDATION_ERROR', 'Invalid profile cursor'); }
    if (cursor.digest !== digest || cursor.limit !== input.limit) throw new DomainError('CONFLICT', 'Profiles changed; restart pagination', 409);
  }
  const offset = cursor?.offset || 0;
  const end = offset + input.limit;
  return { profiles: profiles.slice(offset, end), nextCursor: end < profiles.length
    ? Buffer.from(JSON.stringify({ digest, offset: end, limit: input.limit })).toString('base64url') : null };
}

function createPreferenceService(db) {
  return {
    list: ({ userId }, args = {}) => listProfiles(db, userId, parse(pageSchema, args)),
    get: ({ userId }, args) => profileResult(ownedProfile(db, userId, parse(preferenceSchemas.get, args).id)),
    create: ({ userId }, args) => createProfile(db, userId, parse(preferenceSchemas.create, args)),
    update: ({ userId }, args) => { const input = parse(preferenceSchemas.update, args); return updateProfile(db, userId, input.id, input.patch); },
    reset: ({ userId }, args) => updateProfile(db, userId, parse(preferenceSchemas.reset, args).id, DEFAULT_PREFERENCES),
  };
}

module.exports = { createPreferenceService, preferenceSchemas, settingsSchema, DEFAULT_PREFERENCES };
