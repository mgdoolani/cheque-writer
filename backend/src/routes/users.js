/** User administration. Admin-only; roles are Admin and Accounting (Section 7). */

import express from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db/index.js';
import { requireRole } from '../middleware/auth.js';
import { recordAudit, AUDIT_ACTIONS } from '../lib/audit.js';
import { getSettings } from '../lib/settings.js';

const router = express.Router();
// requireAuth + requirePasswordChanged are applied in index.js.
router.use(requireRole('admin'));

const ROLES = ['admin', 'accounting'];

// Kept in step with validateNewPassword in routes/auth.js. An admin-set
// password is temporary — the account is forced to change it on first use —
// but it still travels over the LAN, so it gets the same floor.
const MIN_PASSWORD_LENGTH = 10;

function validatePassword(password) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  if (!/[a-z]/i.test(password) || !/\d/.test(password)) {
    return 'Password must contain at least one letter and one number';
  }
  return null;
}

router.get('/policy', (_req, res) => {
  res.json({ minLength: MIN_PASSWORD_LENGTH, requiresLetter: true, requiresNumber: true, roles: ROLES });
});

router.get('/', async (_req, res) => {
  const { rows } = await query(
    `SELECT id, username, full_name, role, is_active, must_change_password,
            created_at, last_login_at, password_changed_at
       FROM users ORDER BY lower(username)`,
  );
  res.json({ users: rows });
});

router.post('/', async (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  const fullName = String(req.body?.fullName || '').trim();
  const role = String(req.body?.role || 'accounting');

  if (username.length < 3) {
    return res.status(400).json({ error: 'Username must be at least 3 characters' });
  }
  const passwordProblem = validatePassword(password);
  if (passwordProblem) return res.status(400).json({ error: passwordProblem });

  if (!ROLES.includes(role)) {
    return res.status(400).json({ error: 'Role must be admin or accounting' });
  }

  const exists = await query('SELECT 1 FROM users WHERE lower(username) = lower($1)', [
    username,
  ]);
  if (exists.rowCount) {
    return res.status(409).json({ error: 'That username is already taken' });
  }

  // New accounts start on the organisation's default theme (Settings), and are
  // locked to the password-change screen: the admin chose this password and
  // knows it, so it is temporary by definition — same rule as an admin reset.
  const { default_theme: defaultTheme } = await getSettings();

  const { rows } = await query(
    `INSERT INTO users (username, password_hash, full_name, role, theme,
                        must_change_password)
     VALUES ($1, $2, $3, $4, $5, TRUE)
     RETURNING id, username, full_name, role, theme, is_active,
               must_change_password, created_at, last_login_at`,
    [username, await bcrypt.hash(password, 12), fullName, role, defaultTheme],
  );

  await recordAudit(req, AUDIT_ACTIONS.USER_CREATED, { type: 'user', id: rows[0].id }, {
    username,
    role,
  });
  return res.status(201).json({ user: rows[0] });
});

router.patch('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { rows: existing } = await query('SELECT * FROM users WHERE id = $1', [id]);
  if (!existing.length) return res.status(404).json({ error: 'User not found' });

  const target = existing[0];
  const updates = [];
  const params = [];

  if (req.body?.fullName !== undefined) {
    params.push(String(req.body.fullName).trim());
    updates.push(`full_name = $${params.length}`);
  }

  if (req.body?.role !== undefined) {
    const role = String(req.body.role);
    if (!ROLES.includes(role)) {
      return res.status(400).json({ error: 'Role must be admin or accounting' });
    }
    // Don't let the last admin demote themselves into a locked-out system.
    if (target.role === 'admin' && role !== 'admin' && (await isLastAdmin(id))) {
      return res.status(400).json({ error: 'This is the only admin — promote someone else first' });
    }
    params.push(role);
    updates.push(`role = $${params.length}`);
  }

  if (req.body?.isActive !== undefined) {
    const isActive = Boolean(req.body.isActive);
    if (!isActive && target.role === 'admin' && (await isLastAdmin(id))) {
      return res.status(400).json({ error: 'This is the only admin — you cannot deactivate it' });
    }
    if (!isActive && id === req.user.id) {
      return res.status(400).json({ error: 'You cannot deactivate your own account' });
    }
    params.push(isActive);
    updates.push(`is_active = $${params.length}`);
  }

  if (req.body?.password) {
    const password = String(req.body.password);
    const problem = validatePassword(password);
    if (problem) return res.status(400).json({ error: problem });

    params.push(await bcrypt.hash(password, 12));
    updates.push(`password_hash = $${params.length}`);
    // An admin-set password is a temporary one — the owner picks their own.
    updates.push('must_change_password = TRUE');
  }

  if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });

  params.push(id);
  const { rows } = await query(
    `UPDATE users SET ${updates.join(', ')} WHERE id = $${params.length}
     RETURNING id, username, full_name, role, is_active,
               must_change_password, created_at, last_login_at`,
    params,
  );

  await recordAudit(req, AUDIT_ACTIONS.USER_UPDATED, { type: 'user', id }, {
    username: target.username,
    changed: Object.keys(req.body || {}).filter((k) => k !== 'password'),
    passwordReset: Boolean(req.body?.password),
  });

  return res.json({ user: rows[0] });
});

async function isLastAdmin(excludingId) {
  const { rows } = await query(
    `SELECT count(*)::int AS n FROM users
      WHERE role = 'admin' AND is_active = TRUE AND id <> $1`,
    [excludingId],
  );
  return rows[0].n === 0;
}

export default router;
