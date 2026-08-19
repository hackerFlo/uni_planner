import test from 'node:test';
import assert from 'node:assert/strict';

import { parseAssetUrls, isStale } from './buildCheck.js';

const html = (...assets) =>
  `<!doctype html><html><head>${assets
    .map((a) => (a.endsWith('.css') ? `<link rel="stylesheet" href="${a}">` : `<script src="${a}"></script>`))
    .join('')}</head><body></body></html>`;

test.describe('parseAssetUrls', () => {
  test('pulls every hashed asset out of the document', () => {
    const entryJs = '/assets/index-AAA111.js';
    const entryCss = '/assets/index-BBB222.css';
    assert.deepEqual(parseAssetUrls(html(entryJs, entryCss)), [entryJs, entryCss].sort());
  });

  test('de-duplicates a URL named twice', () => {
    const twice = html('/assets/index-AAA111.js') + html('/assets/index-AAA111.js');
    assert.deepEqual(parseAssetUrls(twice), ['/assets/index-AAA111.js']);
  });

  test('ignores unhashed public files, which are not build fingerprints', () => {
    assert.deepEqual(parseAssetUrls('<link href="/fonts/Inter-latin.woff2">'), []);
  });

  test('returns nothing for markup it cannot read', () => {
    assert.deepEqual(parseAssetUrls('<html>offline placeholder</html>'), []);
  });

  test('survives a null body', () => {
    assert.deepEqual(parseAssetUrls(null), []);
  });
});

test.describe('isStale', () => {
  const running = ['/assets/index-AAA111.js', '/assets/index-BBB222.css'];

  test('is not stale when the page holds everything index.html names', () => {
    assert.equal(isStale(running, ['/assets/index-AAA111.js', '/assets/index-BBB222.css']), false);
  });

  test('is stale when the entry hash has moved on', () => {
    assert.equal(isStale(running, ['/assets/index-CCC333.js', '/assets/index-BBB222.css']), true);
  });

  // Vite injects modulepreload links for lazy chunks as you navigate, so the
  // live document routinely holds more than index.html lists.
  test('tolerates lazily loaded chunks the document gained after load', () => {
    const withLazyChunk = [...running, '/assets/LoginPage-DDD444.js'];
    assert.equal(isStale(withLazyChunk, ['/assets/index-AAA111.js']), false);
  });

  test('does not depend on ordering', () => {
    assert.equal(isStale([...running].reverse(), ['/assets/index-BBB222.css']), false);
  });

  test('never reports stale when index.html could not be parsed', () => {
    assert.equal(isStale(running, []), false);
  });

  test('holds its tongue when the running assets cannot be read either', () => {
    assert.equal(isStale([], ['/assets/index-CCC333.js']), false);
  });
});
