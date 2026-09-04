/**
 * Date formatting for the cheque "Date" field.
 *
 * The list of selectable formats is GENERATED from tokens, not hardcoded, so
 * new orderings/separators appear by editing the arrays below rather than by
 * adding cases to a switch. A format is stored in Settings as its token
 * pattern (e.g. "MM-DD-YYYY" or "MMMM DD, YYYY").
 *
 * Tokens
 *   DD    05          zero-padded day
 *   D     5           day
 *   MM    09          zero-padded month
 *   M     9           month
 *   MMMM  September   full month name
 *   MMMc  Sept        common abbreviation (Sept, June, July — as written by hand)
 *   MMM   Sep         strict 3-letter abbreviation
 *   YYYY  2025        four-digit year
 *   YY    25          two-digit year
 */

const MONTHS_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Strict three-letter form.
const MONTHS_SHORT = MONTHS_FULL.map((m) => m.slice(0, 3));

// How people actually abbreviate months by hand on a cheque.
const MONTHS_COMMON = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'June',
  'July', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec',
];

// Longest tokens first so "MMMM" is never matched as "MMM" + "M".
const TOKEN_ORDER = ['MMMM', 'MMMc', 'MMM', 'MM', 'M', 'DD', 'D', 'YYYY', 'YY'];

const TOKEN_RENDERERS = {
  YYYY: ({ year }) => String(year),
  YY: ({ year }) => String(year % 100).padStart(2, '0'),
  MMMM: ({ month }) => MONTHS_FULL[month - 1],
  MMMc: ({ month }) => MONTHS_COMMON[month - 1],
  MMM: ({ month }) => MONTHS_SHORT[month - 1],
  MM: ({ month }) => String(month).padStart(2, '0'),
  M: ({ month }) => String(month),
  DD: ({ day }) => String(day).padStart(2, '0'),
  D: ({ day }) => String(day),
};

/**
 * Pull Y/M/D out of a value without ever going through a timezone.
 * `new Date('2025-09-05')` is UTC midnight, which is the 4th in any negative
 * offset — so ISO-ish strings are split textually instead.
 */
