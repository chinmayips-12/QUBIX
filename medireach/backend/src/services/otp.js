import crypto from 'node:crypto';

const digest = (code, secret) => crypto.createHmac('sha256', secret).update(code).digest('hex');
const encryptionKey = secret => crypto.createHash('sha256').update(secret).digest();
export function createOtp(secret, fixedCode) {
  const code = fixedCode === undefined ? String(crypto.randomInt(100000, 1000000)) : String(fixedCode);
  if (!/^\d{6}$/.test(code)) throw new Error('OTP must contain exactly six digits');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(secret), iv);
  const encryptedCode = Buffer.concat([cipher.update(code, 'utf8'), cipher.final()]);
  const encrypted = Buffer.concat([iv, cipher.getAuthTag(), encryptedCode]).toString('base64');
  return { code, encrypted, hash: digest(code, secret), expiresAt: Date.now() + 15 * 60 * 1000, attempts: 0 };
}
export function matchesOtp(code, hash, secret) {
  const actual = Buffer.from(digest(String(code || ''), secret));
  const expected = Buffer.from(hash || '');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
export function decryptOtp(encrypted, secret) {
  const data = Buffer.from(encrypted, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(secret), data.subarray(0, 12));
  decipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString('utf8');
}
