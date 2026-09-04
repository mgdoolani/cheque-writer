/**
 * Cheque records and printing (Sections 2b, 6, 9, 10).
 *
 * The words-form of the amount and the formatted date are computed once, at
 * create time, and stored on the row. Changing the currency label or date
 * format later must not silently rewrite what is already on paper.
 */

import path from 'node:path';
import express from 'express';
import { query, transaction } from '../db/index.js';
import { requireRole } from '../middleware/auth.js';
import { recordAudit, AUDIT_ACTIONS } from '../lib/audit.js';
import { getSettings } from '../lib/settings.js';
import { amountToWords, formatAmount, MAX_AMOUNT } from '../lib/amountToWords.js';
import { formatDate } from '../lib/dateFormats.js';
import { renderChecks } from '../lib/checkPdf.js';
import { toRenderTemplate, UPLOAD_DIR, SELECT_TEMPLATE_WITH_PRINTER } from './templates.js';
import { buildCheckFilters } from '../lib/checkFilters.js';

// requireAuth + requirePasswordChanged are applied in index.js.
const router = express.Router();

const MARKINGS = ['none', 'crossed', 'account_payee'];

const toApi = (row) => ({
  id: row.id,
  templateId: row.template_id,
  templateName: row.template_name ?? null,
  payeeId: row.payee_id,
  payeeName: row.payee_name,
  amount: Number(row.amount),
  amountFormatted: formatAmount(row.amount),
  amountWords: row.amount_words,
  checkDate: row.check_date,
  dateText: row.date_text,
  checkNumber: row.check_number || '',
  memo: row.memo || '',
  marking: row.marking,
  status: row.status,
  printCount: row.print_count,
  firstPrintedAt: row.first_printed_at,
  lastPrintedAt: row.last_printed_at,
  voidReason: row.void_reason,
  createdBy: row.created_by_name ?? null,
  createdAt: row.created_at,
});

const SELECT_CHECK = `
  SELECT c.*, t.name AS template_name, u.username AS created_by_name
    FROM checks c
    LEFT JOIN check_templates t ON t.id = c.template_id
    LEFT JOIN users u ON u.id = c.created_by`;

/**
 * Other live cheques that look like this one. Used to warn before creating a
 * second payment for the same thing (Section 9, duplicate prevention).
 */
async function findDuplicates({ payeeName, amount, checkDate, windowDays, excludeId }) {
  if (!windowDays) return [];
  const { rows } = await query(
    `SELECT id, payee_name, amount, check_date, status, print_count, created_at
       FROM checks
      WHERE status <> 'void'
        AND lower(payee_name) = lower($1)
        AND amount = $2
        AND check_date BETWEEN $3::date - $4::int AND $3::date + $4::int
        AND ($5::int IS NULL OR id <> $5::int)
      ORDER BY created_at DESC
      LIMIT 5`,
    [payeeName, amount, checkDate, windowDays, excludeId ?? null],
  );
  return rows;
}

// ── List / search (Section 6) ─────────────────────────────────────────────────

router.get('/', async (req, res) => {
  const { where, params } = buildCheckFilters(req.query);

  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);

  const { rows } = await query(
    `${SELECT_CHECK} ${where} ORDER BY c.check_date DESC, c.id DESC
      LIMIT ${limit} OFFSET ${offset}`,
    params,
  );

  // Totals describe the whole filtered set, not just the page on screen.
  const { rows: totals } = await query(
    `SELECT count(*)::int AS count, coalesce(sum(amount), 0) AS total
       FROM checks c ${where}`,
    params,
  );

  res.json({
    checks: rows.map(toApi),
    total: totals[0].count,
    totalAmount: Number(totals[0].total),
    limit,
    offset,
  });
});

router.get('/:id', async (req, res) => {
  const { rows } = await query(`${SELECT_CHECK} WHERE c.id = $1`, [Number(req.params.id)]);
  if (!rows.length) return res.status(404).json({ error: 'Cheque not found' });
  return res.json({ check: toApi(rows[0]) });
});

// ── Create (Section 2b) ───────────────────────────────────────────────────────

