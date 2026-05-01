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
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return decipher.update(Buffer.from(encHex, 'hex')) + decipher.final('utf8');
}

module.exports = { encryptEmail, decryptEmail };
