/**
 * Draws a cheque as a PDF at exact physical coordinates.
 *
 * The reference image a user traced the layout over is NEVER drawn — it exists
 * only in the editor. What lands on the paper is text (and optionally a
 * signature image) positioned in millimetres on blank pre-printed stock.
 */

import fs from 'node:fs';
import PDFDocument from 'pdfkit';
import { mmToPt, PAPER_SIZES, DEFAULT_CHECK_SIZE_MM } from './units.js';
import { dateDigits } from './dateFormats.js';
import { checkSegmentBoxes } from './checkLayout.js';

/**
 * Tell conforming viewers to print at ACTUAL SIZE.
 *
 * Every coordinate in this file is a physical millimetre measured against real
 * cheque stock. A viewer that defaults its print dialog to "Fit to printable
 * area" silently scales the page down by a few percent to clear the printer's
 * unprintable margin — which is enough to walk every field off its pre-printed
 * box. /PrintScaling /None (PDF 1.6, ISO 32000-1 table 150) makes "Actual
 * size" the default instead.
 *
 * pdfkit has no named API for this, but it does look for
 * `_root.data.ViewerPreferences` when finalising and calls `.end()` on it — so
 * the value must be an indirect reference from `doc.ref()`, not a plain object.
 * (A plain object throws "ViewerPreferences.end is not a function" at
 * `doc.end()`, well after this function has returned.)
 *
 * Inside the ref, a plain JS string becomes a PDF *name* in pdfkit's
 * serialiser, so 'None' emits /None rather than the string (None).
 *
 * Wrapped defensively, and the result is sanity-checked here rather than
 * trusted: a viewer preference is a convenience, and failing to set one must
 * never take down a print run.
 */
/**
 * Print direction, as the PDF page /Rotate attribute (0/90/180/270).
 *
 * Deliberately the page attribute rather than a content transform. /Rotate is
 * the standard mechanism every viewer and print driver already honours, and it
 * leaves the drawing coordinates completely untouched — so a field positioned
 * at 22mm is still verifiably at 22mm in the content stream, rotated or not.
 * Transforming the content instead would entangle rotation with every
 * coordinate and make a misprint much harder to diagnose.
 *
 * At 90 or 270 the printed sheet comes out with its long edge the other way, so
 * the driver's custom paper size has to match. The UI says so.
 */
function applyPageRotation(doc, rotation) {
  const angle = Number(rotation) || 0;
  if (![90, 180, 270].includes(angle)) return;
  try {
    if (doc?.page?.dictionary?.data) doc.page.dictionary.data.Rotate = angle;
  } catch (err) {
    console.warn('Could not set page rotation:', err.message);
  }
}

function applyPrintPreferences(doc) {
  try {
    const prefs = doc.ref({ PrintScaling: 'None' });
    if (typeof prefs?.end !== 'function') {
      throw new Error('doc.ref() did not return a reference');
    }
    doc._root.data.ViewerPreferences = prefs;
  } catch (err) {
    console.warn('Could not set PrintScaling viewer preference:', err.message);
  }
  return doc;
}

/** pdfkit's base-14 fonts — no font files to ship. */
function pdfFont(family, bold) {
  if (family === 'Times-Roman') return bold ? 'Times-Bold' : 'Times-Roman';
  if (family === 'Courier') return bold ? 'Courier-Bold' : 'Courier';
  return bold ? 'Helvetica-Bold' : 'Helvetica';
}

/**
 * Where the cheque's top-left corner sits on the page, in points.
 *
 *  - paperMode 'exact': the page IS the cheque. Nothing to offset. Use this
 *    when the printer is fed single cheques and you want zero ambiguity.
 *  - paperMode 'feed': the page is a full sheet and the printer's own feed
 *    handles alignment; the cheque is placed at the configured offset from the
 *    sheet's leading corner.
 */
