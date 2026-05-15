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

const RECURRENCE_PATTERNS = ['weekdays', 'weekends'];

function validateRecurrencePattern(v) {
  if (v === null || v === undefined || v === '') return null;
  return RECURRENCE_PATTERNS.includes(v) ? v : false;
}

function sanitizeDayNote(str) {
  if (typeof str !== 'string') return '';
  return str.trim().slice(0, 200);
}

module.exports = { validateIdentifier, sanitizeTitle, sanitizeDescription, validateDayAssigned, validateRecurrenceInterval, validateRecurrencePattern, sanitizeDayNote };
