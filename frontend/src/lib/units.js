/**
 * Millimetre maths for the layout editor.
 *
 * LOCKED DECISION: field coordinates are stored in millimetres, never pixels.
 * A pixel means nothing without a DPI, and the reference scan can be any
 * resolution. Millimetres are what a ruler on the real cheque gives you, so a
 * saved template stays correct no matter what it was traced over or which
 * screen it was traced on. This file is the only place px ever appears, and
 * only ever as a display concern.
 */

export const MM_PER_INCH = 25.4;
export const PT_PER_INCH = 72;

/** 1 pt in mm — used to draw font sizes true-to-scale on the canvas. */
export const MM_PER_PT = MM_PER_INCH / PT_PER_INCH; // 0.352777…

export const mmToPt = (mm) => (Number(mm) * PT_PER_INCH) / MM_PER_INCH;
export const ptToMm = (pt) => (Number(pt) * MM_PER_INCH) / PT_PER_INCH;

/** Round to a step (0.5mm normal nudge, 0.1mm fine). Avoids float dust. */
export function snap(valueMm, stepMm) {
  if (!stepMm) return Math.round(Number(valueMm) * 100) / 100;
  return Math.round(Number(valueMm) / stepMm) * stepMm;
}

/** Trim float noise for display: 12.300000000000001 -> 12.3 */
export const tidy = (value) => Math.round(Number(value) * 100) / 100;

export const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

/** What a scan works out to, in DPI, across a cheque of a given width. */
export const imageDpi = (pixelWidth, physicalWidthMm) =>
  pixelWidth / (physicalWidthMm / MM_PER_INCH);
