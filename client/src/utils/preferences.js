// User-facing preferences, stored locally rather than server-side: they describe
// this device (a phone wants a denser board than a desktop) and none of them are
// worth a round trip or a migration.

export const PREFS_KEY = 'uniPlanner.preferences';

export const THEMES = ['system', 'light', 'dark'];
export const DENSITIES = ['comfortable', 'compact'];

export const DEFAULT_PREFERENCES = {
  theme: 'system',
  density: 'comfortable',
  reduceMotion: false,
  holidayCountry: 'DE',
  holidaySubdivision: 'DE-BY',
  showHolidays: true,
};

function normalizeSubdivision(value) {
  if (value === undefined) return DEFAULT_PREFERENCES.holidaySubdivision;
  if (value === '' || value === null) return null;
  return typeof value === 'string' && /^[A-Z]{2}-[A-Z0-9]{1,3}$/.test(value)
    ? value
    : DEFAULT_PREFERENCES.holidaySubdivision;
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
