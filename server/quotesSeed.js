const fs = require('node:fs');
const path = require('node:path');
const { log } = require('./logger');
const { parseQuotesCsv } = require('./utils/csv');

// Deliberately NOT server/data/: both compose files bind-mount ./data over
// /app/data for the database, so a seed file shipped there is shadowed by the
// host directory at runtime -- present in the image, invisible to the process,
// and working perfectly on a dev machine that has no bind mount.
const SEED_PATH = path.join(__dirname, 'assets', 'quotes.csv');

// Built-in quotes are the rows with user_id IS NULL. Re-run on every boot and
// idempotent through the COALESCE unique index, so shipping a bigger CSV in a
// later release just tops the library up.
function seedBuiltInQuotes(db, seedPath = SEED_PATH) {
  let text;
  try {
    text = fs.readFileSync(seedPath, 'utf8');
  } catch (err) {
    // Not fatal: the app works with an empty library, it just shows no quote.
    log.warn('quote seed file unreadable, skipping', { path: seedPath, err });
    return 0;
  }

  const { quotes, errors } = parseQuotesCsv(text);
  if (errors.length > 0) log.warn('quote seed file had unusable rows', { count: errors.length, first: errors[0] });
  if (quotes.length === 0) return 0;

  const insert = db.prepare(
    'INSERT INTO quotes (user_id, text, author, wikipedia, source) VALUES (NULL, ?, ?, ?, ?) ' +
    'ON CONFLICT DO NOTHING'
  );
  const insertAll = db.transaction((rows) => {
    let added = 0;
    for (const q of rows) added += insert.run(q.text, q.author, q.wikipedia, q.source).changes;
    return added;
  });

  const added = insertAll(quotes);
  if (added > 0) log.info('built-in quotes seeded', { added, inFile: quotes.length });
  return added;
}

module.exports = { seedBuiltInQuotes, SEED_PATH };
