const { randomBytes, createCipheriv, createDecipheriv } = require('crypto');

function getKey() {
  const hex = process.env.NOTIFICATION_ENCRYPT_KEY || '';
  if (hex.length !== 64) throw new Error('NOTIFICATION_ENCRYPT_KEY must be a 64-char hex string');
  return Buffer.from(hex, 'hex');
}

function encryptEmail(plaintext) {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

function decryptEmail(stored) {
  const key = getKey();
  const [ivHex, tagHex, encHex] = stored.split(':');
  if (!ivHex || !tagHex || !encHex) throw new Error('stored ciphertext is malformed');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  // Concat the buffers and decode once, rather than `update(buf) + final('utf8')`.
  // GCM is CTR-based, so today a single update() returns the whole plaintext and
  // final() returns '' -- the old form was correct, and a multi-byte character
  // could not straddle the boundary (verified against Latin-1, CJK and emoji
  // addresses). It only *looked* wrong because it relied on Buffer-to-string
  // coercion. Decoding explicitly says what it means and stays correct if the
  // input is ever chunked.
  return Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()]).toString('utf8');
}

module.exports = { encryptEmail, decryptEmail };
