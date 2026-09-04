/**
 * Reporting (Section 6): monthly summary, cheque register totals, CSV export.
 *
 * Voided cheques are counted separately and excluded from money totals — a void
 * cheque was never a payment, and folding it into a monthly total would
 * overstate what actually left the account.
 */

import express from 'express';
import { query } from '../db/index.js';
import { buildCheckFilters } from '../lib/checkFilters.js';
import { formatAmount } from '../lib/amountToWords.js';
import { getSettings } from '../lib/settings.js';

// requireAuth + requirePasswordChanged are applied in index.js.
const router = express.Router();

/** Figures for the dashboard tiles. */
router.get('/dashboard', async (_req, res) => {
  const { rows } = await query(`
    SELECT
      count(*) FILTER (
        WHERE status <> 'void'
          AND date_trunc('month', check_date) = date_trunc('month', CURRENT_DATE)
      )::int AS month_count,
      coalesce(sum(amount) FILTER (
        WHERE status <> 'void'
          AND date_trunc('month', check_date) = date_trunc('month', CURRENT_DATE)
      ), 0) AS month_amount,
      count(*) FILTER (WHERE status = 'draft')::int AS awaiting_print,
      count(*) FILTER (WHERE status <> 'void')::int AS total_count
    FROM checks
  `);

  const { rows: payees } = await query(
    'SELECT count(*)::int AS n FROM payees WHERE is_active = TRUE',
  );

  const { rows: recent } = await query(`
    SELECT c.id, c.payee_name, c.amount, c.check_date, c.status, c.print_count,
           u.username AS created_by
      FROM checks c
      LEFT JOIN users u ON u.id = c.created_by
     ORDER BY c.created_at DESC
     LIMIT 6
  `);

  res.json({
    monthCount: rows[0].month_count,
    monthAmount: Number(rows[0].month_amount),
    awaitingPrint: rows[0].awaiting_print,
    totalCount: rows[0].total_count,
    activePayees: payees[0].n,
    recent: recent.map((r) => ({
      id: r.id,
      payeeName: r.payee_name,
      amount: Number(r.amount),
      checkDate: r.check_date,
      status: r.status,
      printCount: r.print_count,
      createdBy: r.created_by,
    })),
  });
});

/**
 * Month-by-month totals for a calendar year. Every month is present, including
 * empty ones, so a chart does not silently skip a quiet month.
 */
router.get('/monthly', async (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  if (year < 1970 || year > 9999) {
    return res.status(400).json({ error: 'Year is out of range' });
  }

  const { rows } = await query(
    `WITH months AS (
       SELECT generate_series(
         make_date($1::int, 1, 1),
         make_date($1::int, 12, 1),
         interval '1 month'
       )::date AS month
     )
     SELECT
       to_char(m.month, 'YYYY-MM')                                   AS month,
       to_char(m.month, 'Mon')                                       AS label,
       count(c.id) FILTER (WHERE c.status <> 'void')::int            AS count,
       coalesce(sum(c.amount) FILTER (WHERE c.status <> 'void'), 0)  AS amount,
       count(c.id) FILTER (WHERE c.status = 'void')::int             AS voided
       FROM months m
       LEFT JOIN checks c
         ON date_trunc('month', c.check_date) = m.month
      GROUP BY m.month
      ORDER BY m.month`,
    [year],
  );

  const months = rows.map((r) => ({
    month: r.month,
    label: r.label,
    count: r.count,
    amount: Number(r.amount),
    voided: r.voided,
  }));

  return res.json({
    year,
    months,
    total: {
      count: months.reduce((sum, m) => sum + m.count, 0),
      amount: months.reduce((sum, m) => sum + m.amount, 0),
      voided: months.reduce((sum, m) => sum + m.voided, 0),
    },
  });
});

/** Which years actually have data, so the year picker isn't a guess. */
router.get('/years', async (_req, res) => {
  const { rows } = await query(
    `SELECT DISTINCT extract(year FROM check_date)::int AS year
       FROM checks ORDER BY year DESC`,
  );
  const years = rows.map((r) => r.year);
  if (!years.length) years.push(new Date().getFullYear());
  res.json({ years });
});

