/**
 * Bank layout templates (Section 2).
 *
 * A template holds the physical size of the cheque, the print behaviour, and
 * the field coordinates produced by the visual editor. The reference image is
 * stored so the editor can show it again later — it is never printed.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import multer from 'multer';
import { query } from '../db/index.js';
import { requireRole } from '../middleware/auth.js';
import { recordAudit, AUDIT_ACTIONS } from '../lib/audit.js';
import {
  sanitizeFields,
  defaultFields,
  checkSegmentBoxes,
  FIELD_DEFINITIONS,
  FONT_FAMILIES,
} from '../lib/checkLayout.js';
import { segmentedFormatOptions, SEGMENTED_DATE_FORMATS } from '../lib/dateFormats.js';
import { renderAlignmentSheet } from '../lib/checkPdf.js';
import { imageSize } from '../lib/imageSize.js';
import { imageDpi, feedPathOffsets, FEED_PATHS, PAPER_SIZES_MM } from '../lib/units.js';
import { toRenderPrinter } from './printers.js';

// requireAuth + requirePasswordChanged are applied in index.js.
const router = express.Router();

export const UPLOAD_DIR = process.env.UPLOAD_DIR || path.resolve('uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Below this the scan is too coarse to position against; between here and 300
// we accept but tell the user (see `dpiWarning`).
const MIN_USABLE_DPI = 200;
const RECOMMENDED_DPI = 300;

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() === '.png' ? '.png' : '.jpg';
      cb(null, `${crypto.randomBytes(16).toString('hex')}${ext}`);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ['image/png', 'image/jpeg'].includes(file.mimetype);
    cb(ok ? null : new Error('Reference image must be a PNG or JPEG'), ok);
  },
});

/**
 * multer signals a rejected file by throwing, which would otherwise surface as
 * a generic 500. Translate it into the 400 it actually is, with the reason.
 */
const uploadImage = (req, res, next) =>
  upload.single('image')(req, res, (err) => {
    if (!err) return next();
    return res.status(400).json({
      error:
        err.code === 'LIMIT_FILE_SIZE'
          ? 'That image is larger than the 25 MB limit'
          : err.message || 'That file could not be read as an image',
    });
  });

/**
 * Bring a stored field list up to the current FIELD_DEFINITIONS.
 *
 * Rows written before a field type existed simply do not contain it, and the
 * editor can only show what it is given — so template #5 (created before
 * `date_segments` was added) had no digit-box field and no way to grow one.
 * Backfilling only on write was the bug: a template nobody re-saved stayed
 * stale forever, and every future field type would have repeated it.
 *
 * Normalising on READ makes the API always present the complete list, with
 * anything new defaulted and switched off. `sanitizeFields` is idempotent for
 * values that were already saved through the app, so this changes nothing for
 * an up-to-date row.
 */
const normaliseFields = (row) =>
  sanitizeFields(row.fields, {
    width: Number(row.check_width_mm),
    height: Number(row.check_height_mm),
  });

/**
 * The page the printer actually receives: the cheque, grown to the printer's
 * minimum. Computed here so the QZ Tray client does not re-derive it — a second
 * copy of this max() would eventually disagree with pageGeometry.
 */
function pageSizeMm(row) {
  const w = Number(row.check_width_mm);
  const h = Number(row.check_height_mm);
  if (!row.printer_id) return { width: w, height: h };
  return {
    width: Math.max(w, Number(row.printer_min_w) || 0),
    height: Math.max(h, Number(row.printer_min_h) || 0),
  };
}

/**
 * What the reference scan implies about the cheque, given its pixel size and
 * the declared width. If this disagrees with the declared height, the scan does
 * not depict the whole cheque (or the declared size is wrong) and anything
 * traced over it is skewed.
 */
