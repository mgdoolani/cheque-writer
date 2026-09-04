/**
 * Append-only audit trail. Section 9: who printed what, and when.
 *
 * Writing an audit row must never fail a request that already succeeded, so
 * errors here are logged and swallowed.
 */

import { query } from '../db/index.js';

export const AUDIT_ACTIONS = {
  LOGIN: 'login',
  LOGIN_FAILED: 'login_failed',
  LOGOUT: 'logout',
  CHECK_CREATED: 'check_created',
  CHECK_UPDATED: 'check_updated',
  CHECK_PRINTED: 'check_printed',
  CHECK_REPRINTED: 'check_reprinted',
  CHECK_VOIDED: 'check_voided',
  CHECK_PREVIEWED: 'check_previewed',
  TEMPLATE_CREATED: 'template_created',
  TEMPLATE_UPDATED: 'template_updated',
  TEMPLATE_DELETED: 'template_deleted',
  PAYEE_CREATED: 'payee_created',
  PAYEE_UPDATED: 'payee_updated',
  PAYEE_DELETED: 'payee_deleted',
  USER_CREATED: 'user_created',
  USER_UPDATED: 'user_updated',
  PASSWORD_CHANGED: 'password_changed',
  SETTINGS_UPDATED: 'settings_updated',
};

function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length) return forwarded.split(',')[0].trim();
  return req.ip || null;
}

/**
 * @param {import('express').Request} req
 * @param {string} action        one of AUDIT_ACTIONS
 * @param {object} [entity]      `{ type, id }`
 * @param {object} [detail]      anything worth reading back later
 */
export async function recordAudit(req, action, entity = {}, detail = {}) {
  try {
    await query(
      `INSERT INTO audit_logs (user_id, username, action, entity_type, entity_id, detail, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
      [
        req.user?.id ?? null,
        req.user?.username ?? detail.username ?? 'anonymous',
        action,
        entity.type ?? null,
        entity.id ?? null,
        JSON.stringify(detail),
        clientIp(req),
      ],
    );
  } catch (err) {
    console.error('audit write failed:', err.message);
  }
}
