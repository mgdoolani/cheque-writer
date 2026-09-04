/**
 * Print Options vocabulary, mirroring backend/src/lib/units.js.
 *
 * The server recomputes offsets on save, so this copy exists only to show the
 * operator what a preset will do before they commit to it.
 */

export const PAPER_SIZES_MM = {
  A4: { width: 210, height: 297, label: 'A4 — 210 × 297 mm' },
  LETTER: { width: 215.9, height: 279.4, label: 'Letter — 216 × 279 mm' },
  LEGAL: { width: 215.9, height: 355.6, label: 'Legal — 216 × 356 mm' },
};

export const ORIENTATIONS = [
  { value: 'landscape', label: 'Landscape', icon: 'crop_landscape' },
  { value: 'portrait', label: 'Portrait', icon: 'crop_portrait' },
];

export const PAPER_MODES = [
  {
    value: 'exact',
    label: 'Default',
    hint: 'The page is exactly the cheque. Most predictable when feeding cheques one at a time.',
  },
  {
    value: 'feed',
    label: 'Follow Paper Feed',
    hint: 'A full sheet; the printer’s own feed decides alignment. Use this if nothing lands on the cheque.',
  },
];

export const FEED_PATHS = [
  { value: 'center', label: 'Center', icon: 'align_horizontal_center' },
  { value: 'left', label: 'Left', icon: 'align_horizontal_left' },
  { value: 'right', label: 'Right', icon: 'align_horizontal_right' },
];

/** Same maths as the server's feedPathOffsets. */
export function feedPathOffsets({ paperSize = 'A4', orientation = 'landscape', checkWidthMm = 178, feedPath = 'center' }) {
  const sheet = PAPER_SIZES_MM[paperSize] || PAPER_SIZES_MM.A4;
  const sheetWidth = orientation === 'landscape' ? sheet.height : sheet.width;
  const spare = Math.max(0, sheetWidth - Number(checkWidthMm));
  const x = feedPath === 'left' ? 0 : feedPath === 'right' ? spare : spare / 2;
  return { x: Math.round(x * 10) / 10, y: 0 };
}

/** Width of the sheet the cheque is fed across, in mm. */
export const sheetWidthMm = (paperSize, orientation) => {
  const sheet = PAPER_SIZES_MM[paperSize] || PAPER_SIZES_MM.A4;
  return orientation === 'landscape' ? sheet.height : sheet.width;
};
