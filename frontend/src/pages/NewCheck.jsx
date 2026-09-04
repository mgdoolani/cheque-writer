/**
 * Write a cheque (Section 2b).
 *
 * The amount in words and the formatted date are NOT computed here. They come
 * from POST /api/checks/preview, which runs the same function the create route
 * uses — so the words in the preview panel are byte-for-byte the words that
 * will be stored and printed.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { useToast } from '../components/Toast.jsx';
import Icon from '../components/Icon.jsx';
import AmountInput from '../components/checks/AmountInput.jsx';
import PayeePicker from '../components/checks/PayeePicker.jsx';
import PrintDialog from '../components/checks/PrintDialog.jsx';
import DuplicateDialog from '../components/checks/DuplicateDialog.jsx';
import { parseAmount } from '../lib/money.js';

const PREVIEW_DEBOUNCE_MS = 220;

const MARKINGS = [
  { value: 'none', icon: 'block', label: 'None' },
  { value: 'crossed', icon: 'call_split', label: 'Crossed cheque' },
  { value: 'account_payee', icon: 'account_balance', label: 'Account payee only' },
];

const today = () => new Date().toISOString().slice(0, 10);

const BLANK = {
  payeeName: '',
  payeeId: null,
  amount: '',
  checkDate: today(),
  checkNumber: '',
  memo: '',
  marking: 'none',
  templateId: '',
};

export default function NewCheck() {
  const navigate = useNavigate();
  const toast = useToast();

  const [form, setForm] = useState(BLANK);
  const [payees, setPayees] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [created, setCreated] = useState(null);
  // Populated when the server answers 409 with look-alike cheques.
  const [pendingDuplicates, setPendingDuplicates] = useState(null);

  const previewId = useRef(0);

  // Reference data.
  useEffect(() => {
    Promise.all([api.get('/payees'), api.get('/templates')])
      .then(([payeeData, templateData]) => {
        setPayees(payeeData.payees);
        setTemplates(templateData.templates);
        const fallback =
          templateData.templates.find((t) => t.isDefault) || templateData.templates[0];
        if (fallback) setForm((c) => ({ ...c, templateId: String(fallback.id) }));
      })
      .catch((err) => setError(err.message));
  }, []);

  // Debounced live preview — words, date text and duplicate look-alikes.
  const refreshPreview = useCallback(async (values) => {
    const id = previewId.current + 1;
    previewId.current = id;

    if (!values.payeeName.trim() || !values.amount || !values.checkDate) {
      setPreview(null);
      return;
    }

    setPreviewing(true);
    try {
      const data = await api.post('/checks/preview', {
        payeeName: values.payeeName,
        amount: values.amount,
        checkDate: values.checkDate,
        checkNumber: values.checkNumber,
        marking: values.marking,
      });
      if (previewId.current === id) setPreview(data);
    } catch {
      if (previewId.current === id) setPreview(null);
    } finally {
      if (previewId.current === id) setPreviewing(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => refreshPreview(form), PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [form, refreshPreview]);

  const set = (key) => (event) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  const amountValue = parseAmount(form.amount);
  const amountValid = Number.isFinite(amountValue) && amountValue > 0;
  const canSubmit =
    Boolean(form.payeeName.trim()) && amountValid && Boolean(form.checkDate) && !saving;

  async function submit(confirmDuplicate = false) {
    setSaving(true);
    setError(null);

    try {
      const data = await api.post('/checks', {
        payeeName: form.payeeName.trim(),
        payeeId: form.payeeId,
        amount: form.amount,
        checkDate: form.checkDate,
        checkNumber: form.checkNumber.trim(),
        memo: form.memo.trim(),
        marking: form.marking,
        templateId: form.templateId || null,
        confirmDuplicate,
      });
      setCreated(data.check);
      toast.success('Cheque saved — review it before printing');
    } catch (err) {
      if (err.status === 409 && err.body?.requiresConfirmation) {
        // Hand the look-alikes to a dialog the user can actually read.
        setPendingDuplicates(err.body.duplicates || []);
      } else {
        setError(err.message);
      }
    } finally {
      // MUST be in `finally`. It used to live only in the catch block, so a
      // successful save left `saving` stuck at true — every input is
      // disabled={saving}, so the form froze until a hard refresh.
      setSaving(false);
    }
    return undefined;
  }

  /**
   * Return the screen to a clean, usable state. Resets every transient flag,
   * not just the visible ones — leaving one behind is what froze the form.
   */
  function startAnother() {
    setCreated(null);
    setPreview(null);
    setPendingDuplicates(null);
    setError(null);
    setSaving(false);
    setPreviewing(false);
    // Abandon any in-flight preview so a late response cannot repopulate the
    // panel for the cheque that was just cleared.
    previewId.current += 1;
    setForm((current) => ({ ...BLANK, templateId: current.templateId, checkDate: current.checkDate }));
  }

  const duplicates = preview?.duplicates || [];

  return (
    <>
      <div className="page__head">
        <div>
          <h1>New Cheque</h1>
          <p>The amount in words and the date are filled in for you.</p>
        </div>
      </div>

      {error && (
        <div className="alert alert--danger" role="alert" style={{ marginBottom: 'var(--sp-4)' }}>
          <Icon name="error" size={18} />
          <span>{error}</span>
        </div>
      )}

      <div className="chequeform">
        <div className="card">
          <div className="card__body stack">
            <div className="form-grid">
              <div className="field field--full">
                <label className="field__label" htmlFor="c-payee">
                  Pay to the order of <span className="req">required</span>
                </label>
                <PayeePicker
                  id="c-payee"
                  value={form.payeeName}
                  payeeId={form.payeeId}
                  payees={payees}
                  disabled={saving}
                  onChange={(payeeName, payeeId) =>
                    setForm((c) => ({ ...c, payeeName, payeeId }))
                  }
                />
              </div>

              <div className="field">
                <label className="field__label" htmlFor="c-amount">
                  Amount <span className="req">required</span>
                </label>
                <AmountInput
                  id="c-amount"
                  value={form.amount}
                  disabled={saving}
                  invalid={Boolean(form.amount) && !amountValid}
                  onChange={(amount) => setForm((c) => ({ ...c, amount }))}
                />
                <span className="field__hint" id="c-amount-hint">
                  Grouped with commas as you type.
                </span>
              </div>

              <div className="field">
                <label className="field__label" htmlFor="c-date">
                  Date <span className="req">required</span>
                </label>
                <input
                  id="c-date"
                  className="input"
                  type="date"
                  value={form.checkDate}
                  onChange={set('checkDate')}
                  disabled={saving}
                />
                <span className="field__hint">
                  {preview?.dateText ? (
                    <>Prints as <strong className="mono">{preview.dateText}</strong></>
                  ) : (
                    'Uses the format set in Settings.'
                  )}
                </span>
              </div>

              <div className="field">
                <label className="field__label" htmlFor="c-number">Cheque number</label>
                <input
                  id="c-number"
                  className={`input mono${preview?.numberTaken ? ' is-invalid' : ''}`}
                  value={form.checkNumber}
                  onChange={set('checkNumber')}
                  disabled={saving}
                  placeholder="Optional"
                />
                <span className={preview?.numberTaken ? 'field__error' : 'field__hint'}>
                  {preview?.numberTaken ? (
                    <>
                      <Icon name="error" size={13} /> Already recorded on another cheque
                    </>
                  ) : (
                    'For your records only — never printed.'
                  )}
                </span>
              </div>

              <div className="field">
                <label className="field__label" htmlFor="c-template">Bank template</label>
                <select
                  id="c-template"
                  className="select"
                  value={form.templateId}
                  onChange={set('templateId')}
                  disabled={saving}
                >
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}{t.isDefault ? ' (default)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field field--full">
                <span className="field__label">Marking</span>
                <div className="segmented segmented--wide">
                  {MARKINGS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={form.marking === option.value ? 'is-active' : ''}
                      onClick={() => setForm((c) => ({ ...c, marking: option.value }))}
                      disabled={saving}
                      aria-pressed={form.marking === option.value}
                    >
                      <Icon name={option.icon} size={17} />
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="field field--full">
                <label className="field__label" htmlFor="c-memo">Memo / purpose</label>
                <input
                  id="c-memo"
                  className="input"
                  value={form.memo}
                  onChange={set('memo')}
                  disabled={saving}
                  placeholder="Optional"
                />
              </div>
            </div>

            {duplicates.length > 0 && (
              <div className="alert alert--warn">
                <Icon name="warning" size={18} />
                <span>
                  <strong>
                    {duplicates.length} similar cheque{duplicates.length === 1 ? '' : 's'} already
                    on file.
                  </strong>
                  <ul className="dupelist">
                    {duplicates.map((d) => (
                      <li key={d.id}>
                        #{d.id} · {d.payeeName} · {Number(d.amount).toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                        })} · {d.checkDate} · {d.status}
                        {d.printCount > 0 ? ` (printed ${d.printCount}×)` : ''}
                      </li>
                    ))}
                  </ul>
                  You will be asked to confirm before this one is written.
                </span>
              </div>
            )}

            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={startAnother} disabled={saving}>
                Clear
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => submit(false)}
                disabled={!canSubmit}
              >
                {saving ? <span className="spinner" /> : <Icon name="visibility" size={18} />}
                Save &amp; preview
              </button>
            </div>
          </div>
        </div>

        {/* Live preview of exactly what will be written. */}
        <aside className="card preview-card">
          <div className="card__header">
            <h3>As it will print</h3>
            {previewing && <span className="spinner" />}
          </div>
          <div className="card__body stack">
            <div className="pv">
              <span className="pv__label">Pay</span>
              <span className="pv__value">
                {form.payeeName.trim() || <span className="subtle">—</span>}
              </span>
            </div>

            <div className="pv">
              <span className="pv__label">Amount in words</span>
              <span className="pv__value pv__words">
                {preview?.amountWords || <span className="subtle">—</span>}
              </span>
            </div>

            <div className="pv">
              <span className="pv__label">Figures</span>
              <span className="pv__value mono">
                {preview?.amountFormatted || <span className="subtle">—</span>}
              </span>
            </div>

            <div className="pv">
              <span className="pv__label">Date</span>
              <span className="pv__value mono">
                {preview?.dateText || <span className="subtle">—</span>}
              </span>
            </div>

            {form.marking !== 'none' && (
              <div className="pv">
                <span className="pv__label">Marking</span>
                <span className="pv__value">
                  {MARKINGS.find((m) => m.value === form.marking)?.label}
                </span>
              </div>
            )}

            {preview?.settings && (
              <p className="field__hint">
                <Icon name="settings" size={13} /> {preview.settings.amountWordsStyle} style ·{' '}
                {preview.settings.currencyLabel} · {preview.settings.dateFormat}
              </p>
            )}
          </div>
        </aside>
      </div>

      <DuplicateDialog
        open={Boolean(pendingDuplicates)}
        duplicates={pendingDuplicates || []}
        working={saving}
        onCancel={() => setPendingDuplicates(null)}
        onConfirm={() => {
          setPendingDuplicates(null);
          submit(true);
        }}
      />

      <PrintDialog
        check={created}
        template={templates.find((t) => String(t.id) === String(form.templateId)) || null}
        onTemplateChanged={(updated) =>
          setTemplates((current) =>
            current.map((t) => (t.id === updated.id ? updated : t)),
          )}
        onClose={() => setCreated(null)}
        onPrinted={() => {
          startAnother();
          toast.success('Cheque marked as printed');
        }}
        onViewRegister={() => navigate('/cheques')}
      />
    </>
  );
}