/**
 * Turn the request body into the values that will be printed, applying the
 * global settings. Shared by create and update.
 */
async function buildPrintableValues(body, settings) {
  const amount = Number(String(body?.amount ?? '').replace(/,/g, ''));
  const payeeName = String(body?.payeeName || '').trim();
  const checkDate = String(body?.checkDate || '').slice(0, 10);

  if (!payeeName) return { error: 'Payee is required' };
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: 'Amount must be greater than zero' };
  }
  if (amount > MAX_AMOUNT) return { error: 'Amount is too large' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkDate)) return { error: 'A valid date is required' };

  const marking = MARKINGS.includes(body?.marking) ? body.marking : 'none';

  return {
    payeeName,
    amount,
    checkDate,
    marking,
    // Snapshots — what actually goes on the paper.
    amountWords: amountToWords(amount, {
      style: settings.amount_words_style,
      currencyLabel: settings.currency_label,
      subunitLabel: settings.currency_subunit_label,
    }),
    dateText: formatDate(checkDate, settings.date_format),
  };
}

/**
 * Dry run of a cheque: the exact words, the exact date text, and any
 * look-alikes already on file — without saving anything.
 *
 * Deliberately shares `buildPrintableValues` with the create route. The form's
 * live preview and the printed cheque therefore come from one code path; a
 * client-side reimplementation of the words engine could drift from it, and a
 * preview that lies about what will print is worse than no preview.
 */
router.post('/preview', async (req, res) => {
  const settings = await getSettings();
  const values = await buildPrintableValues(req.body, settings);

  if (values.error) {
    // Not an error condition for a live preview — the user is still typing.
    return res.json({ valid: false, reason: values.error });
  }

  const duplicates = await findDuplicates({
    payeeName: values.payeeName,
    amount: values.amount,
    checkDate: values.checkDate,
    windowDays: settings.duplicate_warning_days,
    excludeId: req.body?.excludeId ? Number(req.body.excludeId) : null,
  });

  let numberTaken = false;
  const checkNumber = String(req.body?.checkNumber || '').trim();
  if (checkNumber) {
    const { rowCount } = await query(
      `SELECT 1 FROM checks
        WHERE check_number = $1 AND status <> 'void'
          AND ($2::int IS NULL OR id <> $2::int)`,
      [checkNumber, req.body?.excludeId ? Number(req.body.excludeId) : null],
    );
    numberTaken = rowCount > 0;
  }

  return res.json({
    valid: true,
    amount: values.amount,
    amountFormatted: formatAmount(values.amount),
    amountWords: values.amountWords,
    dateText: values.dateText,
    marking: values.marking,
    numberTaken,
    duplicates: duplicates.map((d) => ({
      id: d.id,
      payeeName: d.payee_name,
      amount: Number(d.amount),
      checkDate: d.check_date,
      status: d.status,
      printCount: d.print_count,
    })),
    settings: {
      amountWordsStyle: settings.amount_words_style,
      currencyLabel: settings.currency_label,
      subunitLabel: settings.currency_subunit_label,
      dateFormat: settings.date_format,
    },
  });
});