function referenceGeometry(row) {
  const pxW = Number(row.reference_image_px_w) || 0;
  const pxH = Number(row.reference_image_px_h) || 0;
  const declaredW = Number(row.check_width_mm);
  const declaredH = Number(row.check_height_mm);
  if (!pxW || !pxH || !declaredW) return null;

  const impliedHeightMm = pxH * (declaredW / pxW);
  const differenceMm = declaredH - impliedHeightMm;

  return {
    pixelWidth: pxW,
    pixelHeight: pxH,
    impliedHeightMm: Math.round(impliedHeightMm * 100) / 100,
    differenceMm: Math.round(differenceMm * 100) / 100,
    // 1mm of slack for rounding and a slightly generous crop.
    mismatched: Math.abs(differenceMm) > 1,
  };
}

const toApi = (row) => ({
  id: row.id,
  name: row.name,
  bankName: row.bank_name,
  checkWidthMm: Number(row.check_width_mm),
  checkHeightMm: Number(row.check_height_mm),
  orientation: row.orientation,
  paperMode: row.paper_mode,
  paperSize: row.paper_size,
  feedOffsetXMm: Number(row.feed_offset_x_mm),
  feedOffsetYMm: Number(row.feed_offset_y_mm),
  feedPath: row.feed_path || 'center',
  printerProfileId: row.printer_profile_id,
  printerName: row.printer_name ?? undefined,
  printerRotation: Number(row.printer_rotation) || 0,
  // NOTE: the printer profile no longer decides WHERE a job goes — that is the
  // signed-in user's personal setting. This is kept only so the Printers screen
  // can show what the old shared value was.
  legacyProfilePrinter: row.printer_qz_name ?? '',
  // What QZ Tray is told the paper is.
  pageWidthMm: pageSizeMm(row).width,
  pageHeightMm: pageSizeMm(row).height,
  hasReferenceImage: Boolean(row.reference_image),
  referenceImageDpi: row.reference_image_dpi ? Number(row.reference_image_dpi) : null,
  referenceGeometry: referenceGeometry(row),
  hasSignatureImage: Boolean(row.signature_image),
  fields: normaliseFields(row),
  isActive: row.is_active,
  isDefault: row.is_default,
  updatedAt: row.updated_at,
});

/** Shape a template row the way checkPdf.js expects it. */
export function toRenderTemplate(row) {
  return {
    check_width_mm: Number(row.check_width_mm),
    check_height_mm: Number(row.check_height_mm),
    orientation: row.orientation,
    paper_mode: row.paper_mode,
    paper_size: row.paper_size,
    feed_offset_x_mm: Number(row.feed_offset_x_mm),
    feed_offset_y_mm: Number(row.feed_offset_y_mm),
    feed_path: row.feed_path || 'center',
    // When a printer profile is attached it overrides the per-template paper
    // settings entirely — see pageGeometry in lib/checkPdf.js.
    printer: row.printer_id ? toRenderPrinter({
      name: row.printer_name,
      min_page_width_mm: row.printer_min_w,
      min_page_height_mm: row.printer_min_h,
      feed_path: row.printer_feed_path,
      offset_x_mm: row.printer_offset_x,
      offset_y_mm: row.printer_offset_y,
      rotation: row.printer_rotation,
    }) : null,
    fields: normaliseFields(row),
  };
}

/** Template row joined to its printer profile, for rendering. */
export const SELECT_TEMPLATE_WITH_PRINTER = `
  SELECT t.*,
         p.id   AS printer_id,   p.name AS printer_name,
         p.min_page_width_mm  AS printer_min_w,
         p.min_page_height_mm AS printer_min_h,
         p.feed_path          AS printer_feed_path,
         p.offset_x_mm        AS printer_offset_x,
         p.offset_y_mm        AS printer_offset_y,
         p.rotation           AS printer_rotation,
         p.qz_printer_name    AS printer_qz_name
    FROM check_templates t
    LEFT JOIN printer_profiles p ON p.id = t.printer_profile_id`;

