/**
 * Printer profiles — sheet constraints and feed calibration, held once per
 * printer instead of once per bank template.
 *
 * Not admin-only, for the same reason Print Options is not: the person who
 * discovers the printer eats a 76mm page is the person standing at it.
 * Designing a cheque layout stays an admin job.
 */

import express from 'express';
import { query } from '../db/index.js';
import { recordAudit, AUDIT_ACTIONS } from '../lib/audit.js';
import { PRINTER_MODELS, OTHER_MODEL, HEIGHT_DISCOVERY } from '../lib/printerModels.js';
import { renderAlignmentSheet } from '../lib/checkPdf.js';
import { sanitizeFields } from '../lib/checkLayout.js';

// requireAuth + requirePasswordChanged are applied in index.js.
const router = express.Router();

const FEED_PATHS = ['center', 'left', 'right'];
const ROTATIONS = [0, 90, 180, 270];

const toApi = (row) => ({
  id: row.id,
  name: row.name,
  model: row.model,
  minPageWidthMm: Number(row.min_page_width_mm),
  minPageHeightMm: Number(row.min_page_height_mm),
  feedPath: row.feed_path,
  offsetXMm: Number(row.offset_x_mm),
  offsetYMm: Number(row.offset_y_mm),
  rotation: Number(row.rotation) || 0,
  qzPrinterName: row.qz_printer_name || '',
  workstation: row.workstation || '',
  calibratedBy: row.calibrated_by_name ?? null,
  calibratedAt: row.calibrated_at ?? null,
  calibratedOnPrinter: row.calibrated_on_printer || '',
  notes: row.notes || '',
  isDefault: row.is_default,
  templateCount: row.template_count ?? undefined,
  updatedAt: row.updated_at,
});

/** Shape a profile the way checkPdf.js expects it. */
export const toRenderPrinter = (row) =>
  row && {
    name: row.name,
    min_page_width_mm: Number(row.min_page_width_mm),
    min_page_height_mm: Number(row.min_page_height_mm),
    feed_path: row.feed_path,
    offset_x_mm: Number(row.offset_x_mm),
    offset_y_mm: Number(row.offset_y_mm),
    rotation: Number(row.rotation) || 0,
  };

/** Everything the wizard needs to ask its questions. */
router.get('/catalogue', (_req, res) => {
  res.json({
    models: PRINTER_MODELS,
    other: OTHER_MODEL,
    heightDiscovery: HEIGHT_DISCOVERY,
    feedPaths: FEED_PATHS,
    rotations: ROTATIONS,
  });
});

router.get('/', async (_req, res) => {
  const { rows } = await query(
    `SELECT p.*, u.username AS calibrated_by_name,
            (SELECT count(*)::int FROM check_templates t
              WHERE t.printer_profile_id = p.id) AS template_count
       FROM printer_profiles p
       LEFT JOIN users u ON u.id = p.calibrated_by
      ORDER BY p.is_default DESC, lower(p.name)`,
  );
  res.json({ printers: rows.map(toApi) });
});

router.get('/:id', async (req, res) => {
  const { rows } = await query(
    `SELECT p.*, u.username AS calibrated_by_name
       FROM printer_profiles p
       LEFT JOIN users u ON u.id = p.calibrated_by
      WHERE p.id = $1`,
    [Number(req.params.id)],
  );
  if (!rows.length) return res.status(404).json({ error: 'Printer not found' });
  return res.json({ printer: toApi(rows[0]) });
});

function readBody(body, current = {}) {
  const name = String(body?.name ?? current.name ?? '').trim();
  const minH = Number(body?.minPageHeightMm ?? current.min_page_height_mm ?? 0);
  const minW = Number(body?.minPageWidthMm ?? current.min_page_width_mm ?? 0);
  const offX = Number(body?.offsetXMm ?? current.offset_x_mm ?? 0);
  const offY = Number(body?.offsetYMm ?? current.offset_y_mm ?? 0);

  if (!name) return { error: 'Give the printer a name' };
  if (![minH, minW, offX, offY].every(Number.isFinite)) {
    return { error: 'Measurements must be numbers' };
  }
  if (minH < 0 || minH > 1000 || minW < 0 || minW > 1000) {
    return { error: 'Minimum page size looks wrong — check the mm values' };
  }

  return {
    name,
    model: String(body?.model ?? current.model ?? '').trim(),
    minPageWidthMm: minW,
    minPageHeightMm: minH,
    feedPath: FEED_PATHS.includes(body?.feedPath)
      ? body.feedPath
      : current.feed_path || 'center',
    rotation: ROTATIONS.includes(Number(body?.rotation))
      ? Number(body.rotation)
      : Number(current.rotation) || 0,
    workstation: String(body?.workstation ?? current.workstation ?? '').trim() || null,
    // The OS printer name as QZ Tray enumerates it. Empty means "no direct
    // printing configured" and the browser fallback is used.
    qzPrinterName: String(body?.qzPrinterName ?? current.qz_printer_name ?? '').trim() || null,
    offsetXMm: offX,
    offsetYMm: offY,
    notes: String(body?.notes ?? current.notes ?? '').trim() || null,
  };
}

