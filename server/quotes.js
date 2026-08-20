const db = require('./db');
const { parseQuotesCsv } = require('./utils/csv');

// A quote is visible to a user if it is built-in (user_id IS NULL) or theirs.
// Every statement below carries that clause, so one account can never read or
// affect another's uploads (AR-2).
const VISIBLE = '(q.user_id IS NULL OR q.user_id = ?)';

const SELECT_COLS = 'q.id, q.text, q.author, q.wikipedia, q.source';

// Which rotation pass the user is on. A quote may only be shown once per pass,
// which is what "cannot repeat until all other quotes have been shown" means.
// No row yet -> pass 0.
function currentCycle(userId) {
  const row = db.prepare('SELECT MAX(shown_cycle) AS c FROM quote_state WHERE user_id = ?').get(userId);
  return row?.c ?? 0;
}

function countEligible(userId) {
  return db.prepare(
    `SELECT COUNT(*) AS n FROM quotes q
      LEFT JOIN quote_state s ON s.quote_id = q.id AND s.user_id = ?
      WHERE ${VISIBLE} AND COALESCE(s.disliked, 0) = 0`
  ).get(userId, userId).n;
}

// Unseen in this pass, not disliked. RANDOM() rather than an ordered walk so
// the sequence is not identical for two accounts with the same library.
function pickUnseen(userId, cycle) {
  return db.prepare(
    `SELECT ${SELECT_COLS} FROM quotes q
      LEFT JOIN quote_state s ON s.quote_id = q.id AND s.user_id = ?
      WHERE ${VISIBLE}
        AND COALESCE(s.disliked, 0) = 0
        AND (s.shown_cycle IS NULL OR s.shown_cycle < ?)
      ORDER BY RANDOM() LIMIT 1`
  ).get(userId, userId, cycle);
}

function markShown(userId, quoteId, cycle) {
  db.prepare(
    'INSERT INTO quote_state (user_id, quote_id, shown_cycle, last_shown_at) VALUES (?, ?, ?, ?) ' +
    'ON CONFLICT(user_id, quote_id) DO UPDATE SET shown_cycle = excluded.shown_cycle, last_shown_at = excluded.last_shown_at'
  ).run(userId, quoteId, cycle, new Date().toISOString());
}

const readDay = (userId, day) => db.prepare(
  `SELECT ${SELECT_COLS} FROM quote_day d
     JOIN quotes q ON q.id = d.quote_id
     LEFT JOIN quote_state s ON s.quote_id = q.id AND s.user_id = d.user_id
    WHERE d.user_id = ? AND d.day = ? AND COALESCE(s.disliked, 0) = 0`
).get(userId, day);

// The day's quote, chosen once and then pinned so a refresh does not reroll it.
// Returns null only when the user has no eligible quotes at all.
function quoteForDay(userId, day) {
  const pinned = readDay(userId, day);
  if (pinned) return pinned;

  let cycle = currentCycle(userId);
  let quote = pickUnseen(userId, cycle);
  if (!quote) {
    // Every eligible quote has been shown in this pass: start the next one.
    // Guard against the genuinely empty library, or the pass would advance
    // forever looking for a quote that does not exist.
    if (countEligible(userId) === 0) return null;
    cycle += 1;
    quote = pickUnseen(userId, cycle);
    if (!quote) return null;
  }

  db.transaction(() => {
    markShown(userId, quote.id, cycle);
    db.prepare(
      'INSERT INTO quote_day (user_id, day, quote_id) VALUES (?, ?, ?) ' +
      'ON CONFLICT(user_id, day) DO UPDATE SET quote_id = excluded.quote_id'
    ).run(userId, day, quote.id);
  })();

  return quote;
}

// Returns true if the quote was visible to this user, false otherwise -- the
// caller turns that into a 404 rather than silently succeeding on someone
// else's row.
function setDisliked(userId, quoteId, disliked) {
  const visible = db.prepare(`SELECT q.id FROM quotes q WHERE q.id = ? AND ${VISIBLE}`).get(quoteId, userId);
  if (!visible) return false;
  db.prepare(
    'INSERT INTO quote_state (user_id, quote_id, disliked) VALUES (?, ?, ?) ' +
    'ON CONFLICT(user_id, quote_id) DO UPDATE SET disliked = excluded.disliked'
  ).run(userId, quoteId, disliked ? 1 : 0);
  return true;
}

// Dropping the pin is what makes the next read pick a fresh quote for today.
function clearDay(userId, day) {
  db.prepare('DELETE FROM quote_day WHERE user_id = ? AND day = ?').run(userId, day);
}

// Force a specific quote onto a day. Only used by Undo, so that restoring a
// disliked quote visibly puts it back rather than leaving its replacement up.
// Silently does nothing if the quote is not visible to this user (AR-2).
function pinDay(userId, day, quoteId) {
  const visible = db.prepare(`SELECT q.id FROM quotes q WHERE q.id = ? AND ${VISIBLE}`).get(quoteId, userId);
  if (!visible) return false;
  db.prepare(
    'INSERT INTO quote_day (user_id, day, quote_id) VALUES (?, ?, ?) ' +
    'ON CONFLICT(user_id, day) DO UPDATE SET quote_id = excluded.quote_id'
  ).run(userId, day, quoteId);
  return true;
}

function restoreAll(userId) {
  return db.prepare('UPDATE quote_state SET disliked = 0 WHERE user_id = ? AND disliked = 1').run(userId).changes;
}

function stats(userId) {
  const total = db.prepare(`SELECT COUNT(*) AS n FROM quotes q WHERE ${VISIBLE}`).get(userId).n;
  const disliked = db.prepare(
    `SELECT COUNT(*) AS n FROM quote_state s JOIN quotes q ON q.id = s.quote_id
      WHERE s.user_id = ? AND s.disliked = 1 AND ${VISIBLE}`
  ).get(userId, userId).n;
  const mine = db.prepare('SELECT COUNT(*) AS n FROM quotes WHERE user_id = ?').get(userId).n;
  return { total, disliked, uploaded: mine, available: total - disliked };
}

// Uploaded quotes belong to the uploader. Duplicates are skipped rather than
// rejected, so re-uploading the same file is harmless -- matching on the text,
// never the CSV's ID column, because a second file restarts at Q001 and its
// ids would collide with the first file's.
function importCsv(userId, csvText) {
  const { quotes, errors } = parseQuotesCsv(csvText);
  if (quotes.length === 0) return { added: 0, skipped: 0, errors };

  const insert = db.prepare(
    'INSERT INTO quotes (user_id, text, author, wikipedia, source) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING'
  );
  // A quote already present as a built-in is a duplicate too, not just one the
  // same user uploaded before.
  const existsBuiltIn = db.prepare('SELECT 1 FROM quotes WHERE user_id IS NULL AND text = ?');

  const run = db.transaction(() => {
    let added = 0;
    let skipped = 0;
    for (const q of quotes) {
      if (existsBuiltIn.get(q.text)) { skipped += 1; continue; }
      const changes = insert.run(userId, q.text, q.author, q.wikipedia, q.source).changes;
      if (changes > 0) added += 1; else skipped += 1;
    }
    return { added, skipped };
  });

  return { ...run(), errors };
}

module.exports = { quoteForDay, setDisliked, clearDay, pinDay, restoreAll, stats, importCsv, currentCycle };