/** The vocabulary the Print Options panel needs. */
export const PRINT_OPTION_META = {
  orientations: ['landscape', 'portrait'],
  paperModes: ['exact', 'feed'],
  paperSizes: Object.keys(PAPER_SIZES_MM),
  feedPaths: FEED_PATHS,
  paperSizesMm: PAPER_SIZES_MM,
};

/** The vocabulary the editor builds its palette from. */
router.get('/meta', (_req, res) => {
  res.json({
    fieldDefinitions: FIELD_DEFINITIONS,
    fontFamilies: FONT_FAMILIES,
    recommendedDpi: RECOMMENDED_DPI,
    minimumDpi: MIN_USABLE_DPI,
    // Only zero-padded numeric patterns can drive a fixed row of digit boxes.
    segmentedDateFormats: segmentedFormatOptions(),
    segmentedDatePatterns: SEGMENTED_DATE_FORMATS,
    printOptions: PRINT_OPTION_META,
  });
});

router.get('/', async (req, res) => {
  const { rows } = await query(
    `${SELECT_TEMPLATE_WITH_PRINTER}
      ${req.query.includeInactive === 'true' ? '' : 'WHERE t.is_active = TRUE'}
      ORDER BY t.is_default DESC, lower(t.name)`,
  );
  res.json({ templates: rows.map(toApi) });
});

router.get('/:id', async (req, res) => {
  const { rows } = await query(`${SELECT_TEMPLATE_WITH_PRINTER} WHERE t.id = $1`, [
    Number(req.params.id),
  ]);
  if (!rows.length) return res.status(404).json({ error: 'Template not found' });
  return res.json({ template: toApi(rows[0]) });
});

/** The traced reference photo, for the editor canvas only. */
router.get('/:id/reference-image', async (req, res) => {
  const { rows } = await query(
    'SELECT reference_image FROM check_templates WHERE id = $1',
    [Number(req.params.id)],
  );
  const file = rows[0]?.reference_image;
  if (!file) return res.status(404).json({ error: 'No reference image' });

  const abs = path.join(UPLOAD_DIR, path.basename(file));
  if (!fs.existsSync(abs)) return res.status(404).json({ error: 'Image file is missing' });

  res.setHeader('Cache-Control', 'private, max-age=86400');
  return res.sendFile(abs);
});

router.get('/:id/signature-image', async (req, res) => {
  const { rows } = await query(
    'SELECT signature_image FROM check_templates WHERE id = $1',
    [Number(req.params.id)],
  );
  const file = rows[0]?.signature_image;
  if (!file) return res.status(404).json({ error: 'No signature image' });

  const abs = path.join(UPLOAD_DIR, path.basename(file));
  if (!fs.existsSync(abs)) return res.status(404).json({ error: 'Image file is missing' });

  res.setHeader('Cache-Control', 'private, max-age=86400');
  return res.sendFile(abs);
});

router.post('/', requireRole('admin'), async (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Template name is required' });

  const size = {
    width: Number(req.body?.checkWidthMm) || 178,
    height: Number(req.body?.checkHeightMm) || 76,
  };

  const { rows } = await query(
    `INSERT INTO check_templates (name, bank_name, check_width_mm, check_height_mm, fields)
     VALUES ($1, $2, $3, $4, $5::jsonb) RETURNING *`,
    [
      name,
      String(req.body?.bankName || '').trim(),
      size.width,
      size.height,
      JSON.stringify(defaultFields(size)),
    ],
  );

  await recordAudit(req, AUDIT_ACTIONS.TEMPLATE_CREATED, { type: 'template', id: rows[0].id }, {
    name,
  });
  return res.status(201).json({ template: toApi(rows[0]) });
});

