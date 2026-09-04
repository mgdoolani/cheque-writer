/**
 * Confirmation for printing a cheque that has already been printed.
 *
 * Replaces a window.confirm + window.prompt pair. The reason goes into the
 * audit trail, and is mandatory when Settings says so — which the browser
 * prompt could not enforce.
 */

import { useEffect, useState } from 'react';
import Modal from '../Modal.jsx';
import Icon from '../Icon.jsx';

export default function ReprintDialog({
  open,
  message,
  reasonRequired,
  working,
  onCancel,
  onConfirm,
}) {
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (open) setReason('');
  }, [open]);

  const blocked = reasonRequired && !reason.trim();

  return (
    <Modal
      open={open}
      onClose={working ? undefined : onCancel}
      dismissible={!working}
      title="This cheque has already been printed"
      width={520}
      footer={
        <>
          <button type="button" className="btn" onClick={onCancel} disabled={working}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--danger"
            onClick={() => onConfirm(reason.trim())}
            disabled={working || blocked}
          >
            {working ? <span className="spinner" /> : <Icon name="print" size={18} />}
            Print again
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="alert alert--warn">
          <Icon name="warning" size={18} />
          <span>{message}</span>
        </div>

        <div className="field">
          <label className="field__label" htmlFor="reprint-reason">
            Reason for reprinting{' '}
            {reasonRequired ? (
              <span className="req">required</span>
            ) : (
              <span className="subtle">(optional)</span>
            )}
          </label>
          <textarea
            id="reprint-reason"
            className="textarea"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={working}
            placeholder="e.g. printer jammed, first copy destroyed"
            /* eslint-disable-next-line jsx-a11y/no-autofocus -- only field in the dialog */
            autoFocus
          />
          <span className="field__hint">
            <Icon name="history" size={13} /> Recorded in the audit trail against
            your name.
          </span>
        </div>
      </div>
    </Modal>
  );
}
