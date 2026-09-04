/**
 * Shown when a cheque that looks like an existing one is about to be written.
 * Replaces a window.confirm so the look-alikes can actually be read before the
 * user decides.
 */

import Modal from '../Modal.jsx';
import Icon from '../Icon.jsx';

const money = (value) =>
  Number(value).toLocaleString('en-US', { minimumFractionDigits: 2 });

export default function DuplicateDialog({ open, duplicates = [], working, onCancel, onConfirm }) {
  return (
    <Modal
      open={open}
      onClose={working ? undefined : onCancel}
      dismissible={!working}
      title="A similar cheque already exists"
      description="Same payee and amount, around the same date."
      width={560}
      footer={
        <>
          <button type="button" className="btn" onClick={onCancel} disabled={working}>
            Go back
          </button>
          <button type="button" className="btn btn--danger" onClick={onConfirm} disabled={working}>
            {working ? <span className="spinner" /> : <Icon name="warning" size={18} />}
            Write it anyway
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="alert alert--warn">
          <Icon name="warning" size={18} />
          <span>
            Check these before continuing — writing a second cheque for the same
            payment is hard to undo once it is printed and signed.
          </span>
        </div>

        <table className="table">
          <thead>
            <tr>
              <th>#</th>
              <th>Payee</th>
              <th className="table__num">Amount</th>
              <th>Date</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {duplicates.map((d) => (
              <tr key={d.id}>
                <td className="mono">{d.id}</td>
                <td className="table__primary">{d.payeeName}</td>
                <td className="table__num mono">{money(d.amount)}</td>
                <td className="mono">{d.checkDate}</td>
                <td>
                  <span
                    className={`badge ${
                      d.status === 'printed'
                        ? 'badge--success'
                        : d.status === 'void'
                          ? 'badge--danger'
                          : ''
                    }`}
                  >
                    {d.status}
                  </span>
                  {d.printCount > 0 && (
                    <span className="table__sub">printed {d.printCount}×</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