router.put('/:id', requireRole('admin'), async (req, res) => {
  const id = Number(req.params.id);
  const { rows: existing } = await query('SELECT * FROM check_templates WHERE id = $1', [id]);
  if (!existing.length) return res.status(404).json({ error: 'Template not found' });

  const current = existing[0];
  const name = String(req.body?.name ?? current.name).trim();
  if (!name) return res.status(400).json({ error: 'Template name is required' });

  const size = {
    width: Number(req.body?.checkWidthMm ?? current.check_width_mm),
    height: Number(req.body?.checkHeightMm ?? current.check_height_mm),
  };
  if (!(size.width > 20 && size.height > 20)) {
    return res.status(400).json({ error: 'Cheque dimensions look wrong — check the mm values' });
  }

  const orientation = ['landscape', 'portrait'].includes(req.body?.orientation)
    ? req.body.orientation
    : current.orientation;
  const paperMode = ['exact', 'feed'].includes(req.body?.paperMode)
    ? req.body.paperMode
    : current.paper_mode;
  const paperSize = ['A4', 'LETTER', 'LEGAL'].includes(req.body?.paperSize)
    ? req.body.paperSize
    : current.paper_size;
  const feedPath = FEED_PATHS.includes(req.body?.feedPath)
    ? req.body.feedPath
    : current.feed_path || 'center';

  // Assignable from the template side too, so a new bank template can be
  // pointed at a printer without a detour through the Printers page.
  const printerProfileId =
    req.body?.printerProfileId === undefined
      ? current.printer_profile_id
      : req.body.printerProfileId === null || req.body.printerProfileId === ''
        ? null
        : Number(req.body.printerProfileId);

  const fields =
    req.body?.fields === undefined
      ? current.fields
      : sanitizeFields(req.body.fields, size);

  // A segmented date with the wrong number of boxes would print a wrong date.
  // Refuse the save rather than let it reach the printer.
  const segmented = fields.find((f) => f.type === 'segmented_date' && f.enabled);
  if (segmented) {
    const { ok, expected, actual } = checkSegmentBoxes(segmented);
    if (!ok) {
      return res.status(400).json({
        error:
          `The date digit boxes do not match the chosen format. ` +
          `${segmented.datePattern} needs ${expected} boxes but ${actual} ` +
          `${actual === 1 ? 'is' : 'are'} positioned.`,
        field: 'date_segments',
        expected,
        actual,
      });
    }
  }

  const { rows } = await query(
    `UPDATE check_templates
        SET name = $1, bank_name = $2, check_width_mm = $3, check_height_mm = $4,
            orientation = $5, paper_mode = $6, paper_size = $7,
            feed_offset_x_mm = $8, feed_offset_y_mm = $9,
            fields = $10::jsonb, is_active = $11, feed_path = $12,
            printer_profile_id = $13, updated_at = now()
      WHERE id = $14
      RETURNING *`,
    [
      name,
      String(req.body?.bankName ?? current.bank_name).trim(),
      size.width,
      size.height,
      orientation,
      paperMode,
      paperSize,
      Number(req.body?.feedOffsetXMm ?? current.feed_offset_x_mm) || 0,
      Number(req.body?.feedOffsetYMm ?? current.feed_offset_y_mm) || 0,
      JSON.stringify(fields),
      req.body?.isActive === undefined ? current.is_active : Boolean(req.body.isActive),
      feedPath,
      printerProfileId,
      id,
    ],
  );

  // Recompute the stored DPI if the physical width changed under a fixed image.
  if (current.reference_image && size.width !== Number(current.check_width_mm)) {
    const dims = imageSize(path.join(UPLOAD_DIR, path.basename(current.reference_image)));
    if (dims) {
      await query('UPDATE check_templates SET reference_image_dpi = $1 WHERE id = $2', [
        imageDpi(dims.width, size.width).toFixed(1),
        id,
      ]);
    }
  }

  await ensureDefaultTemplate();

  await recordAudit(req, AUDIT_ACTIONS.TEMPLATE_UPDATED, { type: 'template', id }, {
    name,
    fieldsChanged: req.body?.fields !== undefined,
  });

  return res.json({ template: toApi(rows[0]) });
});