router.post('/', async (req, res) => {
  const settings = await getSettings();
  const values = await buildPrintableValues(req.body, settings);
  if (values.error) return res.status(400).json({ error: values.error });

  const duplicates = await findDuplicates({
    payeeName: values.payeeName,
    amount: values.amount,
    checkDate: values.checkDate,
    windowDays: settings.duplicate_warning_days,
  });

  // Surface the warning once; the client re-submits with confirmDuplicate.
  if (duplicates.length && !req.body?.confirmDuplicate) {
    return res.status(409).json({
      error: 'A similar cheque already exists',
      duplicates: duplicates.map((d) => ({
        id: d.id,
        payeeName: d.payee_name,
        amount: Number(d.amount),
        checkDate: d.check_date,
        status: d.status,
        printCount: d.print_count,
      })),
      requiresConfirmation: true,
    });
  }

  const checkNumber = String(req.body?.checkNumber || '').trim() || null;
  if (checkNumber) {
    const { rowCount } = await query(
      `SELECT 1 FROM checks WHERE check_number = $1 AND status <> 'void'`,
      [checkNumber],
    );
    if (rowCount) {
      return res.status(409).json({ error: `Cheque number ${checkNumber} is already recorded` });
    }
  }

  const { rows } = await query(
    `INSERT INTO checks
       (template_id, payee_id, payee_name, amount, amount_words, check_date,
        date_text, check_number, memo, marking, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING id`,
    [
      req.body?.templateId ? Number(req.body.templateId) : null,
      req.body?.payeeId ? Number(req.body.payeeId) : null,
      values.payeeName,
      values.amount,
      values.amountWords,
      values.checkDate,
      values.dateText,
      checkNumber,
      String(req.body?.memo || '').trim() || null,
      values.marking,
      req.user.id,
    ],
  );

  await recordAudit(req, AUDIT_ACTIONS.CHECK_CREATED, { type: 'check', id: rows[0].id }, {
    payee: values.payeeName,
    amount: values.amount,
    confirmedOverDuplicate: Boolean(duplicates.length),
  });

  const { rows: created } = await query(`${SELECT_CHECK} WHERE c.id = $1`, [rows[0].id]);
  return res.status(201).json({ check: toApi(created[0]) });
});

router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { rows: existing } = await query('SELECT * FROM checks WHERE id = $1', [id]);
  if (!existing.length) return res.status(404).json({ error: 'Cheque not found' });

  if (existing[0].status === 'void') {
    return res.status(400).json({ error: 'A voided cheque cannot be edited' });
  }
  // Editing after printing would put the record out of step with the paper.
  if (existing[0].print_count > 0) {
    return res
      .status(400)
      .json({ error: 'This cheque has been printed. Void it and create a replacement instead.' });
  }

  const settings = await getSettings();
  const values = await buildPrintableValues(req.body, settings);
  if (values.error) return res.status(400).json({ error: values.error });

  const checkNumber = String(req.body?.checkNumber || '').trim() || null;
  if (checkNumber) {
    const { rowCount } = await query(
      `SELECT 1 FROM checks WHERE check_number = $1 AND status <> 'void' AND id <> $2`,
      [checkNumber, id],
    );
    if (rowCount) {
      return res.status(409).json({ error: `Cheque number ${checkNumber} is already recorded` });
    }
  }

  await query(
    `UPDATE checks
        SET template_id = $1, payee_id = $2, payee_name = $3, amount = $4,
            amount_words = $5, check_date = $6, date_text = $7, check_number = $8,
            memo = $9, marking = $10, updated_at = now()
      WHERE id = $11`,
    [
      req.body?.templateId ? Number(req.body.templateId) : null,
      req.body?.payeeId ? Number(req.body.payeeId) : null,
      values.payeeName,
      values.amount,
      values.amountWords,
      values.checkDate,
      values.dateText,
      checkNumber,
      String(req.body?.memo || '').trim() || null,
      values.marking,
      id,
    ],
  );

  await recordAudit(req, AUDIT_ACTIONS.CHECK_UPDATED, { type: 'check', id }, {
    payee: values.payeeName,
    amount: values.amount,
  });

  const { rows } = await query(`${SELECT_CHECK} WHERE c.id = $1`, [id]);
  return res.json({ check: toApi(rows[0]) });
});

// ── Rendering ─────────────────────────────────────────────────────────────────

/** Assemble the `{ template, values, signaturePath }` the renderer needs. */
async function renderPayload(checkRow) {
  const templateId = checkRow.template_id;
  const { rows } = templateId
    ? await query(`${SELECT_TEMPLATE_WITH_PRINTER} WHERE t.id = $1`, [templateId])
    : await query(
        `${SELECT_TEMPLATE_WITH_PRINTER}
          WHERE t.is_active = TRUE
          ORDER BY t.is_default DESC, t.id
          LIMIT 1`,
      );

  if (!rows.length) return { error: 'No cheque template is configured' };
  const template = rows[0];

  return {
    template: toRenderTemplate(template),
    signaturePath: template.signature_image
      ? path.join(UPLOAD_DIR, path.basename(template.signature_image))
      : null,
    values: {
      date: checkRow.date_text,
      // Segmented boxes derive their own digits from the raw date, using the
      // template's pattern rather than the global display format.
      date_iso: checkRow.check_date,
      payee: checkRow.payee_name,
      amount_numeric: formatAmount(checkRow.amount),
      amount_words: checkRow.amount_words,
      memo: checkRow.memo || '',
      account_payee: checkRow.marking === 'account_payee' ? 'ACCOUNT PAYEE ONLY' : '',
    },
    marking: checkRow.marking,
  };
}

