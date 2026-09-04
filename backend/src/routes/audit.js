/**
 * Audit trail viewer (Section 9): who did what, when, and from where.
 *
 * Read-only by construction — there is no endpoint here that writes or deletes
 * a row. An audit log you can edit is not an audit log.
 */

import express from 'express';
import { query } from '../db/index.js';
import { requireRole } from '../middleware/auth.js';
import { AUDIT_ACTIONS } from '../lib/audit.js';

// requireAuth + requirePasswordChanged are applied in index.js.
const router = express.Router();
router.use(requireRole('admin'));

const VALID_ACTIONS = new Set(Object.values(AUDIT_ACTIONS));

/** Filter vocabulary for the viewer's dropdowns. */
router.get('/meta', async (_req, res) => {
  const { rows: users } = await query(
    `SELECT DISTINCT u.id, u.username
       FROM audit_logs a JOIN users u ON u.id = a.user_id
      ORDER BY u.username`,
  );
  const { rows: used } = await query(
    'SELECT DISTINCT action FROM audit_logs ORDER BY action',
  );

  res.json({
    actions: Object.values(AUDIT_ACTIONS),
    // Only the ones that have actually happened, so the filter isn't padded
    // with options that would always return nothing.
    actionsInUse: used.map((r) => r.action),
    users,
  });
});

router.get('/', async (req, res) => {
  const conditions = [];
  const params = [];
  const add = (sql, value) => {
    params.push(value);
    conditions.push(sql.replace('$?', `$${params.length}`));
  };

  if (req.query.action && VALID_ACTIONS.has(req.query.action)) {
    add('a.action = $?', req.query.action);
  }
  if (req.query.userId) add('a.user_id = $?', Number(req.query.userId));
  if (req.query.entityType) add('a.entity_type = $?', String(req.query.entityType));
  if (req.query.entityId) add('a.entity_id = $?', Number(req.query.entityId));
  if (req.query.from) add('a.created_at >= $?::date', req.query.from);
  // Inclusive of the whole end day, not just its midnight.
  if (req.query.to) add("a.created_at < ($?::date + interval '1 day')", req.query.to);
  if (req.query.search) {
    params.push(`%${String(req.query.search).toLowerCase()}%`);
    const p = `$${params.length}`;
    conditions.push(`(lower(a.username) LIKE ${p} OR lower(a.detail::text) LIKE ${p})`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);

  const { rows } = await query(
    `SELECT a.id, a.username, a.action, a.entity_type, a.entity_id,
            a.detail, a.ip_address, a.created_at, u.full_name
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.user_id
       ${where}
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT ${limit} OFFSET ${offset}`,
    params,
  );

  const { rows: totals } = await query(
    `SELECT count(*)::int AS n FROM audit_logs a ${where}`,
    params,
  );

  res.json({
    entries: rows.map((r) => ({
      id: r.id,
      username: r.username,
      fullName: r.full_name,
      action: r.action,
      entityType: r.entity_type,
      entityId: r.entity_id,
      detail: r.detail,
      ipAddress: r.ip_address,
      createdAt: r.created_at,
    })),
    total: totals[0].n,
    limit,
    offset,
  });
});

export default router;
