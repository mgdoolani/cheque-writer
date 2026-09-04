/**
 * Preview then print.
 *
 * The preview is the SAME PDF renderer the printer gets, stamped with a
 * "PREVIEW" watermark and with no effect on print counts. Pressing Print calls
 * the real endpoint, which marks the cheque printed inside a transaction and
 * hands back the unwatermarked PDF.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Modal from '../Modal.jsx';
import Icon from '../Icon.jsx';
import ReprintDialog from './ReprintDialog.jsx';
import PrintOptionsPanel from './PrintOptionsPanel.jsx';
import useQzTray from '../../hooks/useQzTray.js';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { printPdf, blobToBase64 } from '../../lib/qzTray.js';

export default function PrintDialog({
  check,
  template,
  onClose,
  onPrinted,
  onViewRegister,
  onTemplateChanged,
}) {
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState(null);
  // Set when the server refuses a repeat print until it is confirmed.
  const [reprint, setReprint] = useState(null);
  // Which route the last print actually took, so the operator is never guessing.
  const [route, setRoute] = useState(null);

  const qz = useQzTray({ auto: Boolean(check) });
  const { qzPrinterName } = useAuth();

  // The job goes to THIS user's printer. Layout still comes from the template's
  // printer profile — the two are different concerns and used to be conflated.
  const qzPrinter = qzPrinterName || '';
  const canPrintDirect = qz.available && Boolean(qzPrinter);
  // Known-missing before we touch anything: printing marks the cheque printed,
  // so a misconfiguration must be caught BEFORE that happens.
  const printerMissing =
    qz.available && Boolean(qzPrinter) && !qz.printers.includes(qzPrinter);

  // Reset per-cheque state when the dialog is pointed at a different cheque.
  useEffect(() => {
    setPrinting(false);
    setError(null);
    setReprint(null);
    setRoute(null);
  }, [check?.id]);

  if (!check) return null;

  async function handlePrint(confirmReprint = false, reason = '') {
    // Refuse before calling the print endpoint — that endpoint increments the
    // print count and writes an audit row, so failing after it would record a
    // cheque as printed when no paper ever moved.
    if (printerMissing) {
      setError(
        `Your printer “${qzPrinter}” isn't available on this computer. ` +
          'Choose the right one in Settings → My printer, then try again.',
      );
      return undefined;
    }

    setPrinting(true);
    setError(null);

    try {
      const response = await fetch(`/api/checks/${check.id}/print`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmReprint, reason }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));

        if (body.requiresConfirmation) {
          setReprint({
            message: body.error,
            // The server enforces this too; the dialog just stops a pointless
            // round trip when Settings requires a reason.
            reasonRequired: Boolean(body.requiresReason),
          });
          setPrinting(false);
          return undefined;
        }
        throw new Error(body.error || `Print failed (${response.status})`);
      }

      // QZ Tray is the only print path. The bytes are fetched once, after the
      // server has recorded the print, and go straight to the device.
      const blob = await response.blob();

      await printPdf({
        printerName: qzPrinter,
        base64: await blobToBase64(blob),
        pageWidthMm: template.pageWidthMm,
        pageHeightMm: template.pageHeightMm,
        // Sizing only — the PDF's own /Rotate does the rotating.
        rotation: template.printerRotation || 0,
        jobName: `Cheque #${check.id} — ${check.payeeName}`,
      });

      setRoute('qz');
      onPrinted?.();
    } catch (err) {
      // The cheque may already be marked printed by the server at this point,
      // so say so rather than let someone assume nothing happened.
      setError(
        `${err.message} The cheque has been recorded — use Reprint once the ` +
          'printer is available.',
      );
    } finally {
      setPrinting(false);
    }
    return undefined;
  }

  return (
    <>
    <Modal
      open
      onClose={printing ? undefined : onClose}
      dismissible={!printing}
      title={`Cheque #${check.id} — preview`}
      description="Check it against your blank stock before printing."
      width={860}
      footer={
        <>
          <button type="button" className="btn" onClick={onViewRegister} disabled={printing}>
            <Icon name="receipt_long" size={18} />
            Cheque register
          </button>
          <div className="spacer" />
          <button type="button" className="btn" onClick={onClose} disabled={printing}>
            Print later
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => handlePrint(false)}
            disabled={printing || !canPrintDirect}
          >
            {printing ? <span className="spinner" /> : <Icon name="print" size={18} />}
            {canPrintDirect ? 'Print now' : 'Printing unavailable'}
          </button>
        </>
      }
    >
      <div className="stack">
        {error && (
          <div className="alert alert--danger" role="alert">
            <Icon name="error" size={18} />
            <span>{error}</span>
          </div>
        )}

        <dl className="printsummary">
          <div><dt>Payee</dt><dd>{check.payeeName}</dd></div>
          <div><dt>Amount</dt><dd className="mono">{check.amountFormatted}</dd></div>
          <div><dt>Date</dt><dd className="mono">{check.dateText}</dd></div>
          {check.checkNumber && (
            <div><dt>Cheque no.</dt><dd className="mono">{check.checkNumber}</dd></div>
          )}
        </dl>

        <p className="pv__words pv__words--boxed">{check.amountWords}</p>

        {/* Which route this print will take, stated before the button is
            pressed rather than discovered afterwards. */}
        <div className={`route route--${
          canPrintDirect ? 'direct' : 'error'
        }`}>
          <Icon name={canPrintDirect ? 'print_connect' : 'error'} size={18} />
          <span>
            {qz.checking ? (
              'Looking for QZ Tray…'
            ) : !qz.available ? (
              <>
                <strong>QZ Tray isn&rsquo;t running on this computer.</strong>{' '}
                Cheques print directly to your printer and need it. Start QZ Tray,
                then press Check again.
              </>
            ) : printerMissing ? (
              <>
                <strong>Your printer &ldquo;{qzPrinter}&rdquo; isn&rsquo;t on this
                computer.</strong> Set the right one in{' '}
                <Link to="/settings">Settings &rarr; My printer</Link>.
              </>
            ) : !qzPrinter ? (
              <>
                <strong>You haven&rsquo;t chosen your printer yet.</strong> Pick it
                in <Link to="/settings">Settings &rarr; My printer</Link> to print.
              </>
            ) : (
              <>
                <strong>Direct to {qzPrinter}</strong> — sent at actual size, no
                dialog.
              </>
            )}
          </span>
          {!qz.checking && (
            <button type="button" className="btn btn--ghost btn--icon"
              onClick={qz.refresh} title="Check again for QZ Tray"
              aria-label="Check again for QZ Tray">
              <Icon name="refresh" size={17} />
            </button>
          )}
        </div>

        {route && (
          <div className="alert alert--success">
            <Icon name="check_circle" size={18} />
            <span>
              Sent to {qzPrinter}.
            </span>
          </div>
        )}

        {template && (
          <PrintOptionsPanel template={template} onSaved={onTemplateChanged} />
        )}

        <iframe
          className="pdfframe"
          src={`/api/checks/${check.id}/preview.pdf#toolbar=0&view=FitH`}
          title={`Preview of cheque ${check.id}`}
        />

        <p className="field__hint">
          <Icon name="info" size={13} /> The watermark is on the preview only.
          Printing records who printed it and when, and warns if it is printed
          a second time.
        </p>
      </div>
    </Modal>

    {/* A sibling, not a child: nesting it would put two focus traps and two
        Escape handlers on the same DOM subtree. */}
    <ReprintDialog
      open={Boolean(reprint)}
      message={reprint?.message}
      reasonRequired={reprint?.reasonRequired}
      working={printing}
      onCancel={() => setReprint(null)}
      onConfirm={(reason) => {
        setReprint(null);
        handlePrint(true, reason);
      }}
    />
    </>
  );
}