export function toDateParts(value) {
  if (value instanceof Date) {
    return {
      year: value.getFullYear(),
      month: value.getMonth() + 1,
      day: value.getDate(),
    };
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  if (!match) throw new Error(`Unrecognised date value: ${value}`);
  return { year: +match[1], month: +match[2], day: +match[3] };
}

/** Render a date with a token pattern. Unknown characters pass through. */
export function formatDate(value, pattern = 'MM/DD/YYYY') {
  const parts = toDateParts(value);
  let out = '';
  let i = 0;

  while (i < pattern.length) {
    const token = TOKEN_ORDER.find((t) => pattern.startsWith(t, i));
    if (token) {
      out += TOKEN_RENDERERS[token](parts);
      i += token.length;
    } else {
      out += pattern[i];
      i += 1;
    }
  }
  return out;
}

// ── Format catalogue ──────────────────────────────────────────────────────────
// Edit these arrays to widen or narrow what the Settings dropdown offers.

const NUMERIC_SEPARATORS = ['-', '/', '.'];
const NUMERIC_ORDERS = [
  { key: 'MDY', tokens: (m, d, y) => [m, d, y] },
  { key: 'DMY', tokens: (m, d, y) => [d, m, y] },
  { key: 'YMD', tokens: (m, d, y) => [y, m, d] },
];
const YEAR_TOKENS = ['YYYY', 'YY'];
const MONTH_NAME_TOKENS = ['MMMM', 'MMMc', 'MMM'];

function buildNumericFormats() {
  const formats = [];
  for (const order of NUMERIC_ORDERS) {
    for (const sep of NUMERIC_SEPARATORS) {
      for (const padded of [true, false]) {
        for (const year of YEAR_TOKENS) {
          // YMD with a 2-digit year is genuinely ambiguous — skip it.
          if (order.key === 'YMD' && year === 'YY') continue;
          const month = padded ? 'MM' : 'M';
          const day = padded ? 'DD' : 'D';
          formats.push(order.tokens(month, day, year).join(sep));
        }
      }
    }
  }
  return formats;
}

function buildWordFormats() {
  const formats = [];
  for (const monthToken of MONTH_NAME_TOKENS) {
    for (const padded of [true, false]) {
      const day = padded ? 'DD' : 'D';
      // "September 05, 2025"
      formats.push(`${monthToken} ${day}, YYYY`);
      // "05 September 2025"
      formats.push(`${day} ${monthToken} YYYY`);
    }
  }
  return formats;
}

/** Every selectable pattern, de-duplicated, numeric first then word-based. */
export const DATE_FORMATS = [
  ...new Set([...buildNumericFormats(), ...buildWordFormats()]),
];

export const DEFAULT_DATE_FORMAT = 'MM/DD/YYYY';

export function isValidDateFormat(pattern) {
  return DATE_FORMATS.includes(pattern);
}

/**
 * The catalogue with a rendered sample for each entry, so the Settings
 * dropdown can show "MM-DD-YYYY — 09-05-2025" instead of a bare token string.
 */
export function dateFormatOptions(sample = '2025-09-05') {
  return DATE_FORMATS.map((pattern) => ({
    pattern,
    example: formatDate(sample, pattern),
    kind: /M{3}/.test(pattern) ? 'word' : 'numeric',
  }));
}

// ── Segmented (digit-box) dates ───────────────────────────────────────────────
//
// Real Philippine cheque stock often pre-prints the date as individual character
// boxes with the separators already on the paper:  M M - D D - Y Y Y Y
// For that layout the app prints DIGITS ONLY, one per box.
//
// Only zero-padded tokens qualify. An unpadded pattern like "M/D/YYYY" produces
// six digits in September and eight in December, so it can never map onto a
// fixed row of boxes — those patterns are excluded rather than silently
// mis-filling the stock.

const PADDED_DIGIT_TOKENS = { YYYY: 4, YY: 2, MM: 2, DD: 2 };

/**
 * The digit groups a pattern produces, in print order.
 * 'MM-DD-YYYY' -> [{token:'MM',size:2},{token:'DD',size:2},{token:'YYYY',size:4}]
 * Returns null if the pattern contains anything that isn't a padded token.
 */
export function digitGroups(pattern) {
  const groups = [];
  let i = 0;

  while (i < pattern.length) {
    // Match against the FULL token list, longest-first — the same one
    // formatDate uses. Matching only the padded tokens would read "MMMM" as
    // two "MM"s and happily report a month name as ten digits.
    const token = TOKEN_ORDER.find((t) => pattern.startsWith(t, i));

    if (token) {
      const size = PADDED_DIGIT_TOKENS[token];
      // A real token, but not one that yields a fixed digit count: MMMM, MMMc,
      // MMM (month names) or M / D (unpadded, so variable width).
      if (!size) return null;
      groups.push({ token, size });
      i += token.length;
      continue;
    }

    // A separator is fine — it is pre-printed on the stock and never drawn.
    if (/[-/.\s,]/.test(pattern[i])) {
      i += 1;
      continue;
    }

    return null;
  }

  return groups.length ? groups : null;
}

/** How many boxes a pattern needs. 'MM-DD-YYYY' -> 8. Null if unsupported. */
export function digitCount(pattern) {
  const groups = digitGroups(pattern);
  return groups ? groups.reduce((sum, g) => sum + g.size, 0) : null;
}

/** Can this pattern drive a row of digit boxes? */
export const isSegmentable = (pattern) => digitGroups(pattern) !== null;

/** Every format that can. Offered wherever a segmented date is configured. */
export const SEGMENTED_DATE_FORMATS = DATE_FORMATS.filter(isSegmentable);

export const DEFAULT_SEGMENTED_FORMAT = 'MM-DD-YYYY';

/**
 * The digits to print, separators stripped.
 * dateDigits('2026-09-05', 'MM-DD-YYYY') -> '09052026'
 */
export function dateDigits(value, pattern) {
  const groups = digitGroups(pattern);
  if (!groups) return '';

  const parts = toDateParts(value);
  return groups
    .map(({ token }) => {
      if (token === 'YYYY') return String(parts.year).padStart(4, '0');
      if (token === 'YY') return String(parts.year % 100).padStart(2, '0');
      if (token === 'MM') return String(parts.month).padStart(2, '0');
      return String(parts.day).padStart(2, '0');
    })
    .join('');
}

/** Catalogue for the editor's pattern picker, with a worked example. */
export function segmentedFormatOptions(sample = '2025-09-05') {
  return SEGMENTED_DATE_FORMATS.map((pattern) => ({
    pattern,
    example: formatDate(sample, pattern),
    digits: dateDigits(sample, pattern),
    boxes: digitCount(pattern),
    groups: digitGroups(pattern).map((g) => g.size),
  }));
}
