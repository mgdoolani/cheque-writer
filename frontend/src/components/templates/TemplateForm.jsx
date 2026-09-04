/**
 * Template metadata: what the cheque physically is, and how it should be fed
 * through the printer (Section 5). Field positions are not edited here — that
 * is the visual editor in Module 6.
 */

import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import Icon from '../Icon.jsx';
import Modal from '../Modal.jsx';
import useQzTray from '../../hooks/useQzTray.js';

const BLANK = {
  name: '',
  bankName: '',
  printerProfileId: '',
  checkWidthMm: 178,
  checkHeightMm: 76,
  orientation: 'landscape',
  paperMode: 'exact',
  paperSize: 'A4',
  feedOffsetXMm: 0,
  feedOffsetYMm: 0,
  isActive: true,
};

const PAPER_SIZES = [
  { value: 'A4', label: 'A4 — 210 × 297 mm' },
  { value: 'LETTER', label: 'Letter — 216 × 279 mm' },
  { value: 'LEGAL', label: 'Legal — 216 × 356 mm' },
];

export default function TemplateForm({ open, template, onClose, onSaved }) {
  const [form, setForm] = useState(BLANK);
  const [printers, setPrinters] = useState([]);
  const qz = useQzTray();
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const isEdit = Boolean(template?.id);
  const isFeed = form.paperMode === 'feed';

  useEffect(() => {
    if (!open) return;
    setForm(template
      ? { ...BLANK, ...template, printerProfileId: template.printerProfileId ?? '' }
      : BLANK);
    setError(null);
    setSaving(false);
    // Assignable from either side: here, or from the printer's own screen.
    api.get('/printers').then((d) => setPrinters(d.printers)).catch(() => {});
  }, [open, template]);

  const set = (key) => (event) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  const setNumber = (key) => (event) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  async function handleSubmit(event) {
    event.preventDefault();
    if (saving) return;

    const width = Number(form.checkWidthMm);
    const height = Number(form.checkHeightMm);

    if (!form.name.trim()) return setError('Give the template a name');
    if (!(width > 20) || !(height > 20)) {
      return setError('Cheque width and height must each be more than 20 mm');
    }

    setSaving(true);
    setError(null);

    try {
      let saved;
      if (isEdit) {
        const data = await api.put(`/templates/${template.id}`, {
          name: form.name.trim(),
          bankName: form.bankName.trim(),
          checkWidthMm: width,
          checkHeightMm: height,
          printerProfileId: form.printerProfileId === '' ? null : Number(form.printerProfileId),
          orientation: form.orientation,
          paperMode: form.paperMode,
          paperSize: form.paperSize,
          feedOffsetXMm: Number(form.feedOffsetXMm) || 0,
          feedOffsetYMm: Number(form.feedOffsetYMm) || 0,
          isActive: form.isActive,
        });
        saved = data.template;
      } else {
        // Create takes the essentials; the rest is edited straight after.
        const data = await api.post('/templates', {
          name: form.name.trim(),
          bankName: form.bankName.trim(),
          checkWidthMm: width,
          checkHeightMm: height,
        });
        saved = data.template;
      }
      onSaved?.(saved, isEdit);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
    return undefined;
  }

  return (
    <Modal
      open={open}
      onClose={saving ? undefined : onClose}
      dismissible={!saving}
      title={isEdit ? 'Edit template' : 'New bank template'}
      description={isEdit ? template?.name : 'One layout per bank account.'}
      width={640}
    >
      <form className="stack" onSubmit={handleSubmit} noValidate>
        {error && (
          <div className="alert alert--danger" role="alert">
            <Icon name="error" size={18} />
            <span>{error}</span>
          </div>
        )}

        <div className="form-grid">
          <div className="field">
            <label className="field__label" htmlFor="tpl-name">Template name</label>
            <input
              id="tpl-name"
              className="input"
              value={form.name}
              onChange={set('name')}
              placeholder="BDO — Current Account"
              disabled={saving}
              /* eslint-disable-next-line jsx-a11y/no-autofocus -- first field of a dialog */
              autoFocus
              required
            />
          </div>

          <div className="field">
            <label className="field__label" htmlFor="tpl-bank">Bank</label>
            <input
              id="tpl-bank"
              className="input"
              value={form.bankName}
              onChange={set('bankName')}
              placeholder="BDO Unibank"
              disabled={saving}
            />
          </div>
        </div>

        <fieldset className="fieldset">
          <legend>Cheque size</legend>
          <p className="field__hint" style={{ marginBottom: 'var(--sp-3)' }}>
            Measure your actual blank stock with a ruler. Everything else is
            positioned against these numbers, so get them right first.
          </p>
          <div className="form-grid">
            <div className="field">
              <label className="field__label" htmlFor="tpl-w">Width (mm)</label>
              <input
                id="tpl-w"
                className="input"
                type="number"
                step="0.5"
                min="20"
                value={form.checkWidthMm}
                onChange={setNumber('checkWidthMm')}
                disabled={saving}
              />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="tpl-h">Height (mm)</label>
              <input
                id="tpl-h"
                className="input"
                type="number"
                step="0.5"
                min="20"
                value={form.checkHeightMm}
                onChange={setNumber('checkHeightMm')}
                disabled={saving}
              />
            </div>
          </div>
        </fieldset>

        {isEdit ? (
          <fieldset className="fieldset">
            <legend>Printing</legend>

            <div className="field" style={{ marginBottom: 'var(--sp-4)' }}>
              <label className="field__label" htmlFor="tpl-printer">Printer</label>
              <select
                id="tpl-printer"
                className="select"
                value={form.printerProfileId ?? ''}
                onChange={set('printerProfileId')}
                disabled={saving}
              >
                <option value="">None — use the settings below</option>
                {printers.map((p) => {
                  // Flag profiles whose printer this machine cannot reach, so
                  // one is not picked as though it were freely usable.
                  const unreachable =
                    qz.available && p.calibratedOnPrinter &&
                    !qz.printers.includes(p.calibratedOnPrinter);
                  return (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.minPageHeightMm > 0 ? ` — min ${p.minPageHeightMm}mm` : ''}
                      {p.workstation ? ` · at ${p.workstation}` : ''}
                      {unreachable ? '  — not available on this computer' : ''}
                      {p.isDefault ? ' (default)' : ''}
                    </option>
                  );
                })}
              </select>
              <span className="field__hint">
                {form.printerProfileId
                  ? 'Page size, rotation and alignment come from this printer profile, and the settings below are ignored.'
                  : 'No printer profile: this template uses its own paper settings below.'}
              </span>
              {(() => {
                const chosen = printers.find((p) => String(p.id) === String(form.printerProfileId));
                if (!chosen || !qz.available || !chosen.calibratedOnPrinter) return null;
                if (qz.printers.includes(chosen.calibratedOnPrinter)) return null;
                return (
                  <span className="field__error">
                    <Icon name="print_disabled" size={13} /> Not available on this
                    computer — “{chosen.calibratedOnPrinter}” isn&rsquo;t among this
                    machine&rsquo;s printers.
                  </span>
                );
              })()}
            </div>

            <div className="field" style={{ marginBottom: 'var(--sp-4)' }}>
              <label className="field__label" htmlFor="tpl-paper-mode">Paper feed</label>
              <select
                id="tpl-paper-mode"
                className="select"
                value={form.paperMode}
                onChange={set('paperMode')}
                disabled={saving}
              >
                <option value="exact">
                  Default (app-specified) — the page is exactly the cheque
                </option>
                <option value="feed">
                  Follow paper feed — a full sheet, printer handles alignment
                </option>
              </select>
              <span className="field__hint">
                {isFeed
                  ? 'The PDF is a full sheet with the cheque placed at the offset below. Use this when the tray is loaded with standard paper.'
                  : 'The PDF page is the size of the cheque itself. Most predictable when you feed cheques one at a time.'}
              </span>
            </div>

            <div className="form-grid">
              <div className="field">
                <label className="field__label" htmlFor="tpl-orientation">Orientation</label>
                <select
                  id="tpl-orientation"
                  className="select"
                  value={form.orientation}
                  onChange={set('orientation')}
                  disabled={saving || !isFeed}
                >
                  <option value="landscape">Landscape</option>
                  <option value="portrait">Portrait</option>
                </select>
                {!isFeed && (
                  <span className="field__hint">
                    Not used in this mode — the page is the cheque, so its own
                    width and height decide the orientation.
                  </span>
                )}
              </div>

              <div className="field">
                <label className="field__label" htmlFor="tpl-paper-size">Sheet size</label>
                <select
                  id="tpl-paper-size"
                  className="select"
                  value={form.paperSize}
                  onChange={set('paperSize')}
                  disabled={saving || !isFeed}
                >
                  {PAPER_SIZES.map((size) => (
                    <option key={size.value} value={size.value}>{size.label}</option>
                  ))}
                </select>
              </div>

              {isFeed && (
                <>
                  <div className="field">
                    <label className="field__label" htmlFor="tpl-off-x">
                      Cheque offset — left (mm)
                    </label>
                    <input
                      id="tpl-off-x"
                      className="input"
                      type="number"
                      step="0.5"
                      value={form.feedOffsetXMm}
                      onChange={setNumber('feedOffsetXMm')}
                      disabled={saving}
                    />
                  </div>
                  <div className="field">
                    <label className="field__label" htmlFor="tpl-off-y">
                      Cheque offset — top (mm)
                    </label>
                    <input
                      id="tpl-off-y"
                      className="input"
                      type="number"
                      step="0.5"
                      value={form.feedOffsetYMm}
                      onChange={setNumber('feedOffsetYMm')}
                      disabled={saving}
                    />
                  </div>
                </>
              )}

              <div className="field field--full">
                <label className="field__label" htmlFor="tpl-active">Status</label>
                <select
                  id="tpl-active"
                  className="select"
                  value={form.isActive ? 'active' : 'inactive'}
                  onChange={(e) =>
                    setForm((c) => ({ ...c, isActive: e.target.value === 'active' }))
                  }
                  disabled={saving}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Retired — hidden when writing a cheque</option>
                </select>
              </div>
            </div>
          </fieldset>
        ) : (
          <div className="alert alert--info">
            <Icon name="info" size={18} />
            <span>
              Print settings and field positions are set once the template
              exists.
            </span>
          </div>
        )}

        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary" disabled={saving || !form.name.trim()}>
            {saving ? <span className="spinner" /> : <Icon name="save" size={18} />}
            {isEdit ? 'Save changes' : 'Create template'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
