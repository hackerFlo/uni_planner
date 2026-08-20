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

  // The shape /^\d{4}-\d{2}-\d{2}$/ is not a date: it admits month 13, day 45 and
  // 30 February, all of which then sort into range queries and render as garbage.
  const VALID_DATES = [
    ['first day of the year', '2026-01-01'],
    ['last day of the year', '2026-12-31'],
    ['last day of a 30-day month', '2026-04-30'],
    ['last day of a 31-day month', '2026-07-31'],
    ['last day of February in a common year', '2026-02-28'],
    ['29 February in a leap year', '2024-02-29'],
    ['29 February in a 400-year leap year', '2000-02-29'],
    ['the far past', '1970-01-01'],
    ['the far future', '9999-12-31'],
  ];

  for (const [why, value] of VALID_DATES) {
    test(`accepts ${why}: ${value}`, () => {
      assert.equal(validateDayAssigned(value), value);
    });
  }

  const INVALID_DATES = [
    ['month zero', '2026-00-15'],
    ['month thirteen', '2026-13-01'],
    ['month past thirteen', '2026-99-01'],
    ['day zero', '2026-01-00'],
    ['day thirty-two', '2026-01-32'],
    ['a 31st in a 30-day month', '2026-04-31'],
    ['30 February', '2026-02-30'],
    ['29 February in a common year', '2026-02-29'],
    ['29 February in a century that is not a leap year', '1900-02-29'],
    ['month and day both zero', '0000-00-00'],
    ['year zero', '0000-01-01'],
    ['every field out of range', '2026-13-45'],
    ['a two-digit year', '26-08-19'],
    ['a missing leading zero', '2026-8-19'],
    ['a trailing time component', '2026-08-19T00:00:00Z'],
    ['leading whitespace', ' 2026-08-19'],
    ['a negative day', '2026-08--1'],
  ];

  for (const [why, value] of INVALID_DATES) {
    test(`rejects ${why}: ${JSON.stringify(value)}`, () => {
      assert.equal(validateDayAssigned(value), false);
    });
  }

  test('rejects a non-string day', () => {
    assert.equal(validateDayAssigned(20260819), false);
  });

  test('agrees with the calendar on every day of a leap year and the year after', () => {
    for (const year of [2024, 2025]) {
      for (let month = 1; month <= 13; month++) {
        for (let day = 1; day <= 32; day++) {
          const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const probe = new Date(`${iso}T00:00:00Z`);
          const real = !Number.isNaN(probe.getTime()) && probe.toISOString().slice(0, 10) === iso;
          assert.equal(validateDayAssigned(iso), real ? iso : false, iso);
        }
      }
    }
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
