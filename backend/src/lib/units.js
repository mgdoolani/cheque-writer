/**
 * Everything about a cheque layout is stored in MILLIMETRES.
 *
 * Not pixels: a pixel is meaningless without a DPI, and the reference photo a
 * user uploads can be any resolution. Millimetres are what you get when you put
 * a ruler on the actual cheque, so a saved template stays correct no matter
 * what image it was traced over, or what screen it was traced on.
 *
 * Points (1/72") are the PDF unit and are derived here at draw time.
 */

export const MM_PER_INCH = 25.4;
export const PT_PER_INCH = 72;
export const PT_PER_MM = PT_PER_INCH / MM_PER_INCH; // 2.8346456692913384

export const mmToPt = (mm) => Number(mm) * PT_PER_MM;
export const ptToMm = (pt) => Number(pt) / PT_PER_MM;
export const mmToIn = (mm) => Number(mm) / MM_PER_INCH;

/** Effective DPI of a reference image, given the physical width it depicts. */
export const imageDpi = (pixelWidth, physicalWidthMm) =>
  pixelWidth / mmToIn(physicalWidthMm);

/** Standard sheet sizes, in points, for "follow paper feed" printing. */
export const PAPER_SIZES = {
  A4: [595.28, 841.89],
  LETTER: [612, 792],
  LEGAL: [612, 1008],
};

/** A typical Philippine cheque, in mm. Templates override this per bank. */
export const DEFAULT_CHECK_SIZE_MM = { width: 178, height: 76 };

/** The same sheets in millimetres, for the Paper Feed Path maths. */
export const PAPER_SIZES_MM = {
  A4: { width: 210, height: 297 },
  LETTER: { width: 215.9, height: 279.4 },
  LEGAL: { width: 215.9, height: 355.6 },
};

export const FEED_PATHS = ['center', 'left', 'right'];

/**
 * Where a cheque sits across the sheet for a given feed path.
 *
 * Printers guide single cheques against the centre or one edge of the tray.
 * Rather than make an operator work out the millimetres, they pick the guide
 * they actually used and this derives the starting offset. The Y offset stays
 * at the leading edge — vertical position is what fine-tuning is for.
 *
 * @returns {{x:number, y:number}} millimetres from the sheet's top-left
 */
export function feedPathOffsets({
  paperSize = 'A4',
  orientation = 'landscape',
  checkWidthMm = DEFAULT_CHECK_SIZE_MM.width,
  feedPath = 'center',
}) {
  const sheet = PAPER_SIZES_MM[paperSize] || PAPER_SIZES_MM.A4;
  const sheetWidth = orientation === 'landscape' ? sheet.height : sheet.width;

  const spare = Math.max(0, sheetWidth - Number(checkWidthMm));
  const x =
    feedPath === 'left' ? 0 : feedPath === 'right' ? spare : spare / 2;

  return { x: Math.round(x * 10) / 10, y: 0 };
}
