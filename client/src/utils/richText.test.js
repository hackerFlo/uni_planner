import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { sanitizeRichHtml, richTextToPlain } from './richText.js';

// Shared with server/middleware/validate.test.js, which runs the same cases through
// the server's copy of this sanitiser. Fixing one copy and not the other fails there.
const FIXTURES = JSON.parse(
  fs.readFileSync(new URL('../../../server/middleware/sanitizeFixtures.json', import.meta.url), 'utf8')
);

// A browser can only begin a tag at a raw `<`. If every `<` left in the output opens
// an allowlisted, attribute-free tag, no markup can be conjured out of the rest.
const ALLOWED_TAG_RE = /<\/?(?:strong|em|ul|li)>|<br>/g;

function hasUnaccountedAngleBracket(html) {
  return html.replace(ALLOWED_TAG_RE, '').includes('<');
}

test.describe('sanitizeRichHtml', () => {
  for (const { name, input, expected } of FIXTURES) {
    test(name, () => {
      assert.equal(sanitizeRichHtml(input), expected);
    });
  }

  test('leaves no raw < that a parser could read as a tag', () => {
    for (const { name, input } of FIXTURES) {
      assert.equal(hasUnaccountedAngleBracket(sanitizeRichHtml(input)), false, name);
    }
  });

  // The client sanitises on edit and the server sanitises the same string again on
  // save, so a second pass that changed anything would corrupt stored descriptions.
  test('is idempotent across a second pass', () => {
    for (const { name, expected } of FIXTURES) {
      assert.equal(sanitizeRichHtml(expected), expected, name);
    }
  });

  test('does not double-encode an ampersand it encoded itself', () => {
    const once = sanitizeRichHtml('Tom & Jerry');
    assert.equal(once, 'Tom &amp; Jerry');
    assert.equal(sanitizeRichHtml(once), once);
  });

  test('reads a non-string description as empty', () => {
    assert.equal(sanitizeRichHtml(undefined), '');
    assert.equal(sanitizeRichHtml(null), '');
  });

  // Unlike the server copy this one does not trim, because it runs on every
  // keystroke in the editor and swallowing a trailing space would fight the caret.
  test('keeps whitespace the author is still typing', () => {
    assert.equal(sanitizeRichHtml('half a sentence '), 'half a sentence ');
  });

  test('collapses a run of breaks to a single blank line', () => {
    assert.equal(sanitizeRichHtml('a<br><br><br><br>b'), 'a<br><br>b');
  });

  test('truncates rather than rejecting an over-long description', () => {
    assert.equal(sanitizeRichHtml('x'.repeat(6000)).length, 5000);
  });
});

test.describe('richTextToPlain', () => {
  test('turns a break into a newline', () => {
    assert.equal(richTextToPlain('line one<br>line two'), 'line one\nline two');
  });

  test('drops formatting tags but keeps their text', () => {
    assert.equal(richTextToPlain('<strong>bold</strong> and <em>italic</em>'), 'bold and italic');
  });

  test('decodes the entities the sanitiser writes', () => {
    assert.equal(richTextToPlain('5 &lt; 10 &amp;&amp; a &quot;quote&quot;'), '5 < 10 && a "quote"');
  });

  test('treats an absent description as empty', () => {
    assert.equal(richTextToPlain(''), '');
    assert.equal(richTextToPlain(null), '');
  });
});

// What the author typed has to survive storage and come back out unchanged, which is
// the constraint that rules out escaping `&` unconditionally.
test.describe('sanitise then flatten round trip', () => {
  const prose = [
    'Read chapter 3 before Monday',
    'Tom & Jerry',
    'Café ☕ 100% done 🎓',
    'compare a & b, then a && b',
  ];

  for (const original of prose) {
    test(`recovers ${JSON.stringify(original)}`, () => {
      assert.equal(richTextToPlain(sanitizeRichHtml(original)), original);
    });
  }

  test('recovers text across a save that sanitises twice', () => {
    const saved = sanitizeRichHtml(sanitizeRichHtml('Tom & Jerry, 5 < 10'));
    assert.equal(richTextToPlain(saved), 'Tom & Jerry, 5 < 10');
  });
});
