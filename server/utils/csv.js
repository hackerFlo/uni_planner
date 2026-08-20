// A small RFC 4180 reader. Hand-rolled rather than a dependency, matching the
// instinct in middleware/validate.js (which hand-rolls an HTML sanitiser and a
// calendar validator): the whole job is a few dozen lines, and this parses
// untrusted upload input, so a smaller trusted surface is worth more than the
// convenience.

const MAX_QUOTE_LEN = 1000;
const MAX_AUTHOR_LEN = 200;
const MAX_URL_LEN = 500;
const MAX_ROWS = 5000;
const REQUIRED_HEADERS = ['Quote', 'Author'];

// Splits on commas and newlines except inside double quotes, where "" is a
// literal quote. Returns an array of arrays of raw cell strings.
function splitRecords(text) {
  const records = [];
  let row = [];
  let cell = '';
  let quoted = false;
  let i = 0;

  const endCell = () => { row.push(cell); cell = ''; };
  const endRow = () => { endCell(); records.push(row); row = []; };

  while (i < text.length) {
    const c = text[i];

    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i += 2; continue; }
        quoted = false; i++; continue;
      }
      cell += c; i++; continue;
    }

    if (c === '"' && cell.trim() === '') { quoted = true; cell = ''; i++; continue; }
    if (c === ',') { endCell(); i++; continue; }
    // \r\n, bare \n and bare \r all end a record -- a file saved on any of the
    // three platforms has to import identically.
    if (c === '\r') { endRow(); i += text[i + 1] === '\n' ? 2 : 1; continue; }
    if (c === '\n') { endRow(); i++; continue; }
    cell += c; i++;
  }
  if (cell !== '' || row.length > 0) endRow();
  return records;
}

// A cell is trimmed only when it was not quoted -- but by this point the quotes
// are gone, so trim unconditionally. Quoted values in this format never rely on
// leading whitespace, and the alternative is threading a per-cell flag through
// for no gain.
const clean = (v) => (v ?? '').trim();

function parseCsv(text) {
  if (typeof text !== 'string' || text === '') return [];
  // U+FEFF at the start is a byte-order mark, not data. Excel writes one by
  // default; left in place the first header becomes "\uFEFFID" and every lookup
  // of that column silently misses.
  const records = splitRecords(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  if (records.length === 0) return [];

  const headers = records[0].map(clean);
  const out = [];
  for (const record of records.slice(1)) {
    // A blank line is not a row of empty values; it is nothing.
    if (record.length === 1 && clean(record[0]) === '') continue;
    const row = {};
    headers.forEach((h, idx) => { row[h] = clean(record[idx]); });
    out.push(row);
  }
  return out;
}

// Only http(s) survives. This value is stored and later becomes an href, so a
// javascript: or data: URL would be a stored-XSS vector the moment it renders.
function safeUrl(value) {
  const v = clean(value);
  if (!v || v.length > MAX_URL_LEN) return null;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' || u.protocol === 'http:' ? v : null;
  } catch {
    return null;
  }
}

// Returns { quotes, errors }. Errors describe rows that were skipped; they are
// reported back to the uploader rather than thrown, so one bad line does not
// cost the other 190.
function parseQuotesCsv(text) {
  const rows = parseCsv(text);
  const errors = [];

  if (rows.length === 0) return { quotes: [], errors: ['The file has no data rows.'] };

  const present = Object.keys(rows[0]);
  const missing = REQUIRED_HEADERS.filter(h => !present.includes(h));
  if (missing.length > 0) {
    return { quotes: [], errors: [`Missing required column(s): ${missing.join(', ')}. Expected a header row with ${REQUIRED_HEADERS.join(' and ')}.`] };
  }

  if (rows.length > MAX_ROWS) {
    return { quotes: [], errors: [`Too many rows (${rows.length}); the limit is ${MAX_ROWS}.`] };
  }

  const quotes = [];
  const seen = new Set();
  rows.forEach((row, idx) => {
    const line = idx + 2; // header is line 1
    const quoteText = clean(row.Quote);
    const author = clean(row.Author);

    if (!quoteText) { errors.push(`Line ${line}: no quote text.`); return; }
    if (!author) { errors.push(`Line ${line}: no author.`); return; }
    if (quoteText.length > MAX_QUOTE_LEN) { errors.push(`Line ${line}: quote is longer than ${MAX_QUOTE_LEN} characters.`); return; }
    if (author.length > MAX_AUTHOR_LEN) { errors.push(`Line ${line}: author is longer than ${MAX_AUTHOR_LEN} characters.`); return; }
    // Duplicates inside one file are dropped silently -- the same text twice is
    // a spreadsheet artefact, not something worth an error message.
    if (seen.has(quoteText)) return;
    seen.add(quoteText);

    // The Characters column is ignored on purpose: in the seed file it equals
    // len(Quote) in all 191 rows, so it carries no information the text does
    // not, and trusting it would let a bad value reject a good quote.
    quotes.push({
      text: quoteText,
      author,
      wikipedia: safeUrl(row.Wikipedia),
      source: safeUrl(row.Source),
    });
  });

  return { quotes, errors };
}

module.exports = { parseCsv, parseQuotesCsv, MAX_ROWS, MAX_QUOTE_LEN };