/**
 * Print Options: orientation, cheque feed, feed path and the fine-tune offsets.
 *
 * Deliberately NOT admin-only, unlike the rest of template editing. When
 * nothing lands on the cheque the fix is to change the feed and reprint, and
 * the person holding the paper is Accounting. Designing a layout stays an admin
 * job; aligning the printer is an operational one.
 *
 * Choosing a feed path recomputes the starting offset. Sending explicit offsets
 * overrides it, so fine-tuning after picking a preset survives.
 */
router.patch('/:id/print-options', async (req, res) => {
  const id = Number(req.params.id);
  const { rows: existing } = await query('SELECT * FROM check_templates WHERE id = $1', [id]);
  if (!existing.length) return res.status(404).json({ error: 'Template not found' });

  const current = existing[0];

  const orientation = ['landscape', 'portrait'].includes(req.body?.orientation)
    ? req.body.orientation
    : current.orientation;
  const paperMode = ['exact', 'feed'].includes(req.body?.paperMode)
    ? req.body.paperMode
    : current.paper_mode;
  const paperSize = Object.keys(PAPER_SIZES_MM).includes(req.body?.paperSize)
    ? req.body.paperSize
    : current.paper_size;
  const feedPath = FEED_PATHS.includes(req.body?.feedPath)
    ? req.body.feedPath
    : current.feed_path || 'center';

  // Assignable from the template side too, so a new bank template can be
  // pointed at a printer without a detour through the Printers page.
  const printerProfileId =
    req.body?.printerProfileId === undefined
      ? current.printer_profile_id
      : req.body.printerProfileId === null || req.body.printerProfileId === ''
        ? null
        : Number(req.body.printerProfileId);

  // Recompute from the preset unless the caller sent a hand-tuned value.
  const preset = feedPathOffsets({
    paperSize,
    orientation,
    checkWidthMm: Number(current.check_width_mm),
    feedPath,
  });

  const offsetX = req.body?.feedOffsetXMm === undefined
    ? preset.x
    : Number(req.body.feedOffsetXMm);
  const offsetY = req.body?.feedOffsetYMm === undefined
    ? Number(current.feed_offset_y_mm)
    : Number(req.body.feedOffsetYMm);

  if (!Number.isFinite(offsetX) || !Number.isFinite(offsetY)) {
    return res.status(400).json({ error: 'Offsets must be numbers' });
  }

  await query(
    `UPDATE check_templates
        SET orientation = $1, paper_mode = $2, paper_size = $3, feed_path = $4,
            feed_offset_x_mm = $5, feed_offset_y_mm = $6,
            printer_profile_id = $7, updated_at = now()
      WHERE id = $8`,
    [orientation, paperMode, paperSize, feedPath, offsetX, offsetY, printerProfileId, id],
  );

  const { rows } = await query(`${SELECT_TEMPLATE_WITH_PRINTER} WHERE t.id = $1`, [id]);

  await recordAudit(req, AUDIT_ACTIONS.TEMPLATE_UPDATED, { type: 'template', id }, {
    name: current.name,
    printOptions: { orientation, paperMode, paperSize, feedPath, offsetX, offsetY },
  });

  return res.json({ template: toApi(rows[0]), preset });
});

/** What a given feed path would produce, without saving anything. */
router.get('/:id/feed-preview', async (req, res) => {
  const { rows } = await query('SELECT * FROM check_templates WHERE id = $1', [
    Number(req.params.id),
  ]);
  if (!rows.length) return res.status(404).json({ error: 'Template not found' });

  const row = rows[0];
  const orientation = ['landscape', 'portrait'].includes(req.query.orientation)
    ? req.query.orientation
    : row.orientation;
  const paperSize = Object.keys(PAPER_SIZES_MM).includes(req.query.paperSize)
    ? req.query.paperSize
    : row.paper_size;

  res.json({
    presets: Object.fromEntries(
      FEED_PATHS.map((feedPath) => [
        feedPath,
        feedPathOffsets({
          paperSize,
          orientation,
          checkWidthMm: Number(row.check_width_mm),
          feedPath,
        }),
      ]),
    ),
    sheet: PAPER_SIZES_MM[paperSize],
    checkWidthMm: Number(row.check_width_mm),
  });
});

