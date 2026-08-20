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

// Matches an `&` that does not already begin a character reference, so text that
// arrived as `&amp;`/`&lt;` (the browser's own innerHTML serialisation) is left
// alone and sanitising twice cannot double-encode it.
const BARE_AMP_RE = /&(?!(?:#\d+|#[xX][0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]{1,31});)/g;

// A raw `<` surviving in a text run is what lets a dropped tag splice its
// neighbours into a brand-new tag that the tokeniser has already walked past.
function escapeTextRun(text) {
  return text.replace(BARE_AMP_RE, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function normalizeDescTag(tag) {
  if (/^<br[\s/]*>$/i.test(tag)) return '<br>';
  if (/^<(strong|b)(\s[^>]*)?>$/i.test(tag)) return '<strong>';
  if (/^<\/(strong|b)>$/i.test(tag)) return '</strong>';
  if (/^<(em|i)(\s[^>]*)?>$/i.test(tag)) return '<em>';
  if (/^<\/(em|i)>$/i.test(tag)) return '</em>';
  if (/^<ul(\s[^>]*)?>$/i.test(tag)) return '<ul>';
  if (/^<\/ul>$/i.test(tag)) return '</ul>';
  if (/^<li(\s[^>]*)?>$/i.test(tag)) return '<li>';
  if (/^<\/li>$/i.test(tag)) return '</li>';
  return '';
}

function sanitizeDescription(str) {
  if (str === undefined || str === null) return '';
  if (typeof str !== 'string') return null;

  let s = str.trim();

  // Block closing tags become line breaks; block opening tags are stripped
  s = s.replace(/<\/(div|p)>/gi, '<br>');
  s = s.replace(/<(div|p|span|a|img|table|ol|header|footer|section|article|nav|h[1-6])[^>]*>/gi, '');

  const result = [];
  let lastIdx = 0;
  const tagRe = /<\/?[a-zA-Z][^>]*>/g;
  let m;
  while ((m = tagRe.exec(s)) !== null) {
    if (m.index > lastIdx) result.push(escapeTextRun(s.slice(lastIdx, m.index)));
    const norm = normalizeDescTag(m[0]);
    if (norm) result.push(norm);
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < s.length) result.push(escapeTextRun(s.slice(lastIdx)));

  let html = result.join('');
  html = html.replace(/(<br>){3,}/g, '<br><br>');
  html = html.replace(/^(<br>)+/, '').replace(/(<br>)+$/, '');

  if (html.length > 5000) return null;
  return html;
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
