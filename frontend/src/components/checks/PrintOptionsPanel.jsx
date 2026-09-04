/**
 * Print Options — the settings an operator reaches for when paper comes out
 * blank, surfaced where printing actually happens rather than buried in
 * template editing.
 *
 * Three fields, matching the reference model (Chrysanth Cheque Writer's Printer
 * options tab): Orientation, Cheque Feed, Paper Feed Path. The feed path
 * computes a starting offset so nobody has to guess millimetres; the offsets
 * stay editable afterwards and are what actually render.
 *
 * Saving is open to Accounting as well as Admin — the person holding the paper
 * is the one who needs to change this.
 */

import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client.js';
import Icon from '../Icon.jsx';
import {
  ORIENTATIONS, PAPER_MODES, FEED_PATHS, PAPER_SIZES_MM,
  feedPathOffsets, sheetWidthMm,
} from '../../lib/printOptions.js';

/** Required wording — shown at all times, in both feed modes. */
const HELP_LINE =
  'If nothing is printed on the cheque, change Cheque Feed to Follow Paper Feed and select matching Paper Feed Path.';

export default function PrintOptionsPanel({ template, onSaved, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [savedAt, setSavedAt] = useState(null);

  useEffect(() => {
    if (!template) return;
    setForm({
      orientation: template.orientation,
      paperMode: template.paperMode,
      paperSize: template.paperSize,
      feedPath: template.feedPath || 'center',
      feedOffsetXMm: template.feedOffsetXMm,
      feedOffsetYMm: template.feedOffsetYMm,
    });
    setError(null);
  }, [template]);

  const preset = useMemo(
    () => (form && template
      ? feedPathOffsets({
          paperSize: form.paperSize,
          orientation: form.orientation,
          checkWidthMm: template.checkWidthMm,
          feedPath: form.feedPath,
        })
      : { x: 0, y: 0 }),
    [form, template],
  );

  if (!template || !form) return null;

  const isFeed = form.paperMode === 'feed';
  // True when the operator has nudged the offset away from the preset.
  const adjusted = isFeed && Math.abs(Number(form.feedOffsetXMm) - preset.x) > 0.05;

  const set = (key) => (value) => {
    setForm((c) => {
      const next = { ...c, [key]: value };
      // Changing anything the preset depends on re-seeds the offset.
      if (['feedPath', 'paperSize', 'orientation'].includes(key)) {
        next.feedOffsetXMm = feedPathOffsets({
          paperSize: next.paperSize,
          orientation: next.orientation,
          checkWidthMm: template.checkWidthMm,
          feedPath: next.feedPath,
        }).x;
      }
      return next;
    });
    setSavedAt(null);
  };

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const data = await api.patch(`/templates/${template.id}/print-options`, {
        orientation: form.orientation,
        paperMode: form.paperMode,
        paperSize: form.paperSize,
        feedPath: form.feedPath,
        feedOffsetXMm: Number(form.feedOffsetXMm),
        feedOffsetYMm: Number(form.feedOffsetYMm),
      });
      setSavedAt(Date.now());
      onSaved?.(data.template);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="printopts">
      <button
        type="button"
        className="printopts__toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <Icon name="print_connect" size={19} />
        <span className="printopts__title">
          Print Options
          <span className="subtle">
            {template.name} · {isFeed
              ? `Follow paper feed · ${form.paperSize} ${form.orientation} · ${
                  FEED_PATHS.find((f) => f.value === form.feedPath)?.label
                }`
              : 'Default feed · cheque-sized page'}
          </span>
        </span>
        <Icon name={open ? 'expand_less' : 'expand_more'} size={20} />
      </button>

      {open && (
        <div className="printopts__body">
          {error && (
            <div className="alert alert--danger" role="alert">
              <Icon name="error" size={18} /><span>{error}</span>
            </div>
          )}

          <div className="field">
            <span className="field__label">Orientation</span>
            <div className="segmented segmented--wide">
              {ORIENTATIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  className={form.orientation === o.value ? 'is-active' : ''}
                  onClick={() => set('orientation')(o.value)}
                  disabled={saving}
                  aria-pressed={form.orientation === o.value}
                >
                  <Icon name={o.icon} size={17} />{o.label}
                </button>
              ))}
            </div>
            {!isFeed && (
              <span className="field__hint">
                Not used with the Default feed — the page is the cheque, so its
                own dimensions decide the orientation.
              </span>
            )}
          </div>

          <div className="field">
            <span className="field__label">Cheque Feed</span>
            <div className="segmented segmented--wide">
              {PAPER_MODES.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  className={form.paperMode === m.value ? 'is-active' : ''}
                  onClick={() => set('paperMode')(m.value)}
                  disabled={saving}
                  aria-pressed={form.paperMode === m.value}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <span className="field__hint">
              {PAPER_MODES.find((m) => m.value === form.paperMode)?.hint}
            </span>
          </div>

          <div className="field">
            <span className="field__label">
              Paper Feed Path
              {!isFeed && <span className="subtle"> — needs Follow Paper Feed</span>}
            </span>
            <div className="segmented segmented--wide">
              {FEED_PATHS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  className={form.feedPath === f.value ? 'is-active' : ''}
                  onClick={() => set('feedPath')(f.value)}
                  disabled={saving || !isFeed}
                  aria-pressed={form.feedPath === f.value}
                >
                  <Icon name={f.icon} size={17} />{f.label}
                </button>
              ))}
            </div>
            {isFeed && (
              <span className="field__hint">
                Match the guide you loaded the cheque against. Sets the starting
                left offset to <strong className="mono">{preset.x} mm</strong> on
                a {sheetWidthMm(form.paperSize, form.orientation)} mm wide sheet.
              </span>
            )}
          </div>

          {isFeed && (
            <>
              <div className="field">
                <label className="field__label" htmlFor="po-size">Sheet size</label>
                <select
                  id="po-size"
                  className="select"
                  value={form.paperSize}
                  onChange={(e) => set('paperSize')(e.target.value)}
                  disabled={saving}
                >
                  {Object.entries(PAPER_SIZES_MM).map(([key, v]) => (
                    <option key={key} value={key}>{v.label}</option>
                  ))}
                </select>
              </div>

              <div className="form-grid">
                <div className="field">
                  <label className="field__label" htmlFor="po-x">
                    Fine-tune left (mm)
                  </label>
                  <input
                    id="po-x"
                    className="input mono"
                    type="number"
                    step="0.5"
                    value={form.feedOffsetXMm}
                    onChange={(e) => set('feedOffsetXMm')(e.target.value)}
                    disabled={saving}
                  />
                </div>
                <div className="field">
                  <label className="field__label" htmlFor="po-y">
                    Fine-tune top (mm)
                  </label>
                  <input
                    id="po-y"
                    className="input mono"
                    type="number"
                    step="0.5"
                    value={form.feedOffsetYMm}
                    onChange={(e) => set('feedOffsetYMm')(e.target.value)}
                    disabled={saving}
                  />
                </div>
              </div>

              {adjusted && (
                <span className="field__hint">
                  <Icon name="tune" size={13} /> Adjusted from the{' '}
                  {FEED_PATHS.find((f) => f.value === form.feedPath)?.label} preset
                  ({preset.x} mm). Re-selecting a path resets it.
                </span>
              )}
            </>
          )}

          {/* Required wording, shown in both feed modes — this is the line an
              operator needs when the page comes out blank. */}
          <p className="printopts__help">
            <Icon name="help" size={16} />
            <span>{HELP_LINE}</span>
          </p>

          <div className="row" style={{ justifyContent: 'space-between' }}>
            <a
              className="btn"
              href={`/api/templates/${template.id}/alignment-sheet.pdf`}
              target="_blank"
              rel="noreferrer"
              title="Print on plain paper and hold it against a real cheque"
            >
              <Icon name="straighten" size={18} />
              Alignment sheet
            </a>
            <button type="button" className="btn btn--primary" onClick={save} disabled={saving}>
              {saving ? <span className="spinner" />
                : <Icon name={savedAt ? 'check' : 'save'} size={18} />}
              {savedAt ? 'Saved' : 'Save print options'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
