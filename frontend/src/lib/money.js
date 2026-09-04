/**
 * Amount entry helpers.
 *
 * The field is comma-grouped as you type (Section 2b). Rather than reformat the
 * whole string on every keystroke and fight the caret, the digits are kept as
 * the source of truth and the display is derived from them.
 */

/** Keep digits and at most one decimal point, capped at two decimal places. */
export function normaliseAmountInput(raw) {
  let text = String(raw).replace(/[^\d.]/g, '');

  const firstDot = text.indexOf('.');
  if (firstDot !== -1) {
    // Drop any further dots.
    text = `${text.slice(0, firstDot + 1)}${text.slice(firstDot + 1).replace(/\./g, '')}`;
    const [whole, decimals] = text.split('.');
    text = `${whole}.${decimals.slice(0, 2)}`;
  }

  // Strip leading zeros, but keep a single one before a decimal point.
  text = text.replace(/^0+(?=\d)/, '');

  return text;
}

/** '1500.5' -> '1,500.5' — grouping only, no forced decimals while typing. */
export function groupAmount(text) {
  if (!text) return '';
  const [whole, decimals] = text.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return decimals === undefined ? grouped : `${grouped}.${decimals}`;
}

/** What lands in the field on blur: always two decimals. */
export function padAmount(text) {
  if (!text || text === '.') return '';
  const value = Number(text);
  if (!Number.isFinite(value)) return '';
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Display string -> number. '1,500.75' -> 1500.75 */
export const parseAmount = (display) => {
  const value = Number(String(display).replace(/,/g, ''));
  return Number.isFinite(value) ? value : NaN;
};

/** 1500.5 -> '1,500.50' for display anywhere outside the amount input. */
export const formatMoney = (value) =>
  Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
