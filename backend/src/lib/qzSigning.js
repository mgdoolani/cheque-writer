/**
 * QZ Tray request signing.
 *
 * QZ Tray will only print silently for a client whose requests are signed by a
 * certificate the local agent has been told to trust. That signing key is the
 * whole security boundary, so the rule this module exists to enforce is:
 *
 *     THE PRIVATE KEY NEVER LEAVES THE SERVER.
 *
 * The browser asks for the public certificate, and separately asks the server
 * to sign each request string. It never sees, and has no endpoint that could
 * return, the private half.
 *
 * A self-signed certificate is fine here: the app and the printer are on the
 * same office LAN, and QZ Tray's own "remember this decision" prompt is what
 * establishes trust on each workstation.
 */

import crypto from 'node:crypto';
import forge from 'node-forge';
import { query } from '../db/index.js';
import { encrypt, decrypt } from './crypto.js';

/** QZ Tray 2.1+ signs with SHA-512; the client is told this at handshake. */
export const SIGNATURE_ALGORITHM = 'SHA512';
const NODE_SIGN_ALGORITHM = 'RSA-SHA512';

const KEY_BITS = 2048;
const VALID_YEARS = 10;

// Cached after first load so a print run does not re-decrypt per request.
let cached = null;

function buildSelfSigned() {
  const keys = forge.pki.rsa.generateKeyPair(KEY_BITS);
  const cert = forge.pki.createCertificate();

  cert.publicKey = keys.publicKey;
  cert.serialNumber = `00${crypto.randomBytes(8).toString('hex')}`;
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + VALID_YEARS);

  const attrs = [
    { name: 'commonName', value: 'Cheque Writer' },
    { name: 'organizationName', value: 'Cheque Writer' },
    { shortName: 'OU', value: 'Cheque Printing' },
  ];
  cert.setSubject(attrs);
  // Self-signed: issuer is the subject.
  cert.setIssuer(attrs);
  cert.setExtensions([
    { name: 'basicConstraints', cA: true },
    { name: 'keyUsage', digitalSignature: true, keyCertSign: true },
    { name: 'extKeyUsage', codeSigning: true },
  ]);

  cert.sign(keys.privateKey, forge.md.sha256.create());

  const certificatePem = forge.pki.certificateToPem(cert);
  const privateKeyPem = forge.pki.privateKeyToPem(keys.privateKey);

  // Fingerprint so an admin can confirm the workstation approved this cert and
  // not some other one.
  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
  const fingerprint = crypto
    .createHash('sha256')
    .update(Buffer.from(der, 'binary'))
    .digest('hex')
    .match(/.{2}/g)
    .join(':')
    .toUpperCase();

  return { certificatePem, privateKeyPem, fingerprint, expiresAt: cert.validity.notAfter };
}

/**
 * Load the stored pair, creating one on first use. Generation takes a second or
 * two, so it happens lazily rather than blocking boot.
 */
export async function getSigningMaterial() {
  if (cached) return cached;

  const { rows } = await query('SELECT * FROM qz_signing WHERE id = 1');

  if (rows.length) {
    const privateKeyPem = decrypt(rows[0].private_key_enc);
    if (!privateKeyPem) {
      // ENCRYPTION_KEY changed, or the row was tampered with. Regenerating is
      // safe — it only means re-approving the certificate in QZ Tray once.
      throw new Error(
        'Stored QZ signing key could not be decrypted. Delete the qz_signing ' +
          'row to generate a new certificate, then re-approve it in QZ Tray.',
      );
    }
    cached = {
      certificatePem: rows[0].certificate_pem,
      privateKeyPem,
      fingerprint: rows[0].fingerprint,
      expiresAt: rows[0].expires_at,
    };
    return cached;
  }

  const fresh = buildSelfSigned();
  await query(
    `INSERT INTO qz_signing (id, certificate_pem, private_key_enc, fingerprint, expires_at)
     VALUES (1, $1, $2, $3, $4)
     ON CONFLICT (id) DO NOTHING`,
    [fresh.certificatePem, encrypt(fresh.privateKeyPem), fresh.fingerprint, fresh.expiresAt],
  );

  // Re-read: another request may have won the race and inserted first.
  const { rows: stored } = await query('SELECT * FROM qz_signing WHERE id = 1');
  cached = {
    certificatePem: stored[0].certificate_pem,
    privateKeyPem: decrypt(stored[0].private_key_enc),
    fingerprint: stored[0].fingerprint,
    expiresAt: stored[0].expires_at,
  };
  return cached;
}

/** The half that is safe to hand out. */
export async function getCertificate() {
  const { certificatePem, fingerprint, expiresAt } = await getSigningMaterial();
  return { certificatePem, fingerprint, expiresAt };
}

/**
 * Sign a QZ Tray request string.
 * @param {string} toSign the exact string QZ Tray asked the client to sign
 * @returns {Promise<string>} base64 signature
 */
export async function signRequest(toSign) {
  if (typeof toSign !== 'string' || toSign.length === 0) {
    throw new Error('Nothing to sign');
  }
  // QZ request strings are small JSON blobs; anything large is not one.
  if (toSign.length > 64 * 1024) {
    throw new Error('Payload to sign is unexpectedly large');
  }

  const { privateKeyPem } = await getSigningMaterial();
  return crypto.createSign(NODE_SIGN_ALGORITHM).update(toSign, 'utf8').sign(privateKeyPem, 'base64');
}

/** Forget the cached key, e.g. after regenerating. */
export function resetCache() {
  cached = null;
}

/** Throw away the current pair so the next request mints a new one. */
export async function regenerate() {
  await query('DELETE FROM qz_signing WHERE id = 1');
  resetCache();
  return getCertificate();
}
