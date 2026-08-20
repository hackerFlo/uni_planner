const BLOCK_CLOSE_RE = /<\/(div|p)>/gi;
const BLOCK_OPEN_RE = /<(div|p|span|a|img|table|ol|header|footer|section|article|nav|h[1-6])[^>]*>/gi;
const TAG_RE = /<\/?[a-zA-Z][^>]*>/g;

// Matches an `&` that does not already begin a character reference, so text that
// arrived as `&amp;`/`&lt;` (the browser's own innerHTML serialisation) is left
// alone and sanitising twice cannot double-encode it.
const BARE_AMP_RE = /&(?!(?:#\d+|#[xX][0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]{1,31});)/g;

// A raw `<` surviving in a text run is what lets a dropped tag splice its
// neighbours into a brand-new tag that the tokeniser has already walked past.
function escapeTextRun(text) {
  return text.replace(BARE_AMP_RE, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function normalizeInlineTag(tag) {
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

export function sanitizeRichHtml(input) {
  if (typeof input !== 'string') return '';

  // Block closing tags become line breaks; opening block tags are stripped
  let s = input
    .replace(BLOCK_CLOSE_RE, '<br>')
    .replace(BLOCK_OPEN_RE, '');

  const result = [];
  let lastIdx = 0;
  TAG_RE.lastIndex = 0;
  let m;
  while ((m = TAG_RE.exec(s)) !== null) {
    if (m.index > lastIdx) result.push(escapeTextRun(s.slice(lastIdx, m.index)));
    const norm = normalizeInlineTag(m[0]);
    if (norm) result.push(norm);
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < s.length) result.push(escapeTextRun(s.slice(lastIdx)));

  let html = result.join('');
  // Collapse 3+ consecutive breaks to 2
  html = html.replace(/(<br>){3,}/g, '<br><br>');
  // Trim leading/trailing breaks
  html = html.replace(/^(<br>)+/, '').replace(/(<br>)+$/, '');

  return html.length > 5000 ? html.slice(0, 5000) : html;
}

export function richTextToPlain(html) {
  if (!html) return '';
  return html
    .replace(/<br>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ');
}
