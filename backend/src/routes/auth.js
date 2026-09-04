import express from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { query } from '../db/index.js';
import { issueSession, clearSession, requireAuth } from '../middleware/auth.js';
import { recordAudit, AUDIT_ACTIONS } from '../lib/audit.js';
import { KNOWN_DEFAULT_PASSWORDS } from '../db/seed.js';

const router = express.Router();

// Brute-force guard. Generous enough that a fat-fingered password won't lock
// out the office, tight enough to make guessing pointless.
const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Wait a few minutes and try again.' },
});

const publicUser = (u) => ({
  id: u.id,
  username: u.username,
  fullName: u.full_name,
  role: u.role,
  theme: u.theme,
  // Drives the blocking password-change screen in the UI.
  mustChangePassword: Boolean(u.must_change_password),
  // Which physical printer THIS person prints to, from their own desk.
  qzPrinterName: u.qz_printer_name || '',
});

const MIN_PASSWORD_LENGTH = 10;

/** Shared rules for any new password. Returns an error string, or null. */
function validateNewPassword(next, current) {
  if (next.length < MIN_PASSWORD_LENGTH) {
    return `New password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  if (next === current) {
    return 'New password must be different from your current one';
  }
  if (KNOWN_DEFAULT_PASSWORDS.includes(next)) {
    return 'That is the shipped default password — choose something else';
  }
  if (!/[a-z]/i.test(next) || !/\d/.test(next)) {
    return 'New password must contain at least one letter and one number';
  }
  return null;
}

router.post('/login', loginLimiter, async (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const { rows } = await query('SELECT * FROM users WHERE lower(username) = lower($1)', [
    username,
  ]);
  const user = rows[0];

  // Same message and roughly the same work either way — don't leak which
  // usernames exist.
  const ok = user ? await bcrypt.compare(password, user.password_hash) : false;

  if (!ok || !user.is_active) {
    await recordAudit(req, AUDIT_ACTIONS.LOGIN_FAILED, {}, { username });
    return res.status(401).json({ error: 'Incorrect username or password' });
  }

  await query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);
  issueSession(res, user);

  req.user = user;
  await recordAudit(req, AUDIT_ACTIONS.LOGIN, { type: 'user', id: user.id });

  return res.json({ user: publicUser(user) });
});

router.post('/logout', requireAuth, async (req, res) => {
  await recordAudit(req, AUDIT_ACTIONS.LOGOUT, { type: 'user', id: req.user.id });
  clearSession(res);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

/** Theme preference is per-user and persisted (Section 11). */
router.patch('/me/theme', requireAuth, async (req, res) => {
  const theme = String(req.body?.theme || '');
  if (!['light', 'dark', 'system'].includes(theme)) {
    return res.status(400).json({ error: 'Theme must be light, dark or system' });
  }
  await query('UPDATE users SET theme = $1 WHERE id = $2', [theme, req.user.id]);
  return res.json({ theme });
});

/**
 * Self-service password change. Also the way out of the forced-reset lock, so
 * it is deliberately NOT behind requirePasswordChanged.
 */
router.post('/me/password', requireAuth, async (req, res) => {
  const current = String(req.body?.currentPassword || '');
  const next = String(req.body?.newPassword || '');

  const problem = validateNewPassword(next, current);
  if (problem) return res.status(400).json({ error: problem });

  const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [
    req.user.id,
  ]);
  if (!(await bcrypt.compare(current, rows[0].password_hash))) {
    return res.status(400).json({ error: 'Current password is incorrect' });
  }

  await query(
    `UPDATE users
        SET password_hash = $1, must_change_password = FALSE, password_changed_at = now()
      WHERE id = $2`,
    [await bcrypt.hash(next, 12), req.user.id],
  );

  await recordAudit(req, AUDIT_ACTIONS.PASSWORD_CHANGED, {
    type: 'user',
    id: req.user.id,
  }, { forced: Boolean(req.user.must_change_password) });

  // Re-read so the response carries the now-cleared flag.
  const { rows: updated } = await query('SELECT * FROM users WHERE id = $1', [req.user.id]);
  return res.json({ ok: true, user: publicUser(updated[0]) });
});

/**
 * The signed-in user's own printer.
 *
 * Deliberately a personal setting, not a shared one: two people at different
 * desks print to different devices, and the cheque layout has nothing to do
 * with which box the paper comes out of.
 */
router.patch('/me/printer', requireAuth, async (req, res) => {
  const name = String(req.body?.qzPrinterName ?? '').trim();
  if (name.length > 255) {
    return res.status(400).json({ error: 'That printer name is too long' });
  }

  await query('UPDATE users SET qz_printer_name = $1 WHERE id = $2', [
    name || null,
    req.user.id,
  ]);

  return res.json({ qzPrinterName: name });
});

/** Password rules, so the UI can state them up front rather than after a 400. */
router.get('/password-policy', (_req, res) => {
  res.json({
    minLength: MIN_PASSWORD_LENGTH,
    requiresLetter: true,
    requiresNumber: true,
  });
});

export default router;