function pageGeometry(template) {
  const checkW = mmToPt(template.check_width_mm);
  const checkH = mmToPt(template.check_height_mm);
  const printer = template.printer;

  // ── Printer profile: the page grows to the printer's minimum ─────────────
  //
  // Most consumer inkjets refuse a custom page shorter than about 127mm, so a
  // 76mm cheque page silently fails to print. The fix is to send a page padded
  // up to that minimum with the cheque positioned inside it — NOT to inflate
  // the template's cheque height, which would move every field coordinate.
  if (printer) {
    const pageW = Math.max(checkW, mmToPt(printer.min_page_width_mm || 0));
    const pageH = Math.max(checkH, mmToPt(printer.min_page_height_mm || 0));

    // Where the cheque sits across the page, per the feed guide it was loaded
    // against, plus any calibration nudge.
    const spare = Math.max(0, pageW - checkW);
    const path = printer.feed_path || 'center';
    const baseX = path === 'left' ? 0 : path === 'right' ? spare : spare / 2;

    return {
      size: [pageW, pageH],
      originX: baseX + mmToPt(printer.offset_x_mm || 0),
      originY: mmToPt(printer.offset_y_mm || 0),
    };
  }

  // ── No profile: the original per-template behaviour ──────────────────────
  if (template.paper_mode !== 'feed') {
    return { size: [checkW, checkH], originX: 0, originY: 0 };
  }

  const sheet = PAPER_SIZES[template.paper_size] || PAPER_SIZES.A4;
  const size =
    template.orientation === 'landscape' ? [sheet[1], sheet[0]] : [sheet[0], sheet[1]];

  return {
    size,
    originX: mmToPt(template.feed_offset_x_mm || 0),
    originY: mmToPt(template.feed_offset_y_mm || 0),
  };
}

/** Vertically centre a run of text inside its box, the way the editor shows it. */
function verticalOffset(doc, field, lineCount) {
  const lineHeight = doc.currentLineHeight(true);
  const blockHeight = lineHeight * lineCount + field.lineGap * (lineCount - 1);
  return Math.max(0, (mmToPt(field.height) - blockHeight) / 2);
}

function drawText(doc, field, value, originX, originY) {
  if (value === null || value === undefined || value === '') return;

  const text = field.uppercase ? String(value).toUpperCase() : String(value);

  doc
    .font(pdfFont(field.fontFamily, field.bold))
    .fontSize(field.fontSize)
    .fillColor('#000000');

  const boxWidth = mmToPt(field.width);
  const lineCount = Math.min(
    field.maxLines,
    Math.max(1, Math.ceil(doc.widthOfString(text) / boxWidth)),
  );

  doc.text(text, originX + mmToPt(field.x), originY + mmToPt(field.y) + verticalOffset(doc, field, lineCount), {
    width: boxWidth,
    height: mmToPt(field.height),
    align: field.align,
    lineGap: field.lineGap,
    ellipsis: false,
    lineBreak: field.maxLines > 1,
  });
}

/** Two parallel diagonals in the corner — the "crossed cheque" marking. */
function drawCrossing(doc, field, originX, originY) {
  const x = originX + mmToPt(field.x);
  const y = originY + mmToPt(field.y);
  const w = mmToPt(field.width);
  const h = mmToPt(field.height);
  const gap = w / 3;

  doc.save().lineWidth(mmToPt(field.crossingLineWidth)).strokeColor('#000000');
  doc.moveTo(x, y + h).lineTo(x + w - gap, y).stroke();
  doc.moveTo(x + gap, y + h).lineTo(x + w, y).stroke();
  doc.restore();

  if (field.crossingText) {
    doc
      .save()
      .font(pdfFont(field.fontFamily, field.bold))
      .fontSize(Math.min(field.fontSize, 7))
      .fillColor('#000000');
    // Rotate the caption to sit along the diagonals.
    doc.rotate(-45, { origin: [x + w / 2, y + h / 2] });
    doc.text(field.crossingText, x - w / 2, y + h / 2 - 4, {
      width: w * 2,
      align: 'center',
      lineBreak: false,
    });
    doc.restore();
  }
}

/**
 * Digit boxes (Sterling-style stock): M M - D D - Y Y Y Y with the dashes
 * already on the paper. One digit per box, separators never drawn.
 *
 * If the box count does not match the digit count the field is SKIPPED
 * entirely. Printing 6 of 8 digits would leave a plausible-looking but wrong
 * date on a financial instrument; a blank date row is obvious and safe. Saving
 * such a layout is refused up front, so this is a guard against hand-edited
 * data rather than something a user can reach.
 */
