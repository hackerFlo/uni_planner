const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NOTIFICATION_ENCRYPT_KEY = 'a'.repeat(64);
const { encryptEmail, decryptEmail } = require('./crypto');

test.describe('encryptEmail / decryptEmail', () => {
  // A review flagged `update(buf) + final('utf8')` as mis-decoding a multi-byte
  // character straddling the block boundary. It does not: AES-GCM is CTR-based,
  // so one update() returns the whole plaintext and final() returns ''. These
  // cases pin that, so the claim does not get "fixed" again on a later reading.
  const addresses = [
    ['ascii', 'plain@example.com'],
    ['latin-1 umlaut', 'muenchen-ü@example.com'],
    ['accented run', 'ünïcödé@example.com'],
    ['CJK', '日本語@example.com'],
    ['emoji (surrogate pair)', 'emoji😀test@example.com'],
    ['multi-byte at a 16-byte block edge', 'x'.repeat(15) + 'ü@example.com'],
    ['multi-byte at the 32-byte edge', 'y'.repeat(31) + '日@example.com'],
    ['max length', 'z'.repeat(240) + '@example.com'],
  ];

  for (const [label, address] of addresses) {
    test(`round-trips ${label}`, () => {
      assert.equal(decryptEmail(encryptEmail(address)), address);
    });
  }

  test('produces a different ciphertext each time (random IV)', () => {
    const a = encryptEmail('same@example.com');
    const b = encryptEmail('same@example.com');
    assert.notEqual(a, b);
  });

  test('rejects a tampered ciphertext rather than returning garbage', () => {
    const [iv, tag, enc] = encryptEmail('victim@example.com').split(':');
    const flipped = (parseInt(enc.slice(0, 2), 16) ^ 0xff).toString(16).padStart(2, '0');
    assert.throws(() => decryptEmail(`${iv}:${tag}:${flipped}${enc.slice(2)}`));
  });

  test('rejects a malformed stored value instead of throwing something opaque', () => {
    assert.throws(() => decryptEmail('not-a-triple'), /malformed/);
  });
});
