/**
 * Numeric amount -> words, for the "Amount in Words" line of a cheque.
 *
 * Two things are configurable at runtime (Settings), never hardcoded:
 *   - style:    'UK' inserts "And", 'US' does not.
 *   - currency: the major-unit word ("Pesos", "Dollars", "Baht", ...) and the
 *               minor-unit word ("Centavos", "Cents", "Satang", ...).
 *
 * The "And" rule is taken from the spec's own examples:
 *   UK  120     -> "One Hundred And Twenty Pesos Only"
 *   UK  1500    -> "One Thousand And Five Hundred Pesos Only"
 *   US  120     -> "One Hundred Twenty Pesos Only"
 *   US  200     -> "Two Hundred Pesos Only"
 * i.e. UK puts "And" between a hundreds figure and its remainder, and before
 * the final group of a multi-group number. US never inserts it.
 */

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen',
];

const TENS = [
  '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty',
  'Ninety',
];

// Index = how many thousand-groups from the right.
const SCALES = ['', 'Thousand', 'Million', 'Billion', 'Trillion'];

export const MAX_AMOUNT = 999_999_999_999_999.99; // top of the Trillion scale

/** 1..999 -> words. `useAnd` controls the "One Hundred And Twenty" join. */
function chunkToWords(n, useAnd) {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const parts = [];

  if (hundreds) parts.push(`${ONES[hundreds]} Hundred`);

  if (rest) {
    const restWords =
      rest < 20
        ? ONES[rest]
        : [TENS[Math.floor(rest / 10)], ONES[rest % 10]].filter(Boolean).join(' ');

    // "One Hundred And Twenty" (UK) vs "One Hundred Twenty" (US).
    if (hundreds && useAnd) parts.push('And');
    parts.push(restWords);
  }

  return parts.join(' ');
}

/** Whole non-negative integer -> words. */
function integerToWords(value, useAnd) {
  if (value === 0) return 'Zero';

  // Split into 3-digit groups, most significant first.
  const groups = [];
  let remaining = value;
  while (remaining > 0) {
    groups.unshift(remaining % 1000);
    remaining = Math.floor(remaining / 1000);
  }

  const parts = [];
  groups.forEach((group, i) => {
    if (group === 0) return;
    const scale = SCALES[groups.length - 1 - i];
    parts.push(`${chunkToWords(group, useAnd)}${scale ? ` ${scale}` : ''}`);
  });

  if (parts.length === 1) return parts[0];

  // UK: "One Thousand And Five Hundred" — "And" before the final group only.
  if (useAnd) {
    const last = parts.pop();
    return `${parts.join(' ')} And ${last}`;
  }
  return parts.join(' ');
}

/**
 * Split a money value into whole units and minor units without the floating
 * point drift you get from `Math.round(value % 1 * 100)` on values like 1.005.
 */
function splitAmount(value) {
  const totalMinor = Math.round(Number(value) * 100);
  return {
    major: Math.floor(totalMinor / 100),
    minor: totalMinor % 100,
  };
}

/**
 * @param {number|string} amount   e.g. 1500 or "1,500.00"
 * @param {object} [opts]
 * @param {'UK'|'US'} [opts.style='US']
 * @param {string} [opts.currencyLabel='Pesos']
 * @param {string} [opts.subunitLabel='Centavos']
 * @param {boolean} [opts.trailingOnly=true]  append the word "Only"
 * @returns {string}
 */
export function amountToWords(amount, opts = {}) {
  const {
    style = 'US',
    currencyLabel = 'Pesos',
    subunitLabel = 'Centavos',
    trailingOnly = true,
  } = opts;

  const numeric =
    typeof amount === 'string' ? Number(amount.replace(/,/g, '')) : Number(amount);

  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new Error('amountToWords: amount must be a non-negative number');
  }
  if (numeric > MAX_AMOUNT) {
    throw new Error('amountToWords: amount exceeds the supported maximum');
  }

  const useAnd = style === 'UK';
  const { major, minor } = splitAmount(numeric);

  let words = `${integerToWords(major, useAnd)} ${currencyLabel}`;
  if (minor > 0) {
    words += ` And ${chunkToWords(minor, useAnd)} ${subunitLabel}`;
  }
  if (trailingOnly) words += ' Only';

  return words;
}

/** 1500 -> "1,500.00". Always comma-grouped, independent of the words style. */
export function formatAmount(amount) {
  const numeric =
    typeof amount === 'string' ? Number(amount.replace(/,/g, '')) : Number(amount);
  if (!Number.isFinite(numeric)) return '';
  return numeric.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
