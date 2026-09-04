/**
 * Starting points for the Printer Setup Wizard.
 *
 * IMPORTANT, and stated plainly in the UI too: these minimum page heights are
 * TYPICAL values for each family, not manufacturer-verified figures for every
 * model. Most consumer inkjets refuse a custom page shorter than 5 inches
 * (127 mm), which is why a 76 mm cheque page silently fails to print.
 *
 * The catalogue is a convenience, never the authority. The wizard always shows
 * the number it filled in and offers the "Other" path, and the alignment-sheet
 * step catches a wrong guess before any real cheque is printed.
 */

/** 5 inches — the usual custom-size floor on consumer inkjets. */
const INKJET_MIN_HEIGHT_MM = 127;

export const PRINTER_MODELS = [
  {
    id: 'epson-l-series',
    label: 'Epson EcoTank L-series',
    examples: 'L3110, L3210, L5190, L5290, L5390, L6270',
    minPageHeightMm: INKJET_MIN_HEIGHT_MM,
    confidence: 'typical',
  },
  {
    id: 'epson-inkjet',
    label: 'Epson inkjet (other)',
    examples: 'Expression, WorkForce',
    minPageHeightMm: INKJET_MIN_HEIGHT_MM,
    confidence: 'typical',
  },
  {
    id: 'canon-pixma',
    label: 'Canon PIXMA / G-series',
    examples: 'G1010, G2010, G3010, TS series',
    minPageHeightMm: INKJET_MIN_HEIGHT_MM,
    confidence: 'typical',
  },
  {
    id: 'hp-inkjet',
    label: 'HP DeskJet / Ink Tank / Smart Tank',
    examples: '2300, 415, 500 series',
    minPageHeightMm: INKJET_MIN_HEIGHT_MM,
    confidence: 'typical',
  },
  {
    id: 'brother-inkjet',
    label: 'Brother inkjet',
    examples: 'DCP-T series, MFC-J series',
    minPageHeightMm: INKJET_MIN_HEIGHT_MM,
    confidence: 'typical',
  },
  {
    id: 'laser',
    label: 'Laser printer',
    examples: 'HP LaserJet, Brother HL, Canon imageCLASS',
    minPageHeightMm: INKJET_MIN_HEIGHT_MM,
    confidence: 'typical',
  },
  {
    id: 'dot-matrix',
    label: 'Dot-matrix / impact printer',
    examples: 'Epson LX-310, LQ-310',
    // Continuous-feed machines generally take the cheque at its own size.
    minPageHeightMm: 0,
    confidence: 'typical',
  },
  {
    id: 'none',
    label: 'My printer accepts the cheque size as-is',
    examples: 'No minimum page height',
    minPageHeightMm: 0,
    confidence: 'exact',
  },
];

export const OTHER_MODEL = {
  id: 'other',
  label: 'Other / not listed',
  examples: 'Answer one question and the wizard works it out',
  minPageHeightMm: null,
  confidence: 'ask',
};

/**
 * The plain-language check the wizard asks for an unlisted printer. Phrased as
 * an observation to make, not a specification to look up.
 */
export const HEIGHT_DISCOVERY = {
  question:
    "In your printer's own settings, try entering 76mm for height. " +
    'Did it change to a different number automatically? Enter what it changed to.',
  hint:
    'Windows: Printer properties → Paper/Quality → Custom size. ' +
    'macOS: Print → Paper Size → Manage Custom Sizes. ' +
    'If it accepted 76mm and left it alone, your printer has no minimum — enter 76.',
  fallbackMm: INKJET_MIN_HEIGHT_MM,
};

export const findModel = (id) =>
  PRINTER_MODELS.find((m) => m.id === id) || (id === 'other' ? OTHER_MODEL : null);