router.post('/:id/default', requireRole('admin'), async (req, res) => {
  const id = Number(req.params.id);
  await query('UPDATE check_templates SET is_default = (id = $1)', [id]);
  const { rows } = await query('SELECT * FROM check_templates WHERE id = $1', [id]);
  if (!rows.length) return res.status(404).json({ error: 'Template not found' });
  return res.json({ template: toApi(rows[0]) });
});

/** Upload the blank-cheque photo the fields are dragged over. */
router.post(
  '/:id/reference-image',
  requireRole('admin'),
  uploadImage,
  async (req, res) => {
    const id = Number(req.params.id);
    if (!req.file) return res.status(400).json({ error: 'No image was uploaded' });

    const { rows: existing } = await query(
      'SELECT reference_image, check_width_mm FROM check_templates WHERE id = $1',
      [id],
    );
    if (!existing.length) {
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: 'Template not found' });
    }

    const dims = imageSize(req.file.path);
    if (!dims) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Could not read that image — try a PNG or JPEG' });
    }

    const dpi = imageDpi(dims.width, Number(existing[0].check_width_mm));
    if (dpi < MIN_USABLE_DPI) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({
        error:
          `That scan works out to ${dpi.toFixed(0)} DPI across a ` +
          `${Number(existing[0].check_width_mm)}mm cheque, which is too coarse to ` +
          `position against. Rescan at ${RECOMMENDED_DPI} DPI or higher.`,
      });
    }

    // Replace, don't accumulate.
    if (existing[0].reference_image) {
      fs.rmSync(path.join(UPLOAD_DIR, path.basename(existing[0].reference_image)), {
        force: true,
      });
    }

    await query(
      `UPDATE check_templates
          SET reference_image = $1, reference_image_dpi = $2,
              reference_image_px_w = $3, reference_image_px_h = $4, updated_at = now()
        WHERE id = $5`,
      [req.file.filename, dpi.toFixed(1), dims.width, dims.height, id],
    );

    await recordAudit(req, AUDIT_ACTIONS.TEMPLATE_UPDATED, { type: 'template', id }, {
      referenceImageUploaded: true,
      dpi: Math.round(dpi),
    });

    // Does the scan actually depict the cheque it claims to?
    const { rows: updated } = await query(
      'SELECT * FROM check_templates WHERE id = $1',
      [id],
    );
    const geometry = referenceGeometry(updated[0]);

    const warnings = [];
    if (dpi < RECOMMENDED_DPI) {
      warnings.push(
        `This scan is ${dpi.toFixed(0)} DPI. It will work, but ${RECOMMENDED_DPI} DPI or more makes fine positioning easier.`,
      );
    }
    if (geometry?.mismatched) {
      warnings.push(
        `This scan is ${geometry.pixelWidth}x${geometry.pixelHeight} px. At ` +
          `${Number(updated[0].check_width_mm)}mm wide that covers only ` +
          `${geometry.impliedHeightMm}mm vertically, but the cheque is set to ` +
          `${Number(updated[0].check_height_mm)}mm — a difference of ` +
          `${Math.abs(geometry.differenceMm)}mm. The scan is stretched to fit, so ` +
          `anything positioned over it will be off by a growing amount down the ` +
          `page. Rescan including the full top and bottom edges, or correct the ` +
          `cheque height.`,
      );
    }

    return res.json({
      dpi: Number(dpi.toFixed(1)),
      pixelWidth: dims.width,
      pixelHeight: dims.height,
      geometry,
      warnings,
      // Kept for older callers.
      warning: warnings[0] || null,
    });
  },
);

