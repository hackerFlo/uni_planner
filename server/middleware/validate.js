const DAYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];

function validateEmail(str) {
  return typeof str === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str) && str.length <= 254;
}

// Accepts a plain username OR a valid email — no whitespace, 1–100 chars.
function validateIdentifier(str) {
  if (typeof str !== 'string') return false;
  const s = str.trim();
  return s.length >= 1 && s.length <= 100 && !/\s/.test(s);
}

function sanitizeTitle(str) {
  if (typeof str !== 'string') return null;
  const s = str.trim();
  if (s.length === 0 || s.length > 200) return null;
  return s;
}

function sanitizeDescription(str) {
  if (str === undefined || str === null) return '';
  if (typeof str !== 'string') return null;
  const s = str.trim();
  if (s.length > 5000) return null;
  return s;
}

function validateDayAssigned(val) {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val !== 'string') return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(val) ? val : false;
}

function validateRecurrenceInterval(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 7 ? n : false;
}

function sanitizeDayNote(str) {
  if (typeof str !== 'string') return '';
  return str.trim().slice(0, 200);
}

module.exports = { validateEmail, validateIdentifier, sanitizeTitle, sanitizeDescription, validateDayAssigned, validateRecurrenceInterval, sanitizeDayNote };
