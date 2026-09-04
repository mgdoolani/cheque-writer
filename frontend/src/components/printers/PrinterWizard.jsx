/**
 * Printer Setup Wizard.
 *
 * Sheet size and feed offsets belong to the PRINTER, not the bank. Setting them
 * up once here means each bank template just picks "Office Epson L5390" rather
 * than re-entering the same numbers — and nobody is tempted to inflate a
 * cheque's height to satisfy a printer minimum, which silently moves every
 * field on the layout.
 *
 * The wizard asks plain questions and prints a test sheet. No millimetre maths
 * is required to get a working setup.
 */

import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import Icon from '../Icon.jsx';
import Modal from '../Modal.jsx';
import { FeedDirectionDiagram, OrientationDiagram, FeedPathDiagram } from './Diagrams.jsx';
import QzPrinterPicker from './QzPrinterPicker.jsx';
import useQzTray from '../../hooks/useQzTray.js';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { printPdf, blobToBase64 } from '../../lib/qzTray.js';

const STEPS = ['Printer', 'Paper', 'Position', 'Test', 'Done'];

// Centre is the answer for almost everyone. Left/Right are kept, but behind a
// disclosure: they only shift anything when the page is wider than the cheque,
// and otherwise the printer's own tray guides decide.
const PRIMARY_FEED_PATH = {
  value: 'center', label: 'Middle of the tray',
  hint: 'Against the centre guides. This is what almost every printer does.',
};

const ADVANCED_FEED_PATHS = [
  { value: 'left', label: 'Left edge', hint: 'Pushed to the left side of the tray.' },
  { value: 'right', label: 'Right edge', hint: 'Pushed to the right side of the tray.' },
];

const ALL_FEED_PATHS = [PRIMARY_FEED_PATH, ...ADVANCED_FEED_PATHS];

const ROTATIONS = [
  { value: 0, label: '0°', hint: 'Normal' },
  { value: 90, label: '90°', hint: 'Quarter turn' },
  { value: 180, label: '180°', hint: 'Upside down' },
  { value: 270, label: '270°', hint: 'Three-quarter turn' },
];

/**
 * Runs in two modes:
 *   create — the full question flow for a printer nobody has set up.
 *   edit   — jumps straight to calibration with an existing profile's values,
 *            saving back to that same profile. Recalibrating is a routine job
 *            and should not read as "set up a new printer".
 */
