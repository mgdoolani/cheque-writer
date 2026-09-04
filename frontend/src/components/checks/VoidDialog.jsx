import { useEffect, useState } from 'react';
import Modal from '../Modal.jsx';
import Icon from '../Icon.jsx';
import { formatMoney } from '../../lib/money.js';

/**
 * Voiding is admin-only and permanent — the row stays for the audit trail but
 * the cheque stops counting towards any total. A reason is mandatory.
 */
export default function VoidDialog({ check, working, onCancel, onConfirm }) {
  const [reason, setReason] = useState('');
  useEffect(() => setReason(''), [check]);

  if (!check) return null;

  return (
    <Modal
      open
      onClose={working ? undefined : onCancel}
      dismissible={!working}
      title={`Void cheque #${check.id}?`}
      width={480}
      footer={
        <>
          <button type="button" className="btn" onClick={onCancel} disabled={working}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--danger"
            onClick={() => onConfirm(reason.trim())}
            disabled={working || !reason.trim()}
          >
            {working ? <span className="spinner" /> : <Icon name="block" size={18} />}
            Void it
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="alert alert--warn">
          <Icon name="warning" size={18} />
          <span>
            {check.payeeName} · {formatMoney(check.amount)} · {check.dateText}
            {check.printCount > 0 && (
              <>
                <br />
                <strong>This cheque has already been printed {check.printCount}×.</strong>{' '}
                Voiding the record does not recall the paper — destroy it separately.
              </>
            )}
          </span>
        </div>

        <div className="field">
          <label className="field__label" htmlFor="void-reason">
            Reason <span className="req">required</span>
          </label>
          <textarea
            id="void-reason"
            className="textarea"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={working}
            placeholder="e.g. spoiled in the printer, amount was wrong"
            /* eslint-disable-next-line jsx-a11y/no-autofocus -- only field in the dialog */
            autoFocus
          />
          <span className="field__hint">
            <Icon name="history" size={13} /> Recorded in the audit trail against your name.
          </span>
        </div>
      </div>
    </Modal>
  );
}
