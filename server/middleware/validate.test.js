const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  validateIdentifier,
  sanitizeTitle,
  sanitizeDescription,
  validateDayAssigned,
  validateRecurrenceInterval,
  validateRecurrencePattern,
  sanitizeDayNote,
} = require('./validate');

// Shared with client/src/utils/richText.test.js, which runs the same cases through
// the client's copy of this sanitiser. Fixing one copy and not the other fails there.
const FIXTURES = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'sanitizeFixtures.json'), 'utf8')
);

// A browser can only begin a tag at a raw `<`. If every `<` left in the output opens
// an allowlisted, attribute-free tag, no markup can be conjured out of the rest.
const ALLOWED_TAG_RE = /<\/?(?:strong|em|ul|li)>|<br>/g;

function hasUnaccountedAngleBracket(html) {
  return html.replace(ALLOWED_TAG_RE, '').includes('<');
}

test.describe('sanitizeDescription', () => {
  for (const { name, input, expected } of FIXTURES) {
    test(name, () => {
      assert.equal(sanitizeDescription(input), expected);
    });
  }

  test('leaves no raw < that a parser could read as a tag', () => {
    for (const { name, input } of FIXTURES) {
      assert.equal(hasUnaccountedAngleBracket(sanitizeDescription(input)), false, name);
    }
  });

  // The client sanitises on edit and the server sanitises the same string again on
  // save, so a second pass that changed anything would corrupt stored descriptions.
  test('is idempotent across a second pass', () => {
    for (const { name, expected } of FIXTURES) {
      assert.equal(sanitizeDescription(expected), expected, name);
    }
  });

  test('does not double-encode an ampersand it encoded itself', () => {
    const once = sanitizeDescription('Tom & Jerry');
    assert.equal(once, 'Tom &amp; Jerry');
    assert.equal(sanitizeDescription(once), once);
  });

  test('treats a missing description as empty rather than invalid', () => {
    assert.equal(sanitizeDescription(undefined), '');
    assert.equal(sanitizeDescription(null), '');
  });

  test('rejects a non-string description', () => {
    assert.equal(sanitizeDescription(42), null);
  });

  test('trims surrounding whitespace', () => {
    assert.equal(sanitizeDescription('  spaced out  '), 'spaced out');
  });

  test('collapses a run of breaks to a single blank line', () => {
    assert.equal(sanitizeDescription('a<br><br><br><br>b'), 'a<br><br>b');
  });

  test('drops leading and trailing breaks', () => {
    assert.equal(sanitizeDescription('<br><br>middle<br>'), 'middle');
  });

  test('rejects a description longer than the storage limit', () => {
    assert.equal(sanitizeDescription('x'.repeat(5001)), null);
    assert.equal(sanitizeDescription('x'.repeat(5000)).length, 5000);
  });

  // Escaping inflates the output, so the limit has to be measured after it.
  test('measures the limit against the escaped output', () => {
    assert.equal(sanitizeDescription('&'.repeat(1001)), null);
  });
});

test.describe('validateIdentifier', () => {
  const rejected = [['empty', ''], ['whitespace only', '   '], ['contains a space', 'a b'], ['non-string', 7]];

  for (const [why, value] of rejected) {
    test(`rejects an identifier that is ${why}`, () => {
      assert.equal(validateIdentifier(value), false);
    });
  }

  test('accepts an ordinary identifier', () => {
    assert.equal(validateIdentifier('alice@example.com'), true);
  });

  test('rejects an identifier past the length limit', () => {
    assert.equal(validateIdentifier('x'.repeat(101)), false);
    assert.equal(validateIdentifier('x'.repeat(100)), true);
  });
});

test.describe('sanitizeTitle', () => {
  test('trims a title', () => {
    assert.equal(sanitizeTitle('  Read chapter 3  '), 'Read chapter 3');
  });

  test('rejects a title that is empty once trimmed', () => {
    assert.equal(sanitizeTitle('   '), null);
  });

  test('rejects a title past the length limit', () => {
    assert.equal(sanitizeTitle('x'.repeat(201)), null);
    assert.equal(sanitizeTitle('x'.repeat(200)).length, 200);
  });
});

test.describe('validateDayAssigned', () => {
  test('accepts an ISO date', () => {
    assert.equal(validateDayAssigned('2026-08-19'), '2026-08-19');
  });

  test('reads an absent day as unassigned rather than invalid', () => {
    assert.equal(validateDayAssigned(''), null);
    assert.equal(validateDayAssigned(null), null);
  });

  test('rejects a date that is not in ISO form', () => {
    assert.equal(validateDayAssigned('19/08/2026'), false);
  });
});

test.describe('validateRecurrenceInterval', () => {
  test('accepts an interval inside the allowed range', () => {
    assert.equal(validateRecurrenceInterval('3'), 3);
  });

  test('rejects an interval outside the allowed range', () => {
    assert.equal(validateRecurrenceInterval(0), false);
    assert.equal(validateRecurrenceInterval(8), false);
  });

  test('rejects a fractional interval', () => {
    assert.equal(validateRecurrenceInterval(1.5), false);
  });
});

test.describe('validateRecurrencePattern', () => {
  test('accepts a known pattern', () => {
    assert.equal(validateRecurrencePattern('weekdays'), 'weekdays');
  });

  test('rejects an unknown pattern', () => {
    assert.equal(validateRecurrencePattern('every-full-moon'), false);
  });
});

test.describe('sanitizeDayNote', () => {
  test('trims a note', () => {
    assert.equal(sanitizeDayNote('  Reading week  '), 'Reading week');
  });

  test('truncates a note past the length limit', () => {
    assert.equal(sanitizeDayNote('x'.repeat(250)).length, 200);
  });

  test('reads a non-string note as empty', () => {
    assert.equal(sanitizeDayNote(undefined), '');
  });
});
