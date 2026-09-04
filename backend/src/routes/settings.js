/**
 * Global settings (Sections 3 and 4).
 *
 * Reading is open to any signed-in user because the cheque form needs the
 * currency label and date format to show an accurate preview. Writing is
 * admin-only.
 */

import express from 'express';
import { requireRole } from '../middleware/auth.js';
import { getSettings, saveSettings, SETTING_DEFINITIONS } from '../lib/settings.js';
import { dateFormatOptions, segmentedFormatOptions } from '../lib/dateFormats.js';
import { amountToWords } from '../lib/amountToWords.js';
import { recordAudit, AUDIT_ACTIONS } from '../lib/audit.js';

// requireAuth + requirePasswordChanged are applied in index.js.
const router = express.Router();

router.get('/', async (_req, res) => {
  res.json({
    settings: await getSettings(),
    dateFormats: dateFormatOptions(),
    segmentedDateFormats: segmentedFormatOptions(),
    definitions: Object.fromEntries(
      Object.entries(SETTING_DEFINITIONS).map(([key, def]) => [
        key,
        { type: def.type, default: def.value },
      ]),
    ),
  });
});

/**
 * Phrasing preview for the Settings page, using values that have not been
 * saved yet — so an admin can see "One Hundred Pesos Only" before committing
 * to the currency word.
 */
router.post('/preview-words', (req, res) => {
  const raw = String(req.body?.amount ?? '100').replace(/,/g, '');
  const amount = Number(raw);

  try {
    res.json({
      preview: amountToWords(Number.isFinite(amount) ? amount : 100, {
        style: req.body?.style === 'UK' ? 'UK' : 'US',
        currencyLabel: String(req.body?.currencyLabel || 'Pesos').trim() || 'Pesos',
        subunitLabel: String(req.body?.subunitLabel || 'Centavos').trim() || 'Centavos',
      }),
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/', requireRole('admin'), async (req, res) => {
  const { errors, settings } = await saveSettings(req.body || {}, req.user.id);

  if (Object.keys(errors).length) {
    return res.status(400).json({ error: 'Some settings were rejected', errors });
  }

  await recordAudit(req, AUDIT_ACTIONS.SETTINGS_UPDATED, { type: 'settings' }, {
    keys: Object.keys(req.body || {}),
  });
  return res.json({ settings });
});

export default router;
