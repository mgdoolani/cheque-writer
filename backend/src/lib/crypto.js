/**
 * AES-256-GCM for the columns that hold personal data (payee address, contact,
 * TIN). Stored as "v1:<iv>:<tag>:<ciphertext>", all base64.
 *
 * Passwords are NOT handled here — they are bcrypt hashes (salted per-row by
 * bcrypt itself) and are never decryptable by design. See lib/password.js.
 */

import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const PREFIX = 'v1';
const IV_BYTES = 12; // GCM standard

let cachedKey = null;

function key() {
  if (cachedKey) return cachedKey;

  const hex = process.env.ENCRYPTION_KEY || '';
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(
      'ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes). ' +
        'Generate one with: openssl rand -hex 32',
    );
  }
  cachedKey = Buffer.from(hex, 'hex');
  return cachedKey;
}

/** @param {string|null|undefined} plaintext */
export function encrypt(plaintext) {
  if (plaintext === null || plaintext === undefined || plaintext === '') return null;

  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(String(plaintext), 'utf8'),
    cipher.final(),
  ]);

  return [
    PREFIX,
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    ciphertext.toString('base64'),
  ].join(':');
}

/**
 * Reverses {@link encrypt}. Returns null for empty input. Values that were
 * written before encryption was switched on (i.e. that lack the "v1:" prefix)
 * are returned unchanged so old rows stay readable.
 */
export function decrypt(stored) {
  if (stored === null || stored === undefined || stored === '') return null;

  const parts = String(stored).split(':');
  if (parts.length !== 4 || parts[0] !== PREFIX) return String(stored);

  const [, iv, tag, ciphertext] = parts;
  try {
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      key(),
      Buffer.from(iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    // Wrong key, or the row was tampered with. Never surface ciphertext.
    return null;
  }
}

/** Encrypt several fields of an object in place-ish, returning a new object. */
export function encryptFields(obj, fields) {
  const out = { ...obj };
  for (const f of fields) if (f in out) out[f] = encrypt(out[f]);
  return out;
}

/** Inverse of {@link encryptFields}. */
export function decryptFields(row, fields) {
  if (!row) return row;
  const out = { ...row };
  for (const f of fields) if (f in out) out[f] = decrypt(out[f]);
  return out;
}