function drawSegmentedDate(doc, field, isoDate, originX, originY) {
  const { ok } = checkSegmentBoxes(field);
  if (!ok || !isoDate) return;

  const digits = dateDigits(isoDate, field.datePattern);
  if (digits.length !== field.boxes.length) return;

  doc
    .font(pdfFont(field.fontFamily, field.bold))
    .fontSize(field.fontSize)
    .fillColor('#000000');

  const lineHeight = doc.currentLineHeight(true);

  field.boxes.forEach((box, i) => {
    const centred = Math.max(0, (mmToPt(box.height) - lineHeight) / 2);
    doc.text(
      digits[i],
      originX + mmToPt(box.x),
      originY + mmToPt(box.y) + centred,
      { width: mmToPt(box.width), align: 'center', lineBreak: false },
    );
  });
}

function drawImage(doc, field, imagePath, originX, originY) {
  if (!imagePath || !fs.existsSync(imagePath)) return;
  try {
    doc.image(imagePath, originX + mmToPt(field.x), originY + mmToPt(field.y), {
      fit: [mmToPt(field.width), mmToPt(field.height)],
      align: 'center',
      valign: 'center',
    });
  } catch {
    // A corrupt or unsupported signature file must never block a print run.
  }
}

/**
 * Render one or more cheques into a single PDF (one page each).
 *
 * @param {object[]} cheques  `{ template, values, signaturePath }`
 *        template     — row from check_templates (fields already parsed)
 *        values       — `{ date, payee, amount_numeric, amount_words, memo, ... }`
 *        signaturePath— absolute path to the signature image, or null
 * @param {object} [opts]
 * @param {boolean} [opts.draft]  stamp a DRAFT watermark (preview only)
 * @returns {import('stream').Readable} the PDF stream
 */
export function renderChecks(cheques, opts = {}) {
  if (!cheques.length) throw new Error('renderChecks: nothing to render');

  const first = pageGeometry(cheques[0].template);
  const doc = new PDFDocument({
    size: first.size,
    margin: 0,
    autoFirstPage: false,
    // PrintScaling is a PDF 1.6 feature; declaring 1.3 would put it in a
    // document whose own header says the key cannot exist.
    pdfVersion: '1.7',
    info: {
      Title: 'Cheque',
      Producer: 'Cheque Writer',
      CreationDate: new Date(),
    },
  });

  applyPrintPreferences(doc);

  for (const { template, values, signaturePath } of cheques) {
    const geometry = pageGeometry(template);
    doc.addPage({ size: geometry.size, margin: 0 });
    applyPageRotation(doc, template.printer?.rotation);

    const fields = Array.isArray(template.fields) ? template.fields : [];

    for (const field of fields) {
      if (!field.enabled) continue;

      if (field.type === 'crossing') {
        drawCrossing(doc, field, geometry.originX, geometry.originY);
      } else if (field.type === 'segmented_date') {
        drawSegmentedDate(doc, field, values.date_iso, geometry.originX, geometry.originY);
      } else if (field.type === 'image') {
        drawImage(doc, field, signaturePath, geometry.originX, geometry.originY);
      } else {
        drawText(doc, field, values[field.key], geometry.originX, geometry.originY);
      }
    }

    if (opts.draft) {
      doc
        .save()
        .fillColor('#d92d20')
        .opacity(0.18)
        .font('Helvetica-Bold')
        .fontSize(Math.min(mmToPt(template.check_width_mm) / 5, 90))
        .rotate(-20, { origin: [geometry.size[0] / 2, geometry.size[1] / 2] })
        .text('PREVIEW', 0, geometry.size[1] / 2 - 20, {
          width: geometry.size[0],
          align: 'center',
          lineBreak: false,
        })
        .restore();
    }
  }

  doc.end();
  return doc;
}

/**
 * A one-page PDF of a cheque with the field boxes outlined and labelled — the
 * alignment sheet you print on plain paper and hold against real stock before
 * committing a template.
 */
