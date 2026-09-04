/**
 * Printer profiles. Sheet minimums and feed calibration live here, once per
 * printer, instead of being re-entered on every bank template.
 */

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { useToast } from '../components/Toast.jsx';
import Icon from '../components/Icon.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import PrinterWizard from '../components/printers/PrinterWizard.jsx';
import ManageTemplatesDialog from '../components/printers/ManageTemplatesDialog.jsx';
import { FeedDirectionDiagram } from '../components/printers/Diagrams.jsx';
import useQzTray from '../hooks/useQzTray.js';
import { useAuth } from '../auth/AuthProvider.jsx';

const PATH_LABEL = { center: 'Middle', left: 'Left edge', right: 'Right edge' };

export default function Printers() {
  const toast = useToast();
  const [printers, setPrinters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  // Non-null puts the wizard straight into calibration for that profile.
  const [calibrating, setCalibrating] = useState(null);
  const [managing, setManaging] = useState(null);
  const [removing, setRemoving] = useState(null);
  const qz = useQzTray();
  const { qzPrinterName: myPrinter } = useAuth();

  /**
   * A profile is "not available here" when the printer its numbers were taken
   * from is not in this machine's QZ enumeration — the offsets came off a
   * device this computer cannot reach.
   */
  const availability = (p) => {
    if (!qz.available || !p.calibratedOnPrinter) return null;
    return qz.printers.includes(p.calibratedOnPrinter) ? 'here' : 'elsewhere';
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/printers');
      setPrinters(data.printers);
      setError(null);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <>
      <div className="page__head">
        <div>
          <h1>Printers</h1>
          <p>
            Paper size, rotation and alignment for a printer model — set up once
            and shared by every template. Which device your own jobs go to is a
            personal setting in <Link to="/settings">Settings</Link>.
          </p>
        </div>
        <button type="button" className="btn btn--primary" onClick={() => setWizardOpen(true)}>
          <Icon name="print_add" size={18} />
          Set up a printer
        </button>
      </div>

      <div className={`route route--${qz.available ? 'direct' : 'error'}`}
        style={{ marginBottom: 'var(--sp-4)' }}>
        <Icon name={qz.available ? 'check_circle' : 'info'} size={18} />
        <span>
          {qz.checking ? (
            'Looking for QZ Tray…'
          ) : qz.available ? (
            <>
              QZ Tray is running here — <strong>{qz.printers.length}</strong> printer
              {qz.printers.length === 1 ? '' : 's'} available.{' '}
              {myPrinter
                ? <>Your cheques go to <strong>{myPrinter}</strong>.</>
                : <>You haven&rsquo;t chosen your printer yet.</>}{' '}
              <Link to="/settings">Change it in Settings</Link> — it&rsquo;s per
              person, so everyone picks the printer at their own desk.
            </>
          ) : (
            <>
              <strong>QZ Tray isn&rsquo;t running on this computer.</strong>{' '}
              Cheques cannot be printed from here until it is started — install or
              launch QZ Tray on this machine, then press Check again.
            </>
          )}
        </span>
        {!qz.checking && (
          <button type="button" className="btn btn--ghost btn--icon" onClick={qz.refresh}
            title="Check again" aria-label="Check again for QZ Tray">
            <Icon name="refresh" size={17} />
          </button>
        )}
      </div>

      {error && (
        <div className="alert alert--danger" role="alert" style={{ marginBottom: 'var(--sp-4)' }}>
          <Icon name="error" size={18} /><span>{error}</span>
        </div>
      )}

      {printers.length === 0 && !loading ? (
        <div className="card"><div className="card__body">
          <EmptyState
            icon="print"
            title="No printers set up"
            action={
              <button type="button" className="btn btn--primary" onClick={() => setWizardOpen(true)}>
                <Icon name="print_add" size={18} />
                Set up your first printer
              </button>
            }
          >
            The wizard asks a few plain questions and prints a test sheet. If
            cheques currently come out blank, this is usually the fix.
          </EmptyState>
        </div></div>
      ) : (
        <div className="templates">
          {printers.map((p) => (
            <article className="card template" key={p.id}>
              <div className="template__body">
                <div className="template__head">
                  <div style={{ minWidth: 0 }}>
                    <h3 className="template__name">{p.name}</h3>
                    {p.model && <p className="muted table__sub">{p.model}</p>}
                  </div>
                  <div className="row" style={{ gap: 'var(--sp-2)' }}>
                    {p.isDefault && <span className="badge badge--accent">Default</span>}
                    {availability(p) === 'elsewhere' && (
                      <span className="badge badge--danger"
                        title={`Calibrated on "${p.calibratedOnPrinter}", which is not on this computer`}>
                        <Icon name="print_disabled" size={13} />
                        Not available here
                      </span>
                    )}
                    <FeedDirectionDiagram rotation={p.rotation} size={54} />
                  </div>
                </div>

                <dl className="template__facts">
                  <div>
                    <dt>Minimum page</dt>
                    <dd className="mono">
                      {p.minPageHeightMm > 0 ? `${p.minPageHeightMm} mm tall` : 'No minimum'}
                    </dd>
                  </div>
                  <div>
                    <dt>Feed path</dt>
                    <dd>{PATH_LABEL[p.feedPath]}</dd>
                  </div>

                  <div>
                    <dt>Print direction</dt>
                    <dd className="mono">{p.rotation}&deg;</dd>
                  </div>
                  <div>
                    <dt>Calibration</dt>
                    <dd className="mono">
                      {p.offsetXMm === 0 && p.offsetYMm === 0
                        ? 'None needed'
                        : `${p.offsetXMm}, ${p.offsetYMm} mm`}
                    </dd>
                  </div>
                  <div>
                    <dt>Used by</dt>
                    <dd>{p.templateCount ?? 0} template{p.templateCount === 1 ? '' : 's'}</dd>
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <dt>Located at</dt>
                    <dd>
                      {p.workstation
                        ? <><Icon name="desktop_windows" size={14} /> {p.workstation}</>
                        : <span className="subtle">Not recorded</span>}
                    </dd>
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <dt>Calibrated</dt>
                    <dd>
                      {p.calibratedAt ? (
                        <>
                          by <strong>{p.calibratedBy || 'unknown'}</strong>
                          {' '}on {new Date(p.calibratedAt).toLocaleDateString(undefined, {
                            day: 'numeric', month: 'short', year: 'numeric',
                          })}
                          {p.calibratedOnPrinter && (
                            <span className="table__sub">
                              using {p.calibratedOnPrinter}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="subtle">Not calibrated yet</span>
                      )}
                    </dd>
                  </div>
                </dl>

                {p.notes && <p className="muted table__sub">{p.notes}</p>}

                <div className="template__actions">
                  <button type="button" className="btn btn--primary"
                    onClick={() => setCalibrating(p)}>
                    <Icon name="tune" size={18} />
                    Edit &amp; calibrate
                  </button>
                  <button type="button" className="btn" onClick={() => setManaging(p)}>
                    <Icon name="checklist" size={18} />
                    Manage templates
                  </button>

                  {!p.isDefault && (
                    <button type="button" className="btn btn--ghost btn--icon"
                      onClick={async () => {
                        await api.post(`/printers/${p.id}/default`);
                        toast.success(`${p.name} is now the default`);
                        load();
                      }}
                      title="Make this the default" aria-label={`Make ${p.name} the default`}>
                      <Icon name="star" size={19} />
                    </button>
                  )}
                  <button type="button" className="btn btn--ghost btn--icon"
                    onClick={() => setRemoving(p)}
                    title={`Remove ${p.name}`} aria-label={`Remove ${p.name}`}>
                    <Icon name="delete" size={19} />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <PrinterWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onFinished={(p) => { toast.success(`${p.name} saved`); load(); }}
      />

      {managing && (
        <ManageTemplatesDialog
          printer={managing}
          onClose={() => setManaging(null)}
          onSaved={(attached, detached) => {
            setManaging(null);
            toast.success(
              detached
                ? `${attached} template(s) attached, ${detached} detached`
                : `${attached} template(s) use ${managing.name}`,
            );
            load();
          }}
        />
      )}

      {/* Same screen, entered directly on an existing profile. */}
      <PrinterWizard
        open={Boolean(calibrating)}
        editing={calibrating}
        onClose={() => setCalibrating(null)}
        onFinished={(p) => { toast.success(`${p.name} recalibrated`); load(); }}
      />

      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          await api.del(`/printers/${removing.id}`);
          toast.success(`${removing.name} removed`);
          load();
        }}
        title={`Remove ${removing?.name}?`}
        confirmLabel="Remove"
        message={
          `${removing?.templateCount ?? 0} template(s) use this printer. They will fall ` +
          'back to their own paper settings, which may mean nothing prints until ' +
          'you set up another printer.'
        }
      />
    </>
  );
}
