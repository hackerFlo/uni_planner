import test from 'node:test';
import assert from 'node:assert/strict';

import { richTextToNodes, decodeEntities } from './richTextDom.js';

const text = t => ({ text: t });
const el = (tag, ...children) => ({ tag, children });

test.describe('decodeEntities', () => {
  test('decodes the entities the sanitiser produces', () => {
    assert.equal(decodeEntities('Tom &amp; Jerry'), 'Tom & Jerry');
  });

  test('decodes escaped angle brackets back to plain characters', () => {
    assert.equal(decodeEntities('&lt;img&gt;'), '<img>');
  });

  test('decodes a numeric reference', () => {
    assert.equal(decodeEntities('&#65;&#66;'), 'AB');
  });

  test('decodes a hex reference', () => {
    assert.equal(decodeEntities('&#x1F393;'), '\u{1F393}');
  });

  test('leaves an unknown entity alone rather than eating it', () => {
    assert.equal(decodeEntities('&nope;'), '&nope;');
  });
});

test.describe('richTextToNodes', () => {
  test('returns nothing for an empty description', () => {
    assert.deepEqual(richTextToNodes(''), []);
  });

  test('survives a non-string', () => {
    assert.deepEqual(richTextToNodes(null), []);
  });

  test('keeps plain text as a text node', () => {
    assert.deepEqual(richTextToNodes('read chapter 3'), [text('read chapter 3')]);
  });

  test('keeps the allowlisted inline tags', () => {
    assert.deepEqual(richTextToNodes('<strong>a</strong><em>b</em>'), [
      el('strong', text('a')),
      el('em', text('b')),
    ]);
  });

  test('keeps a list structure nested', () => {
    assert.deepEqual(richTextToNodes('<ul><li>one</li><li>two</li></ul>'), [
      el('ul', el('li', text('one')), el('li', text('two'))),
    ]);
  });

  test('treats br as a void element', () => {
    assert.deepEqual(richTextToNodes('a<br>b'), [text('a'), el('br'), text('b')]);
  });

  // The whole point of this module: escaped markup must come back as characters,
  // never as a node. This is exactly what the sanitiser now stores.
  test('renders escaped markup as literal text, not as an element', () => {
    assert.deepEqual(
      richTextToNodes('&lt;img src=x onerror=alert(1)&gt;'),
      [text('<img src=x onerror=alert(1)>')]
    );
  });

  test('drops a tag that is not on the allowlist', () => {
    assert.deepEqual(richTextToNodes('<script>alert(1)</script>'), [text('alert(1)')]);
  });

  test('drops an img even when it arrives unescaped', () => {
    assert.deepEqual(richTextToNodes('<img src=x onerror=alert(1)>ok'), [text('ok')]);
  });

  test('never emits a node for an unclosed allowlisted tag beyond its own kind', () => {
    assert.deepEqual(richTextToNodes('<strong>bold'), [el('strong', text('bold'))]);
  });

  // The client truncates descriptions at 5000 characters, which can cut mid-tag.
  test('tolerates a truncated trailing tag', () => {
    assert.deepEqual(richTextToNodes('done <stro'), [text('done <stro')]);
  });

  test('ignores a stray closing tag rather than collapsing the tree', () => {
    assert.deepEqual(richTextToNodes('</em>text'), [text('text')]);
  });

  test('produces no node type outside the allowlist, whatever the input', () => {
    const hostile = '<<x>img src=x onerror=alert(1)><svg/onload=alert(1)><a href="javascript:1">x</a>';
    const tags = [];
    const walk = specs => specs.forEach(s => { if (s.tag) { tags.push(s.tag); walk(s.children); } });
    walk(richTextToNodes(hostile));
    assert.deepEqual(tags.filter(t => !['strong', 'em', 'ul', 'li', 'br'].includes(t)), []);
  });
});