/** Honour the per-cheque marking on top of the template's own field flags. */
function applyMarking(payload) {
  const fields = payload.template.fields.map((f) => ({ ...f }));

  for (const field of fields) {
    if (field.key === 'crossing') field.enabled = payload.marking === 'crossed';
    if (field.key === 'account_payee') field.enabled = payload.marking === 'account_payee';
  }

  return { ...payload.template, fields };
}

/** Watermarked preview. Does not touch print counts. */
router.get('/:id/preview.pdf', async (req, res) => {
  const { rows } = await query('SELECT * FROM checks WHERE id = $1', [Number(req.params.id)]);
  if (!rows.length) return res.status(404).json({ error: 'Cheque not found' });

  const payload = await renderPayload(rows[0]);
  if (payload.error) return res.status(400).json({ error: payload.error });

  await recordAudit(req, AUDIT_ACTIONS.CHECK_PREVIEWED, { type: 'check', id: rows[0].id });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="cheque-preview.pdf"');
  return renderChecks(
    [{ template: applyMarking(payload), values: payload.values, signaturePath: payload.signaturePath }],
    { draft: true },
  ).pipe(res);
});

/**
 * The real thing. Marks the cheque printed and increments the counter in the
 * same transaction that authorises the render, so two people hitting Print at
 * once cannot both be told they were first.
 */