/** Signature / watermark artwork drawn into the signature field (Section 10). */
router.post(
  '/:id/signature-image',
  requireRole('admin'),
  uploadImage,
  async (req, res) => {
    const id = Number(req.params.id);
    if (!req.file) return res.status(400).json({ error: 'No image was uploaded' });

    const { rows: existing } = await query(
      'SELECT signature_image FROM check_templates WHERE id = $1',
      [id],
    );
    if (!existing.length) {
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: 'Template not found' });
    }

    if (existing[0].signature_image) {
      fs.rmSync(path.join(UPLOAD_DIR, path.basename(existing[0].signature_image)), {
        force: true,
      });
    }

    await query(
      'UPDATE check_templates SET signature_image = $1, updated_at = now() WHERE id = $2',
      [req.file.filename, id],
    );
    return res.json({ ok: true });
  },
);

router.delete('/:id/signature-image', requireRole('admin'), async (req, res) => {
  const id = Number(req.params.id);
  const { rows } = await query(
    'SELECT signature_image FROM check_templates WHERE id = $1',
    [id],
  );
  if (rows[0]?.signature_image) {
    fs.rmSync(path.join(UPLOAD_DIR, path.basename(rows[0].signature_image)), { force: true });
  }
  await query('UPDATE check_templates SET signature_image = NULL WHERE id = $1', [id]);
  return res.json({ ok: true });
});

/** Print-on-plain-paper alignment sheet: boxes outlined, coordinates labelled. */
router.get('/:id/alignment-sheet.pdf', async (req, res) => {
  const { rows } = await query(`${SELECT_TEMPLATE_WITH_PRINTER} WHERE t.id = $1`, [
    Number(req.params.id),
  ]);
  if (!rows.length) return res.status(404).json({ error: 'Template not found' });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="alignment-sheet.pdf"');
  return renderAlignmentSheet(toRenderTemplate(rows[0])).pipe(res);
});

/**
 * Make sure exactly one active template is flagged default. Called after any
 * change that could have removed or retired the current one — otherwise the
 * fallback lookup has nothing to prefer.
 */
async function ensureDefaultTemplate() {
  // A retired template must not stay flagged as the default.
  await query(
    'UPDATE check_templates SET is_default = FALSE WHERE is_default = TRUE AND is_active = FALSE',
  );

  const { rows } = await query(
    'SELECT 1 FROM check_templates WHERE is_default = TRUE AND is_active = TRUE',
  );
  if (rows.length) return;

  await query(
    `UPDATE check_templates
        SET is_default = TRUE
      WHERE id = (SELECT id FROM check_templates WHERE is_active = TRUE ORDER BY id LIMIT 1)`,
  );
}

router.delete('/:id', requireRole('admin'), async (req, res) => {
  const id = Number(req.params.id);

  const { rows: used } = await query(
    'SELECT count(*)::int AS n FROM checks WHERE template_id = $1',
    [id],
  );

  // Templates referenced by printed cheques are retired, not removed, so old
  // records keep resolving to the layout they were printed with.
  if (used[0].n > 0) {
    const { rows } = await query(
      'UPDATE check_templates SET is_active = FALSE WHERE id = $1 RETURNING *',
      [id],
    );
    if (!rows.length) return res.status(404).json({ error: 'Template not found' });
    await ensureDefaultTemplate();
    return res.json({ deactivated: true, template: toApi(rows[0]) });
  }

  const { rows } = await query(
    'DELETE FROM check_templates WHERE id = $1 RETURNING name, reference_image, signature_image',
    [id],
  );
  if (!rows.length) return res.status(404).json({ error: 'Template not found' });

  for (const file of [rows[0].reference_image, rows[0].signature_image]) {
    if (file) fs.rmSync(path.join(UPLOAD_DIR, path.basename(file)), { force: true });
  }

  await ensureDefaultTemplate();

  await recordAudit(req, AUDIT_ACTIONS.TEMPLATE_DELETED, { type: 'template', id }, {
    name: rows[0].name,
  });
  return res.json({ deleted: true });
});

export default router;
