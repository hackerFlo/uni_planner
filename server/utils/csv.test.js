const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCsv, parseQuotesCsv } = require('./csv');

test.describe('parseCsv', () => {
  test('parses a plain header and row', () => {
    assert.deepEqual(parseCsv('a,b\n1,2'), [{ a: '1', b: '2' }]);
  });

  // The shipped quotes.csv really does start with EF BB BF. Left in place, the
  // first header becomes U+FEFF followed by "ID", and the ID column vanishes.
  test('strips a UTF-8 BOM from the first header', () => {
    const rows = parseCsv('\uFEFFID,Quote\nQ001,Hello');
    assert.deepEqual(Object.keys(rows[0]), ['ID', 'Quote']);
  });

  test('keeps commas inside quoted fields', () => {
    assert.deepEqual(
      parseCsv('a,b\n"one, two",three'),
      [{ a: 'one, two', b: 'three' }],
    );
  });

  test('unescapes a doubled quote', () => {
    assert.deepEqual(parseCsv('a\n"He said ""hi"""'), [{ a: 'He said "hi"' }]);
  });

  test('handles CRLF line endings', () => {
    assert.deepEqual(parseCsv('a,b\r\n1,2\r\n3,4'), [{ a: '1', b: '2' }, { a: '3', b: '4' }]);
  });

  test('handles a bare CR line ending', () => {
    assert.deepEqual(parseCsv('a\r1\r2'), [{ a: '1' }, { a: '2' }]);
  });

  test('keeps a newline inside a quoted field', () => {
    assert.deepEqual(parseCsv('a,b\n"line1\nline2",x'), [{ a: 'line1\nline2', b: 'x' }]);
  });

  test('ignores a trailing newline rather than emitting a blank row', () => {
    assert.equal(parseCsv('a\n1\n').length, 1);
  });

  test('skips wholly blank lines', () => {
    assert.equal(parseCsv('a\n1\n\n2\n').length, 2);
  });

  test('pads a short row with empty strings', () => {
    assert.deepEqual(parseCsv('a,b,c\n1,2'), [{ a: '1', b: '2', c: '' }]);
  });

  test('drops cells beyond the header width rather than inventing keys', () => {
    assert.deepEqual(parseCsv('a,b\n1,2,3'), [{ a: '1', b: '2' }]);
  });

  test('returns an empty list for empty input', () => {
    assert.deepEqual(parseCsv(''), []);
  });

  test('returns an empty list when only a header is present', () => {
    assert.deepEqual(parseCsv('a,b\n'), []);
  });

  test('trims surrounding whitespace on unquoted values', () => {
    assert.deepEqual(parseCsv('a,b\n 1 , 2 '), [{ a: '1', b: '2' }]);
  });
});

test.describe('parseQuotesCsv', () => {
  const header = 'ID,Quote,Author,Characters,Wikipedia,Source';

  test('reads a well-formed row', () => {
    const { quotes, errors } = parseQuotesCsv(
      `${header}\nQ001,Freedom lies in being bold.,Robert Frost,27,https://en.wikipedia.org/wiki/Robert_Frost,https://example.com/`
    );
    assert.equal(errors.length, 0);
    assert.deepEqual(quotes, [{
      text: 'Freedom lies in being bold.',
      author: 'Robert Frost',
      wikipedia: 'https://en.wikipedia.org/wiki/Robert_Frost',
      source: 'https://example.com/',
    }]);
  });

  test('accepts an empty Wikipedia cell as null', () => {
    const { quotes } = parseQuotesCsv(`${header}\nQ010,Courage doesn't always roar.,Mary Anne Radmacher,28,,https://example.com/`);
    assert.equal(quotes[0].wikipedia, null);
  });

  test('rejects a file whose required headers are missing', () => {
    const { quotes, errors } = parseQuotesCsv('Foo,Bar\n1,2');
    assert.equal(quotes.length, 0);
    assert.match(errors[0], /Quote|Author|column/i);
  });

  test('skips a row with no quote text and reports it', () => {
    const { quotes, errors } = parseQuotesCsv(`${header}\nQ001,,Nobody,0,,`);
    assert.equal(quotes.length, 0);
    assert.equal(errors.length, 1);
  });

  test('skips a row with no author and reports it', () => {
    const { quotes, errors } = parseQuotesCsv(`${header}\nQ001,Something wise.,,15,,`);
    assert.equal(quotes.length, 0);
    assert.equal(errors.length, 1);
  });

  // The upload is untrusted input reaching a DB write and, for wikipedia, an
  // href. Anything not http(s) is dropped rather than stored (AR-1).
  test('drops a javascript: URL from the Wikipedia column', () => {
    const { quotes } = parseQuotesCsv(`${header}\nQ001,Text here.,Someone,10,javascript:alert(1),`);
    assert.equal(quotes[0].wikipedia, null);
  });

  test('drops a non-http scheme from the Source column', () => {
    const { quotes } = parseQuotesCsv(`${header}\nQ001,Text here.,Someone,10,,data:text/html;base64,AAAA`);
    assert.equal(quotes[0].source, null);
  });

  test('rejects an over-long quote rather than truncating it', () => {
    const long = 'x'.repeat(1001);
    const { quotes, errors } = parseQuotesCsv(`${header}\nQ001,${long},Someone,1001,,`);
    assert.equal(quotes.length, 0);
    assert.equal(errors.length, 1);
  });

  test('ignores the Characters column even when it disagrees with the text', () => {
    const { quotes, errors } = parseQuotesCsv(`${header}\nQ001,Four.,Someone,999999,,`);
    assert.deepEqual({ n: quotes.length, e: errors.length }, { n: 1, e: 0 });
  });

  test('de-duplicates repeated quote text within one file', () => {
    const row = 'Q001,Same text.,Someone,10,,';
    const { quotes } = parseQuotesCsv(`${header}\n${row}\nQ002,Same text.,Other,10,,`);
    assert.equal(quotes.length, 1);
  });

  test('caps the number of rows it will accept', () => {
    const rows = Array.from({ length: 6000 }, (_, i) => `Q${i},Quote number ${i}.,A,10,,`).join('\n');
    const { errors } = parseQuotesCsv(`${header}\n${rows}`);
    assert.match(errors.join(' '), /too many|limit/i);
  });
});
