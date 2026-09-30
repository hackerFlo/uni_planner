// Device preferences retain a local appearance cache. Authenticated profiles
// use an account-specific namespace; the original key is only the guest/legacy
// migration source and never receives cloud preferences.

export const PREFS_KEY = 'uniPlanner.preferences';

export const THEMES = ['system', 'light', 'dark'];
export const DENSITIES = ['comfortable', 'compact'];
export const AGENT_ACTIVITY_ICONS = ['fuzzy', 'ring', 'robot'];

export const DEFAULT_PREFERENCES = {
  theme: 'system',
  density: 'comfortable',
  reduceMotion: false,
  holidayCountry: 'DE',
  holidaySubdivision: 'DE-BY',
  showHolidays: true,
  showQuotes: true,
  agentActivityIcon: 'fuzzy',
  // The DAY the quote was snoozed, not an expiry timestamp. "Is it snoozed?" is
  // then just a comparison against today, so it self-clears at 00:00 with no
  // timer, and survives a reload or a laptop asleep across midnight.
  quotesSnoozedOn: null,
};

function normalizeSubdivision(value) {
  if (value === undefined) return DEFAULT_PREFERENCES.holidaySubdivision;
  if (value === '' || value === null) return null;
  return typeof value === 'string' && /^[A-Z]{2}-[A-Z0-9]{1,3}$/.test(value)
    ? value
    : DEFAULT_PREFERENCES.holidaySubdivision;
}

// Anything that is not a plain YYYY-MM-DD becomes null, i.e. "not snoozed".
// A junk value must never be able to hide the quote bar permanently.
function normalizeSnoozedOn(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000-')) return null;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}

// A stored blob can be anything a previous version wrote, or hand-edited junk.
// Unknown keys are dropped and bad values fall back, so one stale field cannot
// take the whole settings panel down.
export function normalizePreferences(raw) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const pick = (key, allowed) =>
    allowed.includes(input[key]) ? input[key] : DEFAULT_PREFERENCES[key];

  return {
    theme: pick('theme', THEMES),
    density: pick('density', DENSITIES),
    reduceMotion: typeof input.reduceMotion === 'boolean'
      ? input.reduceMotion : DEFAULT_PREFERENCES.reduceMotion,
    holidayCountry: typeof input.holidayCountry === 'string' && /^[A-Z]{2}$/.test(input.holidayCountry)
      ? input.holidayCountry : DEFAULT_PREFERENCES.holidayCountry,
    // '' is an explicit "whole country", distinct from the key being absent --
    // which means the stored blob predates this setting and should keep the
    // default region rather than silently widening to nationwide.
    holidaySubdivision: normalizeSubdivision(input.holidaySubdivision),
    showHolidays: typeof input.showHolidays === 'boolean'
      ? input.showHolidays : DEFAULT_PREFERENCES.showHolidays,
    showQuotes: typeof input.showQuotes === 'boolean'
      ? input.showQuotes : DEFAULT_PREFERENCES.showQuotes,
    agentActivityIcon: pick('agentActivityIcon', AGENT_ACTIVITY_ICONS),
    quotesSnoozedOn: normalizeSnoozedOn(input.quotesSnoozedOn),
  };
}

export function loadPreferences(storage = globalThis.localStorage) {
  try {
    return normalizePreferences(JSON.parse(storage?.getItem(PREFS_KEY) ?? 'null'));
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function savePreferences(prefs, storage = globalThis.localStorage) {
  try {
    storage?.setItem(PREFS_KEY, JSON.stringify(normalizePreferences(prefs)));
    return true;
  } catch {
    // A full or disabled store costs the preference, never the interaction.
    return false;
  }
}

// 'system' has to resolve against the OS at the moment it is asked, so this takes
// the media query result rather than reading it -- which keeps it testable.
export function resolveTheme(theme, prefersDark) {
  if (theme === 'dark' || theme === 'light') return theme;
  return prefersDark ? 'dark' : 'light';
}

const profileMemory = new Map();
const PROFILE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function preferenceProfileKey(accountId) {
  if (!Number.isSafeInteger(accountId) || accountId < 1) throw new TypeError('Invalid preference account');
  return `${PREFS_KEY}.account.${accountId}`;
}

function normalizeMarker(value) {
  if (!value || !PROFILE_ID.test(value.id) || typeof value.initialized !== 'boolean') return null;
  return { id: value.id, initialized: value.initialized, settings: normalizePreferences(value.settings) };
}

export function loadPreferenceProfile(accountId, storage) {
  const key = preferenceProfileKey(accountId);
  try {
    const saved = normalizeMarker(JSON.parse((storage ?? globalThis.localStorage)?.getItem(key) ?? 'null'));
    if (saved) { profileMemory.set(key, saved); return saved; }
  } catch {
    // A blocked/corrupt cache must not discard a profile already known in this session.
  }
  return profileMemory.get(key) ?? null;
}

export function savePreferenceProfile(accountId, marker, storage) {
  const key = preferenceProfileKey(accountId);
  const normalized = normalizeMarker(marker);
  if (!normalized) return false;
  profileMemory.set(key, normalized);
  try {
    (storage ?? globalThis.localStorage)?.setItem(key, JSON.stringify(normalized));
    return true;
  } catch {
    // Keep the same random profile for this session even if persistent storage fails.
    return false;
  }
}
