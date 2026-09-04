/**
 * The shape of a cheque template's field list, and the defaults a brand-new
 * template starts from. The visual editor drags these boxes around; the PDF
 * renderer draws them. Both sides agree on this file's vocabulary.
 *
 * Coordinates are millimetres from the top-left corner of the cheque.
 */

import { DEFAULT_CHECK_SIZE_MM } from './units.js';
import {
  digitGroups,
  digitCount,
  isSegmentable,
  DEFAULT_SEGMENTED_FORMAT,
} from './dateFormats.js';

/** Fields the app knows how to fill. `type` decides how it is drawn. */
export const FIELD_DEFINITIONS = [
  { key: 'date', label: 'Date', type: 'text' },
  { key: 'date_segments', label: 'Date (digit boxes)', type: 'segmented_date' },
  { key: 'payee', label: 'Payee', type: 'text' },
  { key: 'amount_words', label: 'Amount in Words', type: 'text' },
  { key: 'amount_numeric', label: 'Amount in Figures', type: 'text' },
  { key: 'memo', label: 'Memo / Purpose', type: 'text' },
  { key: 'crossing', label: 'Crossed Cheque marking', type: 'crossing' },
  { key: 'account_payee', label: '"Account Payee Only" text', type: 'text' },
  { key: 'signature', label: 'Signature image', type: 'image' },
];

export const FIELD_KEYS = FIELD_DEFINITIONS.map((f) => f.key);

export const FONT_FAMILIES = ['Helvetica', 'Times-Roman', 'Courier'];

export const ALIGNMENTS = ['left', 'center', 'right'];

/** Everything a field needs, so callers never have to null-check. */
export const FIELD_DEFAULTS = {
  enabled: true,
  x: 20,
  y: 20,
  width: 80,
  height: 8,
  fontFamily: 'Helvetica',
  fontSize: 11,
  bold: false,
  align: 'left',
  uppercase: false,
  lineGap: 1,
  maxLines: 1,
  // 'crossing' only:
  crossingText: 'A/C PAYEE ONLY',
  crossingLineWidth: 0.6,
  // 'segmented_date' only: which numeric pattern drives the boxes, and one
  // independently positioned box per digit.
  datePattern: DEFAULT_SEGMENTED_FORMAT,
  boxes: [],
};

/**
 * Lay out one box per digit in a straight row, with a wider gap between groups
 * so MM / DD / YYYY reads as three clusters. A starting point the user then
 * drags — each box is stored independently, so they need not stay in a line.
 */
export function buildSegmentBoxes(pattern, options = {}) {
  const groups = digitGroups(pattern);
  if (!groups) return [];

  const {
    x = 120,
    y = 10,
    boxWidth = 4.5,
    boxHeight = 6,
    gap = 0.8,      // between digits inside a group
    groupGap = 3.2, // between MM and DD, DD and YYYY
  } = options;

  const boxes = [];
  let cursor = x;

  groups.forEach((group, groupIndex) => {
    for (let i = 0; i < group.size; i += 1) {
      boxes.push({
        x: Math.round(cursor * 100) / 100,
        y,
        width: boxWidth,
        height: boxHeight,
      });
      cursor += boxWidth + (i === group.size - 1 ? 0 : gap);
    }
    if (groupIndex < groups.length - 1) cursor += groupGap;
  });

  return boxes;
}

/**
 * A sensible starting layout for a ~178x76mm cheque. The user is expected to
 * drag these onto their own scanned stock — this only has to be close enough
 * that every box is visible and grabbable on first open.
 */
export function defaultFields(size = DEFAULT_CHECK_SIZE_MM) {
  const { width: W } = size;
  const place = (key, overrides) => ({
    ...FIELD_DEFAULTS,
    ...FIELD_DEFINITIONS.find((f) => f.key === key),
    ...overrides,
  });

  return [
    place('date', { x: W - 60, y: 12, width: 50, height: 7, align: 'left' }),
    place('date_segments', {
      // Off by default: only some banks pre-print digit boxes. Turning this on
      // normally means turning the plain 'date' field off.
      enabled: false,
      fontFamily: 'Courier',
      fontSize: 11,
      align: 'center',
      datePattern: DEFAULT_SEGMENTED_FORMAT,
      boxes: buildSegmentBoxes(DEFAULT_SEGMENTED_FORMAT, { x: W - 58, y: 10 }),
    }),
    place('payee', { x: 22, y: 27, width: W - 70, height: 8 }),
    place('amount_numeric', {
      x: W - 48,
      y: 27,
      width: 40,
      height: 8,
      align: 'right',
      fontFamily: 'Courier',
    }),
    place('amount_words', {
      x: 18,
      y: 38,
      width: W - 30,
      height: 12,
      fontSize: 10,
      maxLines: 2,
    }),
    place('memo', { x: 18, y: 60, width: 70, height: 6, fontSize: 8, enabled: false }),
    place('crossing', { x: 6, y: 4, width: 26, height: 22, enabled: false }),
    place('account_payee', {
      x: 6,
      y: 6,
      width: 40,
      height: 5,
      fontSize: 7,
      uppercase: true,
      enabled: false,
    }),
    place('signature', {
      x: W - 70,
      y: 55,
      width: 55,
      height: 14,
      enabled: false,
    }),
  ];
}

