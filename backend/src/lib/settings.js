/**
 * Global settings. Stored one row per key so a new setting is a line here, not
 * a migration.
 */

import { query } from '../db/index.js';
import { DEFAULT_DATE_FORMAT, isValidDateFormat } from './dateFormats.js';

/** key -> { value, type, validate } */
export const SETTING_DEFINITIONS = {
  company_name: { value: '', type: 'string' },

  // Section 3 — amount in words.
  amount_words_style: {
    value: 'US',
    type: 'string',
    validate: (v) => (['US', 'UK'].includes(v) ? null : 'Style must be US or UK'),
  },
  currency_label: {
    value: 'Pesos',
    type: 'string',
    validate: (v) =>
      v && v.trim().length > 0 && v.length <= 24 ? null : 'Currency label is required',
  },
  currency_subunit_label: {
    value: 'Centavos',
    type: 'string',
    validate: (v) =>
      v && v.trim().length > 0 && v.length <= 24 ? null : 'Sub-unit label is required',
  },

  // Section 4 — date format.
  date_format: {
    value: DEFAULT_DATE_FORMAT,
    type: 'string',
    validate: (v) => (isValidDateFormat(v) ? null : 'Unknown date format'),
  },

  // Section 11 — the theme a NEW account starts on. Existing users keep
  // whatever they have chosen; this is a default, not an override.
  default_theme: {
    value: 'system',
    type: 'string',
    validate: (v) =>
      ['light', 'dark', 'system'].includes(v) ? null : 'Theme must be light, dark or system',
  },

  // Section 9 — duplicate-print prevention.
  duplicate_warning_days: {
    value: 30,
    type: 'number',
    validate: (v) => (v >= 0 && v <= 365 ? null : 'Must be between 0 and 365 days'),
  },
  allow_reprint: { value: true, type: 'boolean' },
  require_reprint_reason: { value: true, type: 'boolean' },
};

function coerce(raw, type) {
  if (raw === null || raw === undefined) return null;
  if (type === 'number') return Number(raw);
  if (type === 'boolean') return raw === true || raw === 'true';
  return String(raw);
}

/** Every setting, with defaults filled in for keys that were never saved. */
export async function getSettings() {
  const { rows } = await query('SELECT key, value FROM settings');
  const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));

  return Object.fromEntries(
    Object.entries(SETTING_DEFINITIONS).map(([key, def]) => [
      key,
      key in stored ? coerce(stored[key], def.type) : def.value,
    ]),
  );
}

/**
 * Validate and persist a partial settings patch.
 * @returns {Promise<{errors: Record<string,string>, settings: object}>}
 */
export async function saveSettings(patch, userId) {
  const errors = {};
  const accepted = [];

  for (const [key, raw] of Object.entries(patch)) {
    const def = SETTING_DEFINITIONS[key];
    if (!def) continue; // ignore unknown keys rather than trusting them

    const value = coerce(raw, def.type);
    const problem = def.validate ? def.validate(value) : null;
    if (problem) {
      errors[key] = problem;
      continue;
    }
    accepted.push([key, String(value)]);
  }

  if (Object.keys(errors).length === 0) {
    for (const [key, value] of accepted) {
      await query(
        `INSERT INTO settings (key, value, updated_by, updated_at)
              VALUES ($1, $2, $3, now())
         ON CONFLICT (key)
         DO UPDATE SET value = EXCLUDED.value,
                       updated_by = EXCLUDED.updated_by,
                       updated_at = now()`,
        [key, value, userId ?? null],
      );
    }
  }

  return { errors, settings: await getSettings() };
}