export function renderAlignmentSheet(template) {
  const geometry = pageGeometry(template);
  const doc = new PDFDocument({
    size: geometry.size,
    margin: 0,
    autoFirstPage: true,
    pdfVersion: '1.7',
  });

  // An alignment sheet printed "to fit" is worse than useless — it would send
  // the user chasing offsets that were never wrong.
  applyPrintPreferences(doc);
  applyPageRotation(doc, template.printer?.rotation);

  // Cheque outline.
  doc
    .save()
    .lineWidth(0.5)
    .dash(3, { space: 3 })
    .strokeColor('#999999')
    .rect(
      geometry.originX,
      geometry.originY,
      mmToPt(template.check_width_mm),
      mmToPt(template.check_height_mm),
    )
    .stroke()
    .restore();

  // Caption the sheet with the settings that produced it. Without this a
  // calibration print is unfalsifiable — you cannot tell whether the offsets
  // are wrong or you are holding a sheet from a different feed path.
  const feedLine = template.printer
    ? `Printer: ${template.printer.name} · page ` +
      `${Math.max(Number(template.check_width_mm), Number(template.printer.min_page_width_mm || 0))}` +
      ` x ${Math.max(Number(template.check_height_mm), Number(template.printer.min_page_height_mm || 0))} mm` +
      ` · path ${template.printer.feed_path} · rotation ${template.printer.rotation || 0}°` +
      ` · nudge ` +
      `${Number(template.printer.offset_x_mm).toFixed(1)}, ${Number(template.printer.offset_y_mm).toFixed(1)} mm`
    : template.paper_mode === 'feed'
      ? `Follow paper feed · ${template.paper_size} ${template.orientation} · ` +
        `path ${template.feed_path || 'center'} · ` +
        `offset ${Number(template.feed_offset_x_mm).toFixed(1)}, ` +
        `${Number(template.feed_offset_y_mm).toFixed(1)} mm`
      : 'Cheque feed: Default (page is exactly the cheque)';

  doc
    .save()
    .fillColor('#667085')
    .font('Helvetica')
    .fontSize(6)
    .text(
      `${template.check_width_mm} x ${template.check_height_mm} mm  |  ${feedLine}` +
        '  |  print at ACTUAL SIZE (100%)',
      geometry.originX + 4,
      Math.max(2, geometry.originY - 9),
      { width: mmToPt(template.check_width_mm), lineBreak: false },
    )
    .restore();

  const sample = {
    date: '09/05/2025',
    payee: 'SAMPLE PAYEE NAME',
    amount_numeric: '1,500.00',
    amount_words: 'One Thousand Five Hundred Pesos Only',
    memo: 'Sample memo',
    account_payee: 'ACCOUNT PAYEE ONLY',
  };

  for (const field of template.fields || []) {
    if (!field.enabled) continue;

    doc
      .save()
      .lineWidth(0.4)
      .strokeColor('#2f6feb')
      .rect(
        geometry.originX + mmToPt(field.x),
        geometry.originY + mmToPt(field.y),
        mmToPt(field.width),
        mmToPt(field.height),
      )
      .stroke()
      .restore();

    doc
      .save()
      .fillColor('#2f6feb')
      .font('Helvetica')
      .fontSize(5)
      .text(
        `${field.label}  (${field.x.toFixed(1)}, ${field.y.toFixed(1)} mm)`,
        geometry.originX + mmToPt(field.x),
        geometry.originY + mmToPt(field.y) - 6,
        { width: mmToPt(field.width) * 2, lineBreak: false },
      )
      .restore();

    if (field.type === 'segmented_date') {
      for (const box of field.boxes || []) {
        doc
          .save()
          .lineWidth(0.4)
          .strokeColor('#2f6feb')
          .rect(
            geometry.originX + mmToPt(box.x),
            geometry.originY + mmToPt(box.y),
            mmToPt(box.width),
            mmToPt(box.height),
          )
          .stroke()
          .restore();
      }
      drawSegmentedDate(doc, field, '2025-09-05', geometry.originX, geometry.originY);
    } else if (field.type === 'crossing') {
      drawCrossing(doc, field, geometry.originX, geometry.originY);
    } else if (field.type !== 'image') {
      drawText(doc, field, sample[field.key] ?? field.label, geometry.originX, geometry.originY);
    }
  }

  doc.end();
  return doc;
}

export { DEFAULT_CHECK_SIZE_MM };
