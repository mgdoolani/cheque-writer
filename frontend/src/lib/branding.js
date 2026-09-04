/**
 * Product identity in one place, so a rename is a one-line change rather than a
 * hunt through the UI.
 *
 * PRODUCT_NAME is the software. COMPANY NAME is a per-deployment setting each
 * business types into Settings — the two are shown together but are not the
 * same thing, and neither has anything to do with the account name printed on a
 * cheque, which comes pre-printed from the bank.
 */

export const PRODUCT_NAME = 'Cheque Writer';

/** Fixed attribution. Not a setting, not editable in the app. */
export const CREDIT = 'Created by mgdoolani';

/** "Acme Trading — Cheque Writer", or just the product before one is set. */
export const titleFor = (companyName, page) => {
  const owner = companyName?.trim();
  const base = owner ? `${owner} — ${PRODUCT_NAME}` : PRODUCT_NAME;
  return page ? `${page} · ${base}` : base;
};

/** Filesystem-safe fragment for export filenames. */
export const slug = (text) =>
  String(text || '')
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase();