/** Exactly one profile is the default, so a new template can inherit it. */
async function ensureSingleDefault(id) {
  await query('UPDATE printer_profiles SET is_default = (id = $1)', [id]);
}

router.post('/', async (req, res) => {
  const values = readBody(req.body);
  if (values.error) return res.status(400).json({ error: values.error });

  const { rows: existing } = await query('SELECT count(*)::int AS n FROM printer_profiles');
  const isFirst = existing[0].n === 0;

  const { rows } = await query(
    `INSERT INTO printer_profiles
       (name, model, min_page_width_mm, min_page_height_mm, feed_path,
        offset_x_mm, offset_y_mm, rotation, qz_printer_name, workstation,
        notes, is_default)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [
      values.name, values.model, values.minPageWidthMm, values.minPageHeightMm,
      values.feedPath, values.offsetXMm, values.offsetYMm, values.rotation,
      values.qzPrinterName, values.workstation, values.notes,
      isFirst || Boolean(req.body?.isDefault),
    ],
  );

  if (isFirst || req.body?.isDefault) await ensureSingleDefault(rows[0].id);

  await recordAudit(req, AUDIT_ACTIONS.TEMPLATE_UPDATED, { type: 'printer', id: rows[0].id }, {
    name: values.name,
    created: true,
    minPageHeightMm: values.minPageHeightMm,
  });

  const { rows: fresh } = await query('SELECT * FROM printer_profiles WHERE id = $1', [rows[0].id]);
  return res.status(201).json({ printer: toApi(fresh[0]) });
});

router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { rows: existing } = await query('SELECT * FROM printer_profiles WHERE id = $1', [id]);
  if (!existing.length) return res.status(404).json({ error: 'Printer not found' });

  const values = readBody(req.body, existing[0]);
  if (values.error) return res.status(400).json({ error: values.error });

  const before = existing[0];
  // Attribution is stamped only when the numbers that came off a real test
  // print change. Renaming a profile is not a recalibration.
  const recalibrated =
    Number(before.offset_x_mm) !== values.offsetXMm ||
    Number(before.offset_y_mm) !== values.offsetYMm ||
    Number(before.rotation) !== values.rotation ||
    before.feed_path !== values.feedPath ||
    Number(before.min_page_height_mm) !== values.minPageHeightMm;

  await query(
    `UPDATE printer_profiles
        SET name=$1, model=$2, min_page_width_mm=$3, min_page_height_mm=$4,
            feed_path=$5, offset_x_mm=$6, offset_y_mm=$7, rotation=$8,
            qz_printer_name=$9, notes=$10, workstation=$15, updated_at=now(),
            calibrated_by = CASE WHEN $12 THEN $13 ELSE calibrated_by END,
            calibrated_at = CASE WHEN $12 THEN now() ELSE calibrated_at END,
            calibrated_on_printer = CASE WHEN $12 THEN $14 ELSE calibrated_on_printer END
      WHERE id=$11`,
    [
      values.name, values.model, values.minPageWidthMm, values.minPageHeightMm,
      values.feedPath, values.offsetXMm, values.offsetYMm, values.rotation,
      values.qzPrinterName, values.notes, id,
      recalibrated, req.user.id,
      // The device the numbers actually came off, for the next person.
      String(req.body?.calibratedOnPrinter ?? req.user.qz_printer_name ?? '').trim() || null,
      values.workstation,
    ],
  );

  if (req.body?.isDefault) await ensureSingleDefault(id);

  await recordAudit(req, AUDIT_ACTIONS.TEMPLATE_UPDATED, { type: 'printer', id }, {
    name: values.name,
    offsets: { x: values.offsetXMm, y: values.offsetYMm },
  });

  const { rows } = await query('SELECT * FROM printer_profiles WHERE id = $1', [id]);
  return res.json({ printer: toApi(rows[0]) });
});

router.post('/:id/default', async (req, res) => {
  const id = Number(req.params.id);
  const { rowCount } = await query('SELECT 1 FROM printer_profiles WHERE id = $1', [id]);
  if (!rowCount) return res.status(404).json({ error: 'Printer not found' });

  await ensureSingleDefault(id);
  const { rows } = await query('SELECT * FROM printer_profiles WHERE id = $1', [id]);
  return res.json({ printer: toApi(rows[0]) });
});

/**
 * Alignment sheet rendered THROUGH this profile, against a chosen template,
 * without attaching the two. The wizard's calibration loop needs to print
 * repeatedly while nudging; doing that by writing to the template would edit a
 * live bank layout to run a test.
 *
 * Offsets can be supplied as query params so a nudge prints immediately,
 * before the operator commits to it.
 */
router.get('/:id/alignment-sheet.pdf', async (req, res) => {
  const { rows } = await query('SELECT * FROM printer_profiles WHERE id = $1', [
    Number(req.params.id),
  ]);
  if (!rows.length) return res.status(404).json({ error: 'Printer not found' });
  const profile = rows[0];

  const { rows: templates } = req.query.templateId
    ? await query('SELECT * FROM check_templates WHERE id = $1', [Number(req.query.templateId)])
    : await query(
        `SELECT * FROM check_templates WHERE is_active = TRUE
          ORDER BY is_default DESC, id LIMIT 1`,
      );
  if (!templates.length) {
    return res.status(400).json({ error: 'No cheque template to calibrate against' });
  }
  const template = templates[0];

  // Live overrides, so a nudge can be printed before it is saved.
  const overrideX = req.query.offsetXMm === undefined ? null : Number(req.query.offsetXMm);
  const overrideY = req.query.offsetYMm === undefined ? null : Number(req.query.offsetYMm);
  const feedPath = FEED_PATHS.includes(req.query.feedPath)
    ? req.query.feedPath
    : profile.feed_path;

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="printer-alignment.pdf"');

  return renderAlignmentSheet({
    check_width_mm: Number(template.check_width_mm),
    check_height_mm: Number(template.check_height_mm),
    orientation: template.orientation,
    paper_mode: template.paper_mode,
    paper_size: template.paper_size,
    feed_offset_x_mm: 0,
    feed_offset_y_mm: 0,
    fields: sanitizeFields(template.fields, {
      width: Number(template.check_width_mm),
      height: Number(template.check_height_mm),
    }),
    printer: {
      name: profile.name,
      min_page_width_mm: Number(profile.min_page_width_mm),
      min_page_height_mm: Number(profile.min_page_height_mm),
      feed_path: feedPath,
      offset_x_mm: Number.isFinite(overrideX) ? overrideX : Number(profile.offset_x_mm),
      offset_y_mm: Number.isFinite(overrideY) ? overrideY : Number(profile.offset_y_mm),
      rotation: ROTATIONS.includes(Number(req.query.rotation))
        ? Number(req.query.rotation)
        : Number(profile.rotation) || 0,
    },
  }).pipe(res);
});

/** Attach this profile to a set of templates in one step. */
router.post('/:id/apply', async (req, res) => {
  const id = Number(req.params.id);
  const ids = Array.isArray(req.body?.templateIds)
    ? req.body.templateIds.map(Number).filter(Boolean)
    : [];

  const { rowCount } = await query('SELECT 1 FROM printer_profiles WHERE id = $1', [id]);
  if (!rowCount) return res.status(404).json({ error: 'Printer not found' });

  const { rows } = await query(
    `UPDATE check_templates SET printer_profile_id = $1, updated_at = now()
      WHERE id = ANY($2::int[]) RETURNING id, name`,
    [id, ids],
  );

  await recordAudit(req, AUDIT_ACTIONS.TEMPLATE_UPDATED, { type: 'printer', id }, {
    appliedToTemplates: rows.map((r) => r.name),
  });

  return res.json({ applied: rows.map((r) => ({ id: r.id, name: r.name })) });
});

router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  // Templates fall back to their own paper settings (ON DELETE SET NULL).
  const { rows } = await query(
    'DELETE FROM printer_profiles WHERE id = $1 RETURNING name',
    [id],
  );
  if (!rows.length) return res.status(404).json({ error: 'Printer not found' });

  const { rows: remaining } = await query(
    'SELECT id FROM printer_profiles WHERE is_default = TRUE LIMIT 1',
  );
  if (!remaining.length) {
    const { rows: first } = await query(
      'SELECT id FROM printer_profiles ORDER BY id LIMIT 1',
    );
    if (first.length) await ensureSingleDefault(first[0].id);
  }

  await recordAudit(req, AUDIT_ACTIONS.TEMPLATE_DELETED, { type: 'printer', id }, {
    name: rows[0].name,
  });
  return res.json({ deleted: true });
});

export default router;