/** A cheque date needs 6-8 boxes; this is headroom, not a target. */
export const MAX_SEGMENT_BOXES = 16;

function clampMm(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.round(n * 100) / 100, min), max);
}

/**
 * Does this segmented-date field have exactly one box per digit?
 * Returns `{ ok, expected, actual }` so callers can explain the mismatch.
 */
export function checkSegmentBoxes(field) {
  const expected = digitCount(field?.datePattern) ?? 0;
  const actual = Array.isArray(field?.boxes) ? field.boxes.length : 0;
  return { ok: expected > 0 && expected === actual, expected, actual };
}

const NUMBER_FIELDS = [
  'x', 'y', 'width', 'height', 'fontSize', 'lineGap', 'maxLines',
  'crossingLineWidth',
];

/**
 * Coerce whatever the client sent into a valid field list. Anything unknown is
 * dropped rather than trusted — this JSON goes straight into the PDF renderer.
 */
export function sanitizeFields(input, size = DEFAULT_CHECK_SIZE_MM) {
  if (!Array.isArray(input)) return defaultFields(size);

  const seen = new Set();
  const fields = [];

  for (const raw of input) {
    const definition = FIELD_DEFINITIONS.find((f) => f.key === raw?.key);
    if (!definition || seen.has(definition.key)) continue;
    seen.add(definition.key);

    const field = {
      ...FIELD_DEFAULTS,
      ...definition,
      ...Object.fromEntries(
        Object.entries(raw).filter(([k]) => k in FIELD_DEFAULTS),
      ),
      key: definition.key,
      label: definition.label,
      type: definition.type,
    };

    for (const n of NUMBER_FIELDS) {
      const value = Number(field[n]);
      field[n] = Number.isFinite(value) ? value : FIELD_DEFAULTS[n];
    }

    field.enabled = Boolean(field.enabled);
    field.bold = Boolean(field.bold);
    field.uppercase = Boolean(field.uppercase);
    field.align = ALIGNMENTS.includes(field.align) ? field.align : 'left';
    field.fontFamily = FONT_FAMILIES.includes(field.fontFamily)
      ? field.fontFamily
      : 'Helvetica';
    field.fontSize = Math.min(Math.max(field.fontSize, 4), 48);
    field.maxLines = Math.min(Math.max(Math.round(field.maxLines), 1), 4);

    // Keep boxes on the cheque, but allow a small bleed for hand-tuning.
    field.x = Math.min(Math.max(field.x, -10), size.width + 10);
    field.y = Math.min(Math.max(field.y, -10), size.height + 10);
    field.width = Math.min(Math.max(field.width, 3), size.width + 20);
    field.height = Math.min(Math.max(field.height, 3), size.height + 20);

    if (field.type === 'segmented_date') {
      field.datePattern = isSegmentable(field.datePattern)
        ? field.datePattern
        : DEFAULT_SEGMENTED_FORMAT;

      field.boxes = (Array.isArray(field.boxes) ? field.boxes : [])
        // A cheque has at most a handful of digit boxes; cap it so a malformed
        // payload cannot make the renderer loop over thousands of entries.
        .slice(0, MAX_SEGMENT_BOXES)
        .map((box) => ({
          x: clampMm(box?.x, -10, size.width + 10, 0),
          y: clampMm(box?.y, -10, size.height + 10, 0),
          width: clampMm(box?.width, 1.5, 40, 4.5),
          height: clampMm(box?.height, 1.5, 40, 6),
        }));
    } else {
      delete field.boxes;
      delete field.datePattern;
    }

    fields.push(field);
  }

  // Any field the client omitted keeps its default so the editor can show it.
  for (const definition of FIELD_DEFINITIONS) {
    if (!seen.has(definition.key)) {
      const fallback = defaultFields(size).find((f) => f.key === definition.key);
      fields.push({ ...fallback, enabled: false });
    }
  }

  return fields;
}
