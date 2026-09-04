/**
 * Global settings (Sections 3, 4, 9, 11).
 *
 * The amount-in-words preview is rendered by the SERVER, from the values
 * currently in the form — so what the admin sees before saving is produced by
 * the same engine that will print the cheque.
 *
 * Reading is open to everyone (the cheque form needs these values); saving is
 * admin-only and the whole form goes read-only for Accounting.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { useTheme } from '../theme/ThemeProvider.jsx';
import { useToast } from '../components/Toast.jsx';
import Icon from '../components/Icon.jsx';
import QzPrinterPicker from '../components/printers/QzPrinterPicker.jsx';
import { useBranding } from '../branding/BrandingProvider.jsx';

const PREVIEW_DEBOUNCE_MS = 250;

const STYLES = [
  { value: 'US', label: 'US', hint: 'One Hundred Twenty' },
  { value: 'UK', label: 'UK', hint: 'One Hundred And Twenty' },
];

const THEMES = [
  { value: 'light', icon: 'light_mode', label: 'Light' },
  { value: 'dark', icon: 'dark_mode', label: 'Dark' },
  { value: 'system', icon: 'brightness_auto', label: 'System' },
];

export default function Settings() {
  const { isAdmin, qzPrinterName, setPrinter } = useAuth();
  const { refresh: refreshBranding } = useBranding();
  const { preference, setTheme } = useTheme();
  const toast = useToast();

  const [form, setForm] = useState(null);
  const [saved, setSaved] = useState(null);
  const [dateFormats, setDateFormats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  const [savingPrinter, setSavingPrinter] = useState(false);
  const [sampleAmount, setSampleAmount] = useState('1500.75');
  const [preview, setPreview] = useState('');
  const previewId = useRef(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/settings');
      setForm(data.settings);
      setSaved(data.settings);
      setDateFormats(data.dateFormats);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Live phrasing preview from the unsaved values.
  useEffect(() => {
    if (!form) return undefined;
    const timer = setTimeout(async () => {
      const id = previewId.current + 1;
      previewId.current = id;
      try {
        const data = await api.post('/settings/preview-words', {
          amount: sampleAmount,
          style: form.amount_words_style,
          currencyLabel: form.currency_label,
          subunitLabel: form.currency_subunit_label,
        });
        if (previewId.current === id) setPreview(data.preview);
      } catch {
        if (previewId.current === id) setPreview('');
      }
    }, PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [form, sampleAmount]);

  const dirty = useMemo(
    () => Boolean(form && saved) && JSON.stringify(form) !== JSON.stringify(saved),
    [form, saved],
  );

  const set = (key) => (value) => setForm((c) => ({ ...c, [key]: value }));

  async function handleSave() {
    setSaving(true);
    setFieldErrors({});
    try {
      const data = await api.put('/settings', form);
      setForm(data.settings);
      setSaved(data.settings);
      // The company name shows in the sidebar and tab; update them now rather
      // than on the next reload.
      refreshBranding();
      toast.success('Settings saved');
    } catch (err) {
      setFieldErrors(err.body?.errors || {});
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="splash" style={{ minHeight: '40vh' }}>
        <span className="spinner" />
        <span className="muted">Loading settings…</span>
      </div>
    );
  }

  if (error || !form) {
    return (
      <div className="alert alert--danger">
        <Icon name="error" size={18} />
        <span>{error || 'Settings unavailable'}</span>
      </div>
    );
  }

  const numeric = dateFormats.filter((f) => f.kind === 'numeric');
  const word = dateFormats.filter((f) => f.kind === 'word');
  const selectedFormat = dateFormats.find((f) => f.pattern === form.date_format);
  const ro = !isAdmin;

  return (
    <>
      <div className="page__head">
        <div>
          <h1>Settings</h1>
          <p>How amounts and dates are written on every cheque.</p>
        </div>
        {isAdmin && (
          <div className="row">
            <button type="button" className="btn" onClick={() => setForm(saved)} disabled={!dirty || saving}>
              <Icon name="undo" size={18} />
              Revert
            </button>
            <button type="button" className="btn btn--primary" onClick={handleSave} disabled={!dirty || saving}>
              {saving ? <span className="spinner" /> : <Icon name="save" size={18} />}
              Save changes
            </button>
          </div>
        )}
      </div>

      {ro && (
        <div className="alert alert--info" style={{ marginBottom: 'var(--sp-4)' }}>
          <Icon name="lock" size={18} />
          <span>These are shared settings. Only an admin can change them.</span>
        </div>
      )}
      {dirty && (
        <div className="alert alert--warn" style={{ marginBottom: 'var(--sp-4)' }}>
          <Icon name="edit" size={18} />
          <span>Unsaved changes. Nothing applies until you press Save changes.</span>
        </div>
      )}

      <div className="settings">
        {/* ── Company ─────────────────────────────────────────────────────── */}
        <section className="card">
          <div className="card__header">
            <div>
              <h3>Company</h3>
              <p className="muted table__sub">
                Your business name, shown around the app and on exports.
              </p>
            </div>
          </div>
          <div className="card__body stack">
            <div className="field">
              <label className="field__label" htmlFor="s-company">Company name</label>
              <input
                id="s-company"
                className="input"
                value={form.company_name}
                onChange={(e) => set('company_name')(e.target.value)}
                disabled={ro}
                placeholder="e.g. Acme Trading Corporation"
              />
              <span className="field__hint">
                Appears in the sidebar, the browser tab, the sign-in screen,
                Reports and exported files.
              </span>
            </div>
            <div className="alert alert--info">
              <Icon name="info" size={18} />
              <span>
                This does <strong>not</strong> appear on printed cheques. The
                account name there is already printed on the bank&rsquo;s stock.
              </span>
            </div>
          </div>
        </section>

        {/* ── Amount in words ─────────────────────────────────────────────── */}
        <section className="card">
          <div className="card__header">
            <div>
              <h3>Amount in words</h3>
              <p className="muted table__sub">
                Generated automatically for every cheque — never typed by hand.
              </p>
            </div>
          </div>
          <div className="card__body stack">
            <div className="field">
              <span className="field__label">Style</span>
              <div className="segmented segmented--wide">
                {STYLES.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={form.amount_words_style === option.value ? 'is-active' : ''}
                    onClick={() => set('amount_words_style')(option.value)}
                    disabled={ro}
                    aria-pressed={form.amount_words_style === option.value}
                  >
                    <span className="segmented__stack">
                      <strong>{option.label}</strong>
                      <span className="segmented__hint">{option.hint}</span>
                    </span>
                  </button>
                ))}
              </div>
              <span className="field__hint">
                UK inserts “And”; US does not. Applies to every cheque written
                from now on.
              </span>
            </div>

            <div className="form-grid">
              <div className="field">
                <label className="field__label" htmlFor="s-currency">Currency word</label>
                <input
                  id="s-currency"
                  className={`input${fieldErrors.currency_label ? ' is-invalid' : ''}`}
                  value={form.currency_label}
                  onChange={(e) => set('currency_label')(e.target.value)}
                  disabled={ro}
                  placeholder="Pesos"
                />
                {fieldErrors.currency_label && (
                  <span className="field__error">
                    <Icon name="error" size={13} /> {fieldErrors.currency_label}
                  </span>
                )}
              </div>

              <div className="field">
                <label className="field__label" htmlFor="s-subunit">Sub-unit word</label>
                <input
                  id="s-subunit"
                  className={`input${fieldErrors.currency_subunit_label ? ' is-invalid' : ''}`}
                  value={form.currency_subunit_label}
                  onChange={(e) => set('currency_subunit_label')(e.target.value)}
                  disabled={ro}
                  placeholder="Centavos"
                />
                {fieldErrors.currency_subunit_label && (
                  <span className="field__error">
                    <Icon name="error" size={13} /> {fieldErrors.currency_subunit_label}
                  </span>
                )}
              </div>
            </div>

            <div className="preview-box">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="pv__label">Preview</span>
                <input
                  className="input mono preview-box__amount"
                  value={sampleAmount}
                  onChange={(e) => setSampleAmount(e.target.value)}
                  aria-label="Sample amount for the preview"
                />
              </div>
              <p className="preview-box__text">
                {preview || <span className="subtle">…</span>}
              </p>
              <span className="field__hint">
                Rendered by the server, using the same function that writes the
                cheque.
              </span>
            </div>
          </div>
        </section>

        {/* ── Dates ───────────────────────────────────────────────────────── */}
        <section className="card">
          <div className="card__header">
            <div>
              <h3>Date format</h3>
              <p className="muted table__sub">
                Used for the plain date field. Templates with pre-printed digit
                boxes carry their own order.
              </p>
            </div>
          </div>
          <div className="card__body stack">
            <div className="field">
              <label className="field__label" htmlFor="s-date">Format</label>
              <select
                id="s-date"
                className="select"
                value={form.date_format}
                onChange={(e) => set('date_format')(e.target.value)}
                disabled={ro}
              >
                <optgroup label="Numeric">
                  {numeric.map((f) => (
                    <option key={f.pattern} value={f.pattern}>
                      {f.pattern} — {f.example}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="With month names">
                  {word.map((f) => (
                    <option key={f.pattern} value={f.pattern}>
                      {f.pattern} — {f.example}
                    </option>
                  ))}
                </optgroup>
              </select>
              <span className="field__hint">
                {dateFormats.length} formats, generated from tokens rather than
                hardcoded.
              </span>
            </div>

            <div className="preview-box">
              <span className="pv__label">Preview</span>
              <p className="preview-box__text mono">
                {selectedFormat?.example || '—'}
              </p>
            </div>
          </div>
        </section>

        {/* ── Printing & safety ───────────────────────────────────────────── */}
        <section className="card">
          <div className="card__header">
            <div>
              <h3>Printing &amp; safety</h3>
              <p className="muted table__sub">Duplicate and reprint protection.</p>
            </div>
          </div>
          <div className="card__body stack">
            <div className="field">
              <label className="field__label" htmlFor="s-dupe">
                Warn about similar cheques within
              </label>
              <div className="row">
                <input
                  id="s-dupe"
                  className={`input mono${fieldErrors.duplicate_warning_days ? ' is-invalid' : ''}`}
                  type="number"
                  min="0"
                  max="365"
                  style={{ maxWidth: 110 }}
                  value={form.duplicate_warning_days}
                  onChange={(e) => set('duplicate_warning_days')(Number(e.target.value))}
                  disabled={ro}
                />
                <span className="muted">days</span>
              </div>
              <span className={fieldErrors.duplicate_warning_days ? 'field__error' : 'field__hint'}>
                {fieldErrors.duplicate_warning_days || (
                  form.duplicate_warning_days === 0
                    ? 'Set to 0 — duplicate warnings are off.'
                    : 'Same payee, same amount, a date within this window.'
                )}
              </span>
            </div>

            <label className="check">
              <input
                type="checkbox"
                checked={form.allow_reprint}
                onChange={(e) => set('allow_reprint')(e.target.checked)}
                disabled={ro}
              />
              Allow a cheque to be printed more than once
            </label>

            <label className="check">
              <input
                type="checkbox"
                checked={form.require_reprint_reason}
                onChange={(e) => set('require_reprint_reason')(e.target.checked)}
                disabled={ro || !form.allow_reprint}
              />
              Require a written reason for a reprint
            </label>
            <span className="field__hint">
              Reprints are always recorded in the audit trail either way.
            </span>
          </div>
        </section>

        {/* ── My printer ──────────────────────────────────────────────────── */}
        {/* Personal, not shared: everything else on this page applies to the
            whole office, but where your paper comes out depends on your desk. */}
        <section className="card">
          <div className="card__header">
            <div>
              <h3>My printer</h3>
              <p className="muted table__sub">
                Yours alone — other people keep their own. Cheque layout still
                comes from the bank template&rsquo;s printer profile.
              </p>
            </div>
            <span className="badge">This account</span>
          </div>
          <div className="card__body stack">
            <QzPrinterPicker
              value={qzPrinterName}
              disabled={savingPrinter}
              onChange={async (name) => {
                setSavingPrinter(true);
                try {
                  await setPrinter(name);
                  toast.success(name
                    ? `Your cheques will print to ${name}`
                    : 'Printing is unavailable until you choose a printer');
                } catch (err) {
                  toast.error(err.message);
                } finally {
                  setSavingPrinter(false);
                }
              }}
            />
            <p className="field__hint">
              <Icon name="info" size={13} /> Set this on the computer you actually
              print from — the list comes from that machine&rsquo;s QZ Tray.
            </p>
          </div>
        </section>

        {/* ── Appearance ──────────────────────────────────────────────────── */}
        <section className="card">
          <div className="card__header">
            <div>
              <h3>Appearance</h3>
              <p className="muted table__sub">Your own theme, and the one new accounts start on.</p>
            </div>
          </div>
          <div className="card__body stack">
            <div className="field">
              <span className="field__label">Your theme</span>
              <div className="segmented segmented--wide">
                {THEMES.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={preference === option.value ? 'is-active' : ''}
                    onClick={() => setTheme(option.value)}
                    aria-pressed={preference === option.value}
                  >
                    <Icon name={option.icon} size={17} />
                    {option.label}
                  </button>
                ))}
              </div>
              <span className="field__hint">
                Saved against your account, so it follows you to another machine.
                Applies immediately — no need to press Save.
              </span>
            </div>

            <div className="field">
              <span className="field__label">Default for new accounts</span>
              <div className="segmented segmented--wide">
                {THEMES.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={form.default_theme === option.value ? 'is-active' : ''}
                    onClick={() => set('default_theme')(option.value)}
                    disabled={ro}
                    aria-pressed={form.default_theme === option.value}
                  >
                    <Icon name={option.icon} size={17} />
                    {option.label}
                  </button>
                ))}
              </div>
              <span className="field__hint">
                Only affects accounts created from now on — nobody’s existing
                choice is overwritten.
              </span>
            </div>


          </div>
        </section>
      </div>
    </>
  );
}
