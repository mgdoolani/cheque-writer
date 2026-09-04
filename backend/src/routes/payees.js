/**
 * Payee book (Section 8). Address / contact / email / TIN are encrypted at rest
 * and decrypted only on the way out to a signed-in user.
 */

import express from 'express';
import { query } from '../db/index.js';
import { requireRole } from '../middleware/auth.js';
import { encrypt, decrypt } from '../lib/crypto.js';
import { recordAudit, AUDIT_ACTIONS } from '../lib/audit.js';

// requireAuth + requirePasswordChanged are applied in index.js.
const router = express.Router();

/** DB row -> API shape, decrypting the protected columns. */
const toApi = (row) => ({
  id: row.id,
  name: row.name,
  address: decrypt(row.address_enc) || '',
  contact: decrypt(row.contact_enc) || '',
  email: decrypt(row.email_enc) || '',
  tin: decrypt(row.tin_enc) || '',
  notes: row.notes || '',
  isActive: row.is_active,
  checkCount: row.check_count ?? undefined,
  createdAt: row.created_at,
});

router.get('/', async (req, res) => {
  const search = String(req.query.search || '').trim();
  const includeInactive = req.query.includeInactive === 'true';

  const conditions = [];
  const params = [];

  if (!includeInactive) conditions.push('p.is_active = TRUE');
  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    conditions.push(`lower(p.name) LIKE $${params.length}`);
  }

  const { rows } = await query(
    `SELECT p.*, (SELECT count(*)::int FROM checks c WHERE c.payee_id = p.id) AS check_count
       FROM payees p
      ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
      ORDER BY lower(p.name)`,
    params,
  );

  res.json({ payees: rows.map(toApi) });
});

router.get('/:id', async (req, res) => {
  const { rows } = await query('SELECT * FROM payees WHERE id = $1', [
    Number(req.params.id),
  ]);
  if (!rows.length) return res.status(404).json({ error: 'Payee not found' });
  return res.json({ payee: toApi(rows[0]) });
});

router.post('/', async (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Payee name is required' });

  const { rows } = await query(
    `INSERT INTO payees (name, address_enc, contact_enc, email_enc, tin_enc, notes, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [
      name,
      encrypt(req.body?.address),
      encrypt(req.body?.contact),
      encrypt(req.body?.email),
      encrypt(req.body?.tin),
      String(req.body?.notes || '').trim() || null,
      req.user.id,
    ],
  );

  await recordAudit(req, AUDIT_ACTIONS.PAYEE_CREATED, { type: 'payee', id: rows[0].id }, {
    name,
  });
  return res.status(201).json({ payee: toApi(rows[0]) });
});

router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Payee name is required' });

  const { rows } = await query(
    `UPDATE payees
        SET name = $1, address_enc = $2, contact_enc = $3, email_enc = $4,
            tin_enc = $5, notes = $6, is_active = $7, updated_at = now()
      WHERE id = $8
      RETURNING *`,
    [
      name,
      encrypt(req.body?.address),
      encrypt(req.body?.contact),
      encrypt(req.body?.email),
      encrypt(req.body?.tin),
      String(req.body?.notes || '').trim() || null,
      req.body?.isActive === undefined ? true : Boolean(req.body.isActive),
      id,
    ],
  );

  if (!rows.length) return res.status(404).json({ error: 'Payee not found' });

  await recordAudit(req, AUDIT_ACTIONS.PAYEE_UPDATED, { type: 'payee', id }, { name });
  return res.json({ payee: toApi(rows[0]) });
});

/**
 * Payees with history are deactivated rather than deleted — a cheque record
 * must keep pointing at who it was written to.
 */
router.delete('/:id', requireRole('admin'), async (req, res) => {
  const id = Number(req.params.id);

  const { rows: used } = await query(
    'SELECT count(*)::int AS n FROM checks WHERE payee_id = $1',
    [id],
  );

  if (used[0].n > 0) {
    const { rows } = await query(
      'UPDATE payees SET is_active = FALSE, updated_at = now() WHERE id = $1 RETURNING *',
      [id],
    );
    if (!rows.length) return res.status(404).json({ error: 'Payee not found' });
    await recordAudit(req, AUDIT_ACTIONS.PAYEE_UPDATED, { type: 'payee', id }, {
      deactivated: true,
      reason: 'has cheque history',
    });
    return res.json({ deactivated: true, payee: toApi(rows[0]) });
  }

  const { rows } = await query('DELETE FROM payees WHERE id = $1 RETURNING name', [id]);
  if (!rows.length) return res.status(404).json({ error: 'Payee not found' });

  await recordAudit(req, AUDIT_ACTIONS.PAYEE_DELETED, { type: 'payee', id }, {
    name: rows[0].name,
  });
  return res.json({ deleted: true });
});

export default router;