/** Breakdown for the current filter: by status, by payee, by bank template. */
router.get('/summary', async (req, res) => {
  const { where, params } = buildCheckFilters(req.query);

  const { rows: byStatus } = await query(
    `SELECT c.status, count(*)::int AS count, coalesce(sum(c.amount), 0) AS amount
       FROM checks c ${where}
      GROUP BY c.status`,
    params,
  );

  const { rows: byPayee } = await query(
    `SELECT c.payee_name, count(*)::int AS count, coalesce(sum(c.amount), 0) AS amount
       FROM checks c ${where}
      ${where ? 'AND' : 'WHERE'} c.status <> 'void'
      GROUP BY c.payee_name
      ORDER BY amount DESC
      LIMIT 10`,
    params,
  );

  const { rows: byTemplate } = await query(
    `SELECT coalesce(t.name, 'No template') AS name,
            count(*)::int AS count,
            coalesce(sum(c.amount), 0) AS amount
       FROM checks c
       LEFT JOIN check_templates t ON t.id = c.template_id
       ${where}
      ${where ? 'AND' : 'WHERE'} c.status <> 'void'
      GROUP BY t.name
      ORDER BY amount DESC`,
    params,
  );

  const statusMap = Object.fromEntries(
    byStatus.map((r) => [r.status, { count: r.count, amount: Number(r.amount) }]),
  );

  res.json({
    byStatus: {
      draft: statusMap.draft || { count: 0, amount: 0 },
      printed: statusMap.printed || { count: 0, amount: 0 },
      void: statusMap.void || { count: 0, amount: 0 },
    },
    // Money total deliberately excludes voided cheques.
    total: {
      count: (statusMap.draft?.count || 0) + (statusMap.printed?.count || 0),
      amount: (statusMap.draft?.amount || 0) + (statusMap.printed?.amount || 0),
    },
    byPayee: byPayee.map((r) => ({
      payeeName: r.payee_name,
      count: r.count,
      amount: Number(r.amount),
    })),
    byTemplate: byTemplate.map((r) => ({
      name: r.name,
      count: r.count,
      amount: Number(r.amount),
    })),
  });
});

/** RFC 4180-ish quoting: wrap in quotes, double any quote inside. */
const csvCell = (value) => {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
};

/**
 * The register as CSV, using the same filters as the on-screen list — what you
 * export is what you were looking at.
 */
router.get('/register.csv', async (req, res) => {
  const { where, params } = buildCheckFilters(req.query);

  const { rows } = await query(
    `SELECT c.id, c.check_date, c.date_text, c.payee_name, c.amount, c.amount_words,
            c.check_number, c.memo, c.marking, c.status, c.print_count,
            c.first_printed_at, c.void_reason,
            t.name AS template_name, u.username AS created_by
       FROM checks c
       LEFT JOIN check_templates t ON t.id = c.template_id
       LEFT JOIN users u ON u.id = c.created_by
       ${where}
      ORDER BY c.check_date DESC, c.id DESC`,
    params,
  );

  const header = [
    'ID', 'Date', 'Date as printed', 'Payee', 'Amount', 'Amount in words',
    'Cheque no.', 'Memo', 'Marking', 'Status', 'Times printed',
    'First printed', 'Void reason', 'Template', 'Written by',
  ];

  const lines = [header.map(csvCell).join(',')];
  for (const r of rows) {
    lines.push([
      r.id, r.check_date, r.date_text, r.payee_name, formatAmount(r.amount),
      r.amount_words, r.check_number, r.memo, r.marking, r.status, r.print_count,
      r.first_printed_at ? new Date(r.first_printed_at).toISOString() : '',
      r.void_reason, r.template_name, r.created_by,
    ].map(csvCell).join(','));
  }

  // The company goes in the FILENAME rather than a title row: a preamble line
  // above the header breaks every strict CSV parser, and an export nobody can
  // load cleanly is worse than one that is merely anonymous.
  const { company_name: companyName } = await getSettings();
  const prefix = String(companyName || '')
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .toLowerCase();

  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `${prefix ? `${prefix}-` : ''}cheque-register-${stamp}.csv`;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  // Excel needs the BOM to read UTF-8 (peso signs, accented payee names).
  res.send(`﻿${lines.join('\r\n')}\r\n`);
});

export default router;
