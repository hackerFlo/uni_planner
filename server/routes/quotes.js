const express = require('express');
const requireAuth = require('../middleware/auth');
const { validateDayAssigned } = require('../middleware/validate');
const { quoteImportLimiter } = require('../middleware/rateLimiter');
const { MAX_ROWS } = require('../utils/csv');
const quotes = require('../quotes');

const router = express.Router();
router.use(requireAuth);

// The one endpoint whose body is not tiny. The app-wide parser stops at 10 kB
// and the seed CSV alone is ~25 kB, so this route brings its own -- the same
// shape backup.js uses for /restore. Two other places must agree with this
// number or the request never arrives: the exempt list in
// middleware/bodyParser.js, and client_max_body_size in client/nginx.conf.
const csvBodyParser = express.json({ limit: '1mb' });

function validateQuoteId(id) {
  const n = parseInt(id, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// The browser sends its own local date. The server cannot know the client's
// timezone, and guessing wrong rolls the quote over at the wrong hour.
function requestedDay(req) {
  return validateDayAssigned(req.query.date) || null;
}

// GET /api/quotes/today?date=YYYY-MM-DD
router.get('/today', (req, res) => {
  const day = requestedDay(req);
  if (!day) return res.status(400).json({ error: 'A valid date (YYYY-MM-DD) is required' });
  const quote = quotes.quoteForDay(req.user.id, day);
  res.json({ quote: quote ?? null });
});

router.get('/stats', (req, res) => {
  res.json({ stats: quotes.stats(req.user.id) });
});

// Literal paths are declared before /:id/... so Express cannot read
// "restore-all" as an id -- same reasoning as the note in lists.js.
router.post('/restore-all', (req, res) => {
  const restored = quotes.restoreAll(req.user.id);
  res.json({ restored, stats: quotes.stats(req.user.id) });
});

router.post('/import', quoteImportLimiter, csvBodyParser, (req, res) => {
  const { csv } = req.body ?? {};
  if (typeof csv !== 'string' || csv.trim() === '') {
    return res.status(400).json({ error: 'No CSV content was sent' });
  }
  const { added, skipped, errors } = quotes.importCsv(req.user.id, csv);
  if (added === 0 && skipped === 0 && errors.length > 0) {
    // Nothing usable at all -- a wrong file, not a partly-bad one.
    return res.status(400).json({ error: errors[0], errors: errors.slice(0, 10) });
  }
  res.json({
    added,
    skipped,
    // Capped: a 5000-row file of junk would otherwise return 5000 messages.
    errors: errors.slice(0, 10),
    errorCount: errors.length,
    maxRows: MAX_ROWS,
    stats: quotes.stats(req.user.id),
  });
});

// Disliking replaces the day's quote in the same request, so the bar never
// blinks empty: the client swaps straight to `quote`.
router.post('/:id/dislike', (req, res) => {
  const quoteId = validateQuoteId(req.params.id);
  if (!quoteId) return res.status(400).json({ error: 'Invalid id' });
  const day = requestedDay(req);
  if (!day) return res.status(400).json({ error: 'A valid date (YYYY-MM-DD) is required' });
  if (!quotes.setDisliked(req.user.id, quoteId, true)) {
    return res.status(404).json({ error: 'Quote not found' });
  }
  quotes.clearDay(req.user.id, day);
  res.json({ quote: quotes.quoteForDay(req.user.id, day) ?? null });
});

router.post('/:id/restore', (req, res) => {
  const quoteId = validateQuoteId(req.params.id);
  if (!quoteId) return res.status(400).json({ error: 'Invalid id' });
  const day = requestedDay(req);
  if (!day) return res.status(400).json({ error: 'A valid date (YYYY-MM-DD) is required' });
  if (!quotes.setDisliked(req.user.id, quoteId, false)) {
    return res.status(404).json({ error: 'Quote not found' });
  }
  // Undo puts the restored quote straight back on screen rather than leaving
  // whatever replaced it, so the action visibly reverses.
  quotes.clearDay(req.user.id, day);
  quotes.pinDay(req.user.id, day, quoteId);
  res.json({ quote: quotes.quoteForDay(req.user.id, day) ?? null });
});

module.exports = router;