router.post('/:id/print', async (req, res) => {
  const id = Number(req.params.id);
  const settings = await getSettings();
  const reason = String(req.body?.reason || '').trim();

  let row;
  try {
    row = await transaction(async (client) => {
      const { rows } = await client.query(
        'SELECT * FROM checks WHERE id = $1 FOR UPDATE',
        [id],
      );
      if (!rows.length) throw Object.assign(new Error('Cheque not found'), { status: 404 });

      const check = rows[0];
      if (check.status === 'void') {
        throw Object.assign(new Error('This cheque is void and cannot be printed'), {
          status: 400,
        });
      }

      if (check.print_count > 0) {
        if (!settings.allow_reprint) {
          throw Object.assign(
            new Error('This cheque has already been printed and reprinting is disabled'),
            { status: 409, alreadyPrinted: true },
          );
        }
        if (!req.body?.confirmReprint) {
          throw Object.assign(
            new Error(
              `This cheque was already printed ${check.print_count} time(s) on ` +
                `${new Date(check.last_printed_at).toLocaleString()}.`,
            ),
            {
              status: 409,
              requiresConfirmation: true,
              alreadyPrinted: true,
              // So the confirm dialog knows whether to insist on a reason,
              // rather than guessing and blocking the user needlessly.
              requiresReason: settings.require_reprint_reason,
            },
          );
        }
        if (settings.require_reprint_reason && !reason) {
          throw Object.assign(new Error('A reason is required to reprint'), {
            status: 400,
            requiresReason: true,
          });
        }
      }

      const { rows: updated } = await client.query(
        `UPDATE checks
            SET status = 'printed',
                print_count = print_count + 1,
                first_printed_at = coalesce(first_printed_at, now()),
                last_printed_at = now(),
                updated_at = now()
          WHERE id = $1
          RETURNING *`,
        [id],
      );
      return updated[0];
    });
  } catch (err) {
    return res.status(err.status || 500).json({
      error: err.message,
      requiresConfirmation: err.requiresConfirmation,
      requiresReason: err.requiresReason,
      alreadyPrinted: err.alreadyPrinted,
    });
  }

  const payload = await renderPayload(row);
  if (payload.error) return res.status(400).json({ error: payload.error });

  await recordAudit(
    req,
    row.print_count > 1 ? AUDIT_ACTIONS.CHECK_REPRINTED : AUDIT_ACTIONS.CHECK_PRINTED,
    { type: 'check', id },
    {
      payee: row.payee_name,
      amount: Number(row.amount),
      checkNumber: row.check_number,
      printCount: row.print_count,
      reason: reason || undefined,
    },
  );

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="cheque-${id}.pdf"`);
  return renderChecks([
    { template: applyMarking(payload), values: payload.values, signaturePath: payload.signaturePath },
  ]).pipe(res);
});

/** Batch print: one PDF, one page per cheque (Section 11). */
router.post('/batch-print', async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Boolean) : [];
  if (!ids.length) return res.status(400).json({ error: 'Select at least one cheque' });
  if (ids.length > 50) return res.status(400).json({ error: 'Batch limit is 50 cheques' });

  const settings = await getSettings();

  let printed;
  try {
    printed = await transaction(async (client) => {
      const { rows } = await client.query(
        `SELECT * FROM checks WHERE id = ANY($1::int[]) ORDER BY check_date, id FOR UPDATE`,
        [ids],
      );

      const voided = rows.filter((r) => r.status === 'void');
      if (voided.length) {
        throw Object.assign(
          new Error(`Cheque #${voided[0].id} is void — remove it from the batch`),
          { status: 400 },
        );
      }

      const reprints = rows.filter((r) => r.print_count > 0);
      if (reprints.length && !req.body?.confirmReprint) {
        throw Object.assign(
          new Error(`${reprints.length} of these have already been printed`),
          { status: 409, requiresConfirmation: true, ids: reprints.map((r) => r.id) },
        );
      }
      if (reprints.length && !settings.allow_reprint) {
        throw Object.assign(new Error('Reprinting is disabled in Settings'), { status: 409 });
      }

      const { rows: updated } = await client.query(
        `UPDATE checks
            SET status = 'printed', print_count = print_count + 1,
                first_printed_at = coalesce(first_printed_at, now()),
                last_printed_at = now(), updated_at = now()
          WHERE id = ANY($1::int[])
          RETURNING *`,
        [rows.map((r) => r.id)],
      );
      return updated;
    });
  } catch (err) {
    return res.status(err.status || 500).json({
      error: err.message,
      requiresConfirmation: err.requiresConfirmation,
      ids: err.ids,
    });
  }

  const pages = [];
  for (const row of printed) {
    const payload = await renderPayload(row);
    if (payload.error) continue;
    pages.push({
      template: applyMarking(payload),
      values: payload.values,
      signaturePath: payload.signaturePath,
    });
  }
  if (!pages.length) return res.status(400).json({ error: 'No cheque template is configured' });

  await recordAudit(req, AUDIT_ACTIONS.CHECK_PRINTED, { type: 'check', id: null }, {
    batch: true,
    ids: printed.map((r) => r.id),
    count: printed.length,
    totalAmount: printed.reduce((sum, r) => sum + Number(r.amount), 0),
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="cheque-batch.pdf"');
  return renderChecks(pages).pipe(res);
});

router.post('/:id/void', requireRole('admin'), async (req, res) => {
  const id = Number(req.params.id);
  const reason = String(req.body?.reason || '').trim();
  if (!reason) return res.status(400).json({ error: 'A reason is required to void a cheque' });

  const { rows } = await query(
    `UPDATE checks SET status = 'void', void_reason = $1, voided_at = now(), updated_at = now()
      WHERE id = $2 AND status <> 'void'
      RETURNING *`,
    [reason, id],
  );
  if (!rows.length) {
    return res.status(404).json({ error: 'Cheque not found, or already void' });
  }

  await recordAudit(req, AUDIT_ACTIONS.CHECK_VOIDED, { type: 'check', id }, {
    payee: rows[0].payee_name,
    amount: Number(rows[0].amount),
    reason,
  });
  return res.json({ check: toApi(rows[0]) });
});

export default router;