export default function PrinterWizard({ open, onClose, onFinished, editing = null }) {
  const [step, setStep] = useState(0);
  const [catalogue, setCatalogue] = useState(null);
  const [templates, setTemplates] = useState([]);

  const [modelId, setModelId] = useState(null);
  const [heightAnswer, setHeightAnswer] = useState('');
  const [name, setName] = useState('');
  const [feedPath, setFeedPath] = useState('center');
  const [nudgeX, setNudgeX] = useState(0);
  const [nudgeY, setNudgeY] = useState(0);
  const [rotation, setRotation] = useState(0);
  const [showAdvancedFeed, setShowAdvancedFeed] = useState(false);
  const [templateId, setTemplateId] = useState('');


  const [profile, setProfile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [printedOnce, setPrintedOnce] = useState(false);
  const [qzPrinter, setQzPrinter] = useState('');
  const [workstation, setWorkstation] = useState('');
  const [testRoute, setTestRoute] = useState(null);

  const qz = useQzTray({ auto: open });
  const { qzPrinterName, setPrinter } = useAuth();
  // Calibrate through the same pipeline real cheques use, or the calibration
  // proves nothing about the pipeline that actually prints.
  const testGoesDirect = qz.available && Boolean(qzPrinter);

  useEffect(() => {
    if (!open) return;

    if (editing) {
      // Pre-fill from the profile and skip to the calibration screen.
      setStep(3);
      setProfile(editing);
      setModelId(null);
      setHeightAnswer(String(editing.minPageHeightMm ?? ''));
      setName(editing.name);
      setFeedPath(editing.feedPath || 'center');
      setRotation(editing.rotation || 0);
      setNudgeX(editing.offsetXMm || 0);
      setNudgeY(editing.offsetYMm || 0);
      setShowAdvancedFeed(editing.feedPath !== 'center');
      setWorkstation(editing.workstation || '');
    } else {
      setStep(0); setModelId(null); setHeightAnswer(''); setName('');
      setFeedPath('center'); setNudgeX(0); setNudgeY(0); setProfile(null);
      setRotation(0); setShowAdvancedFeed(false);
      setWorkstation('');
    }
    setQzPrinter(qzPrinterName || ''); setTestRoute(null);
    setError(null); setPrintedOnce(false);

    setError(null);
    api.get('/printers/catalogue').then(setCatalogue).catch((e) => setError(e.message));
    api.get('/templates').then((d) => {
      setTemplates(d.templates);
      const first = d.templates.find((t) => t.isDefault) || d.templates[0];
      if (first) setTemplateId(String(first.id));
    }).catch(() => {});
  }, [open, editing, qzPrinterName]);

  if (!open) return null;

  const model = modelId === 'other'
    ? catalogue?.other
    : catalogue?.models.find((m) => m.id === modelId);
  const isOther = modelId === 'other';

  // Height comes from the catalogue, or from the operator's own observation.
  const heightMm = editing
    ? Number(heightAnswer)
    : isOther ? Number(heightAnswer) : model?.minPageHeightMm ?? null;
  const heightKnown = Number.isFinite(heightMm) && heightMm >= 0;

  async function createProfile() {
    setBusy(true); setError(null);
    try {
      const data = await api.post('/printers', {
        name: name.trim() || model?.label || 'My printer',
        model: model?.label || '',
        minPageHeightMm: heightMm,
        feedPath,
        rotation,
        workstation: workstation.trim(),
      });
      setProfile(data.printer);
      setStep(3);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  /**
   * Print the calibration sheet down the SAME path a real cheque takes.
   *
   * Calibrating through anything other than the pipeline cheques actually use
   * would tune the offsets against the wrong thing, so this goes to the same
   * printer, through the same QZ config, as a real cheque.
   */
  async function printTest() {
    setError(null);

    if (!testGoesDirect) {
      setError(
        qz.available
          ? 'Choose your printer above before printing the test sheet.'
          : 'QZ Tray is not running on this computer, so nothing can be printed. ' +
            'Start QZ Tray and press Check again.',
      );
      return;
    }

    const params = new URLSearchParams({
      templateId, feedPath,
      offsetXMm: String(nudgeX), offsetYMm: String(nudgeY),
      rotation: String(rotation),
    });

    setBusy(true);
    try {
      const response = await fetch(
        `/api/printers/${profile.id}/alignment-sheet.pdf?${params}`,
        { credentials: 'same-origin' },
      );
      if (!response.ok) throw new Error('Could not build the test sheet');

      await printPdf({
        printerName: qzPrinter,
        base64: await blobToBase64(await response.blob()),
        pageWidthMm: chosenTemplate ? chosenTemplate.checkWidthMm : 178,
        pageHeightMm: pageHeight || 127,
        // Sizing only — the PDF's own /Rotate does the rotating.
        rotation,
        jobName: `Alignment — ${name || profile.name}`,
      });

      setTestRoute('qz');
      setPrintedOnce(true);
    } catch (err) {
      setError(`Could not print the test sheet: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    setBusy(true); setError(null);
    try {
      const saved = await api.put(`/printers/${profile.id}`, {
        name: name.trim() || profile.name,
        minPageHeightMm: heightMm,
        feedPath,
        rotation,
        offsetXMm: nudgeX,
        offsetYMm: nudgeY,
        calibratedOnPrinter: qzPrinter,
        workstation: workstation.trim(),
      });
      setProfile(saved.printer);
      setStep(4);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  const nudge = (dx, dy) => {
    setNudgeX((v) => Math.round((v + dx) * 10) / 10);
    setNudgeY((v) => Math.round((v + dy) * 10) / 10);
    setPrintedOnce(false);
    setTestRoute(null);
  };

  const chosenTemplate = templates.find((t) => String(t.id) === String(templateId));
  const pageHeight = chosenTemplate
    ? Math.max(chosenTemplate.checkHeightMm, heightKnown ? heightMm : 0)
    : null;

  return (
    <Modal
      open
      onClose={busy ? undefined : onClose}
      dismissible={!busy}
      title={editing ? `Calibrate ${editing.name}` : 'Set up a printer'}
      description={editing
        ? 'Print a test sheet and nudge until it lines up. Saves back to this profile.'
        : 'Answer a few questions once, then every bank template can use it.'}
      width={640}
    >
      <div className="wizard">
        <ol className="wizard__steps">
          {STEPS.map((label, i) => (
            <li key={label} className={i === step ? 'is-current' : i < step ? 'is-done' : ''}>
              <span className="wizard__dot">
                {i < step ? <Icon name="check" size={13} /> : i + 1}
              </span>
              {label}
            </li>
          ))}
        </ol>

        {error && (
          <div className="alert alert--danger" role="alert">
            <Icon name="error" size={18} /><span>{error}</span>
          </div>
        )}

        {/* ── 1. Which printer ────────────────────────────────────────────── */}
        {step === 0 && (
          <div className="stack">
            <h3>What&rsquo;s your printer?</h3>
            <p className="muted">
              Pick the closest match. This fills in the paper size for you.
            </p>
            <div className="modelpick">
              {(catalogue?.models || []).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={`modelpick__item${modelId === m.id ? ' is-active' : ''}`}
                  onClick={() => setModelId(m.id)}
                >
                  <Icon name="print" size={18} />
                  <span>
                    <strong>{m.label}</strong>
                    <span className="muted">{m.examples}</span>
                  </span>
                </button>
              ))}
              <button
                type="button"
                className={`modelpick__item${modelId === 'other' ? ' is-active' : ''}`}
                onClick={() => setModelId('other')}
              >
                <Icon name="help" size={18} />
                <span>
                  <strong>{catalogue?.other.label}</strong>
                  <span className="muted">{catalogue?.other.examples}</span>
                </span>
              </button>
            </div>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn--primary" disabled={!modelId}
                onClick={() => setStep(1)}>
                Next <Icon name="chevron_right" size={18} />
              </button>
            </div>
          </div>
        )}

        {/* ── 2. Paper height ─────────────────────────────────────────────── */}
        {step === 1 && (
          <div className="stack">
            <h3>Paper size</h3>

            {isOther ? (
              <>
                <p className="wizard__question">{catalogue?.heightDiscovery.question}</p>
                <p className="field__hint">{catalogue?.heightDiscovery.hint}</p>
                <div className="field" style={{ maxWidth: 220 }}>
                  <label className="field__label" htmlFor="wz-h">
                    It changed to (mm)
                  </label>
                  <input
                    id="wz-h"
                    className="input mono"
                    type="number"
                    step="1"
                    min="0"
                    value={heightAnswer}
                    onChange={(e) => setHeightAnswer(e.target.value)}
                    placeholder="127"
                    /* eslint-disable-next-line jsx-a11y/no-autofocus -- the one question on this step */
                    autoFocus
                  />
                </div>
              </>
            ) : (
              <>
                <div className="alert alert--info">
                  <Icon name="info" size={18} />
                  <span>
                    {model?.minPageHeightMm > 0 ? (
                      <>
                        A <strong>{model?.label}</strong> usually refuses a page
                        shorter than <strong>{model?.minPageHeightMm} mm</strong>,
                        so cheques are printed on a page padded up to that. The
                        cheque itself is not resized.
                      </>
                    ) : (
                      <>
                        A <strong>{model?.label}</strong> accepts the cheque at its
                        own size — no padding needed.
                      </>
                    )}
                  </span>
                </div>
                <p className="field__hint">
                  This is a typical figure for that family, not a lookup of your
                  exact model. The test print in a moment will confirm it — or
                  go back and choose &ldquo;Other&rdquo; to enter your own.
                </p>
              </>
            )}

            <div className="row" style={{ justifyContent: 'space-between' }}>
              <button type="button" className="btn" onClick={() => setStep(0)}>
                <Icon name="chevron_left" size={18} /> Back
              </button>
              <button type="button" className="btn btn--primary" disabled={!heightKnown}
                onClick={() => setStep(2)}>
                Next <Icon name="chevron_right" size={18} />
              </button>
            </div>
          </div>
        )}

        {/* ── 3. How the cheque goes in ───────────────────────────────────── */}
        {step === 2 && (
          <div className="stack">
            <h3>How does the cheque go in?</h3>

            <div className="diagrow">
              <FeedDirectionDiagram rotation={rotation} />
              <p className="muted">
                The cheque travels into the printer this way. If your test print
                comes out upside down or sideways, change the rotation below.
              </p>
            </div>

            {/* Feed path — Centre is the answer; the rest is behind a link. */}
            <div className="field">
              <span className="field__label">Where in the tray?</span>
              <button
                type="button"
                className={`pathpick${feedPath === 'center' ? ' is-active' : ''}`}
                onClick={() => setFeedPath('center')}
                aria-pressed={feedPath === 'center'}
              >
                <FeedPathDiagram path="center" size={64} />
                <span>
                  <strong>{PRIMARY_FEED_PATH.label}</strong>
                  <span className="muted">{PRIMARY_FEED_PATH.hint}</span>
                </span>
                {feedPath === 'center' && <Icon name="check_circle" size={20} />}
              </button>

              {!showAdvancedFeed && feedPath === 'center' ? (
                <button
                  type="button"
                  className="linkish"
                  onClick={() => setShowAdvancedFeed(true)}
                >
                  My printer feeds from one side instead
                </button>
              ) : (
                <div className="pathpick__advanced">
                  {ADVANCED_FEED_PATHS.map((f) => (
                    <button
                      key={f.value}
                      type="button"
                      className={`pathpick${feedPath === f.value ? ' is-active' : ''}`}
                      onClick={() => setFeedPath(f.value)}
                      aria-pressed={feedPath === f.value}
                    >
                      <FeedPathDiagram path={f.value} size={64} />
                      <span>
                        <strong>{f.label}</strong>
                        <span className="muted">{f.hint}</span>
                      </span>
                      {feedPath === f.value && <Icon name="check_circle" size={20} />}
                    </button>
                  ))}
                  <span className="field__hint">
                    <Icon name="info" size={13} /> These only shift the printing
                    when the page is wider than the cheque. When they are the
                    same width — the usual case — your printer&rsquo;s tray
                    guides decide, and the nudge on the next screen is what
                    corrects any drift.
                  </span>
                </div>
              )}
            </div>

            {/* Print direction — separate from orientation, because feed
                mechanics do not reduce to portrait vs landscape. */}
            <div className="field">
              <span className="field__label">Print direction</span>
              <div className="segmented segmented--wide">
                {ROTATIONS.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    className={rotation === r.value ? 'is-active' : ''}
                    onClick={() => setRotation(r.value)}
                    aria-pressed={rotation === r.value}
                    title={r.hint}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <span className="field__hint">
                Leave this at 0° for now — the test print will show if it needs
                turning. A printer fed logo-first often needs 270°.
              </span>
            </div>

            {/* Illustrative only — shows what the two page shapes mean. */}
            <div className="orientrow">
              {['landscape', 'portrait'].map((o) => (
                <figure key={o}>
                  <OrientationDiagram orientation={o} size={60} />
                  <figcaption className="subtle">
                    {o === 'landscape' ? 'Landscape' : 'Portrait'}
                  </figcaption>
                </figure>
              ))}
              <p className="field__hint" style={{ flex: 1 }}>
                For reference. The page shape is worked out from your cheque
                size and the printer minimum — you don&rsquo;t need to pick one.
              </p>
            </div>

            <div className="field">
              <label className="field__label" htmlFor="wz-where">
                Located at <span className="subtle">(which desk or computer)</span>
              </label>
              <input
                id="wz-where"
                className="input"
                value={workstation}
                onChange={(e) => setWorkstation(e.target.value)}
                placeholder={qz.network?.ipAddress ? `e.g. Front desk (${qz.network.ipAddress})` : 'e.g. Front desk PC'}
              />
              <span className="field__hint">
                Says whose printer this is, separately from whose calibration
                numbers it holds.
                {qz.network?.ipAddress && (
                  <> This computer reports <strong>{qz.network.ipAddress}</strong>.</>
                )}
              </span>
            </div>

            <div className="field">
              <label className="field__label" htmlFor="wz-name">Name this printer</label>
              <input
                id="wz-name"
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={model?.label ? `Office ${model.label}` : 'Office printer'}
              />
              <span className="field__hint">
                Templates will show this name, e.g. &ldquo;Office Epson L5390&rdquo;.
              </span>
            </div>

            <div className="row" style={{ justifyContent: 'space-between' }}>
              <button type="button" className="btn" onClick={() => setStep(1)}>
                <Icon name="chevron_left" size={18} /> Back
              </button>
              <button type="button" className="btn btn--primary" onClick={createProfile} disabled={busy}>
                {busy ? <span className="spinner" /> : <Icon name="chevron_right" size={18} />}
                Print a test sheet
              </button>
            </div>
          </div>
        )}

        {/* ── 4. Test and nudge ───────────────────────────────────────────── */}
        {step === 3 && profile && (
          <div className="stack">
            <h3>Does it line up?</h3>
            <p className="muted">
              Print this on plain paper, then hold it against a real cheque.
            </p>

            <div className="form-grid">
              <div className="field">
                <label className="field__label" htmlFor="wz-tpl">Test against</label>
                <select id="wz-tpl" className="select" value={templateId}
                  onChange={(e) => { setTemplateId(e.target.value); setPrintedOnce(false); }}>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} — {t.checkWidthMm}×{t.checkHeightMm} mm
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <span className="field__label">Page it will send</span>
                <p className="mono" style={{ paddingTop: 8 }}>
                  {chosenTemplate
                    ? `${chosenTemplate.checkWidthMm} × ${pageHeight} mm`
                    : '—'}
                </p>
              </div>
            </div>

            {/* Which printer this calibration goes to. Calibrating through a
                different path than real cheques use would defeat the point. */}
            {/* This writes the signed-in user's own printer, not the profile's:
                the profile describes a printer MODEL, this is the device on
                this desk. Saved immediately so the test print uses it. */}
            <QzPrinterPicker
              value={qzPrinter}
              disabled={busy}
              onChange={async (v) => {
                setQzPrinter(v);
                setPrintedOnce(false);
                setTestRoute(null);
                try {
                  await setPrinter(v);
                } catch (err) {
                  setError(`Could not save your printer: ${err.message}`);
                }
              }}
            />
            <span className="field__hint">
              <Icon name="person" size={13} /> This is <strong>your</strong>
              {' '}printer for this account. Colleagues at other desks set their own.
            </span>

            <div className={`route route--${testGoesDirect ? 'direct' : 'error'}`}>
              <Icon name={testGoesDirect ? 'print_connect' : 'error'} size={18} />
              <span>
                {testGoesDirect
                  ? <>Test sheet goes <strong>straight to {qzPrinter}</strong> — the same
                      path your cheques take.</>
                  : qz.available
                    ? <>Choose your printer above to calibrate.</>
                    : <>QZ Tray isn&rsquo;t running on this computer, so nothing can be
                        printed. Start it and press <strong>Check again</strong>.</>}
              </span>
            </div>

            <button type="button" className="btn btn--primary" onClick={printTest}
              disabled={busy} style={{ width: '100%' }}>
              {busy ? <span className="spinner" /> : <Icon name="print" size={18} />}
              {printedOnce ? 'Print again' : 'Print the test sheet'}
            </button>

            {testRoute === 'qz' && (
              <span className="field__hint">
                <Icon name="check_circle" size={13} /> Sent to {qzPrinter} at actual size.
              </span>
            )}

            {printedOnce && (
              <div className="wizard__verdict">
                <p><strong>Did the boxes land on the right places?</strong></p>
                <div className="row">
                  <button type="button" className="btn btn--primary" onClick={finish} disabled={busy}>
                    {busy ? <span className="spinner" /> : <Icon name="check" size={18} />}
                    Yes — save it
                  </button>
                  <span className="muted">or nudge it below and print again</span>
                </div>
              </div>
            )}

            <div className="nudger">
              <span className="field__label">Print direction</span>
              <div className="segmented segmented--wide" style={{ marginBottom: 'var(--sp-3)' }}>
                {ROTATIONS.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    className={rotation === r.value ? 'is-active' : ''}
                    onClick={() => { setRotation(r.value); setPrintedOnce(false); }}
                    aria-pressed={rotation === r.value}
                    title={r.hint}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <span className="field__label">Nudge the whole cheque</span>
              <div className="nudger__pad">
                <button type="button" onClick={() => nudge(0, -1)} title="Up 1 mm" aria-label="Up 1 millimetre">
                  <Icon name="keyboard_arrow_up" size={20} />
                </button>
                <div className="row">
                  <button type="button" onClick={() => nudge(-1, 0)} title="Left 1 mm" aria-label="Left 1 millimetre">
                    <Icon name="keyboard_arrow_left" size={20} />
                  </button>
                  <span className="nudger__value mono">
                    {nudgeX >= 0 ? '+' : ''}{nudgeX}, {nudgeY >= 0 ? '+' : ''}{nudgeY} mm
                  </span>
                  <button type="button" onClick={() => nudge(1, 0)} title="Right 1 mm" aria-label="Right 1 millimetre">
                    <Icon name="keyboard_arrow_right" size={20} />
                  </button>
                </div>
                <button type="button" onClick={() => nudge(0, 1)} title="Down 1 mm" aria-label="Down 1 millimetre">
                  <Icon name="keyboard_arrow_down" size={20} />
                </button>
              </div>
              <div className="row" style={{ justifyContent: 'center' }}>
                <button type="button" className="btn btn--ghost"
                  onClick={() => { setNudgeX(0); setNudgeY(0); setPrintedOnce(false); }}>
                  Reset to centre
                </button>
              </div>
              <span className="field__hint" style={{ textAlign: 'center' }}>
                Move it the way the print was wrong. Printing too far left? Nudge right.
              </span>
            </div>

          </div>
        )}

        {/* ── 5. Done ─────────────────────────────────────────────────────── */}
        {step === 4 && profile && (
          <div className="stack">
            <div className="alert alert--success">
              <Icon name="check_circle" size={18} />
              <span>
                <strong>{profile.name}</strong> is set up. Page minimum{' '}
                {profile.minPageHeightMm} mm, fed from the{' '}
                {ALL_FEED_PATHS.find((f) => f.value === profile.feedPath)?.label.toLowerCase()},
                rotated {profile.rotation}°, nudged {profile.offsetXMm},{' '}
                {profile.offsetYMm} mm.
                {qzPrinter && <> Your cheques print straight to <strong>{qzPrinter}</strong>.</>}
              </span>
            </div>
            <p className="muted">
              Bank templates can now just pick this printer. Re-run the wizard
              any time the printer or the tray guides change.
            </p>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn--primary"
                onClick={() => { onFinished?.(profile); onClose(); }}>
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
