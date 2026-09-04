/**
 * QZ Tray endpoints.
 *
 * Exactly two things cross the wire: the PUBLIC certificate, and a signature
 * over a string the client supplies. There is deliberately no endpoint that
 * returns the private key, and no code path that could — see lib/qzSigning.js.
 */

import express from 'express';
import rateLimit from 'express-rate-limit';
import { requireRole } from '../middleware/auth.js';
import { getCertificate, signRequest, regenerate, SIGNATURE_ALGORITHM } from '../lib/qzSigning.js';
import { recordAudit, AUDIT_ACTIONS } from '../lib/audit.js';

// requireAuth + requirePasswordChanged are applied in index.js.
const router = express.Router();

/**
 * A signature is needed per connection and per print job, so this has to be
 * generous — but it is still a signing oracle for anyone with a session, and
 * an unbounded one would let a compromised account grind out requests.
 */
const signLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many signing requests — slow down.' },
});

/** Is direct printing usable, and which certificate is in force? */
router.get('/status', async (_req, res) => {
  try {
    const { fingerprint, expiresAt } = await getCertificate();
    res.json({
      available: true,
      signatureAlgorithm: SIGNATURE_ALGORITHM,
      fingerprint,
      expiresAt,
    });
  } catch (err) {
    res.json({ available: false, error: err.message });
  }
});

/** The public certificate QZ Tray checks signatures against. */
router.get('/certificate', async (_req, res) => {
  try {
    const { certificatePem } = await getCertificate();
    res.type('text/plain').send(certificatePem);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Sign a request string. The body is `{ request: "<exact string>" }`; the
 * response is the bare base64 signature, which is what QZ's signature promise
 * expects to resolve with.
 */
router.post('/sign', signLimiter, async (req, res) => {
  try {
    const signature = await signRequest(String(req.body?.request ?? ''));
    res.type('text/plain').send(signature);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/** Mint a fresh pair. Every workstation must then re-approve it once. */
router.post('/regenerate', requireRole('admin'), async (req, res) => {
  try {
    const { fingerprint, expiresAt } = await regenerate();
    await recordAudit(req, AUDIT_ACTIONS.SETTINGS_UPDATED, { type: 'qz' }, {
      regeneratedCertificate: true,
      fingerprint,
    });
    res.json({ fingerprint, expiresAt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
