/**
 * JWT session in an httpOnly cookie. The API and the UI are served from the
 * same origin, so there is no token in localStorage for a stray script to read
 * and no CORS surface to get wrong.
 */

import jwt from 'jsonwebtoken';
import { query } from '../db/index.js';

export const COOKIE_NAME = 'phcheck_session';
const TOKEN_TTL = '12h';

function secret() {
  const value = process.env.JWT_SECRET;
  if (!value || value.length < 32) {
    throw new Error('JWT_SECRET must be set to at least 32 characters');
  }
  return value;
}

export function issueSession(res, user) {
  const token = jwt.sign(
    { sub: user.id, username: user.username, role: user.role },
    secret(),
    { expiresIn: TOKEN_TTL },
  );

  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    // The office LAN runs plain HTTP; forcing Secure here would lock everyone
    // out. Set COOKIE_SECURE=true once the app sits behind HTTPS.
    secure: process.env.COOKIE_SECURE === 'true',
    maxAge: 12 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearSession(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

/** Populates `req.user`. 401s if the cookie is missing, stale or disabled. */
export async function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: 'Not signed in' });

  let payload;
  try {
    payload = jwt.verify(token, secret());
  } catch {
    clearSession(res);
    return res.status(401).json({ error: 'Session expired — please sign in again' });
  }

  // Re-read the user each request so a deactivated account or a role change
  // takes effect immediately rather than at token expiry.
  const { rows } = await query(
    `SELECT id, username, full_name, role, theme, is_active, must_change_password,
            qz_printer_name
       FROM users WHERE id = $1`,
    [payload.sub],
  );
  const user = rows[0];
  if (!user || !user.is_active) {
    clearSession(res);
    return res.status(401).json({ error: 'Account is no longer active' });
  }

  req.user = user;
  return next();
}

/**
 * Blocks everything except the password-change flow while an account is still
 * on a shipped default password. Mounted on the data routes, never on
 * /api/auth, so the user can still read their own record, change the password
 * and sign out.
 */
export function requirePasswordChanged(req, res, next) {
  if (req.user?.must_change_password) {
    return res.status(403).json({
      error: 'You must change your password before using the app',
      mustChangePassword: true,
    });
  }
  return next();
}

/** Route guard: `requireRole('admin')`. */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not signed in' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Your role cannot perform this action' });
    }
    return next();
  };
}
