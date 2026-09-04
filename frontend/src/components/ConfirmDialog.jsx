import { useState } from 'react';
import Modal from './Modal.jsx';
import Icon from './Icon.jsx';

/**
 * Yes/no dialog for a destructive action. Keeps the spinner and the error in
 * the dialog so the caller only has to supply an async `onConfirm`.
 */
export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  tone = 'danger',
}) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState(null);

  async function handleConfirm() {
    setWorking(true);
    setError(null);
    try {
      await onConfirm();
      onClose?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setWorking(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={working ? undefined : onClose}
      dismissible={!working}
      title={title}
      width={420}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose} disabled={working}>
            Cancel
          </button>
          <button
            type="button"
            className={`btn ${tone === 'danger' ? 'btn--danger' : 'btn--primary'}`}
            onClick={handleConfirm}
            disabled={working}
          >
            {working ? <span className="spinner" /> : null}
            {confirmLabel}
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
        <p className="muted">{message}</p>
      </div>
    </Modal>
  );
}
