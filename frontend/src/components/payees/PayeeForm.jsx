/**
 * Create / edit a payee (Section 8).
 *
 * Address, contact, email and TIN are AES-256-GCM encrypted at rest — they
 * arrive here already decrypted and go back as plaintext over the same-origin
 * session. Only `name` is stored in the clear, because it has to be searchable
 * and it is what gets printed on the cheque.
 */

import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import Icon from '../Icon.jsx';
import Modal from '../Modal.jsx';

const BLANK = {
  name: '',
  address: '',
  contact: '',
  email: '',
  tin: '',
  notes: '',
  isActive: true,
};

export default function PayeeForm({ open, payee, onClose, onSaved }) {
  const [form, setForm] = useState(BLANK);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const isEdit = Boolean(payee?.id);

  // Reload whenever the dialog opens, so a cancelled edit leaves nothing behind.
  useEffect(() => {
    if (!open) return;
    setForm(payee ? { ...BLANK, ...payee } : BLANK);
    setError(null);
    setSaving(false);
  }, [open, payee]);

  const set = (key) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setForm((current) => ({ ...current, [key]: value }));
  };

  async function handleSubmit(event) {
    event.preventDefault();
    if (!form.name.trim() || saving) return;

    setSaving(true);
    setError(null);

    const body = {
      name: form.name.trim(),
      address: form.address.trim(),
      contact: form.contact.trim(),
      email: form.email.trim(),
      tin: form.tin.trim(),
      notes: form.notes.trim(),
      isActive: form.isActive,
    };

    try {
      const data = isEdit
        ? await api.put(`/payees/${payee.id}`, body)
        : await api.post('/payees', body);
      onSaved?.(data.payee, isEdit);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={saving ? undefined : onClose}
      dismissible={!saving}
      title={isEdit ? 'Edit payee' : 'Add payee'}
      description={
        isEdit ? payee?.name : 'Saved payees can be picked when writing a cheque.'
      }
      width={620}
    >
      <form className="stack" onSubmit={handleSubmit} noValidate>
        {error && (
          <div className="alert alert--danger" role="alert">
            <Icon name="error" size={18} />
            <span>{error}</span>
          </div>
        )}

        <div className="form-grid">
          <div className="field field--full">
            <label className="field__label" htmlFor="payee-name">
              Name <span className="subtle">(printed on the cheque)</span>
            </label>
            <input
              id="payee-name"
              className="input"
              value={form.name}
              onChange={set('name')}
              disabled={saving}
              /* eslint-disable-next-line jsx-a11y/no-autofocus -- first field of a dialog */
              autoFocus
              required
            />
          </div>

          <div className="field">
            <label className="field__label" htmlFor="payee-contact">Contact number</label>
            <input
              id="payee-contact"
              className="input"
              value={form.contact}
              onChange={set('contact')}
              disabled={saving}
            />
          </div>

          <div className="field">
            <label className="field__label" htmlFor="payee-email">Email</label>
            <input
              id="payee-email"
              className="input"
              type="email"
              value={form.email}
              onChange={set('email')}
              disabled={saving}
            />
          </div>

          <div className="field field--full">
            <label className="field__label" htmlFor="payee-address">Address</label>
            <textarea
              id="payee-address"
              className="textarea"
              rows={2}
              value={form.address}
              onChange={set('address')}
              disabled={saving}
            />
          </div>

          <div className="field">
            <label className="field__label" htmlFor="payee-tin">TIN</label>
            <input
              id="payee-tin"
              className="input"
              value={form.tin}
              onChange={set('tin')}
              disabled={saving}
            />
          </div>

          <div className="field">
            <label className="field__label" htmlFor="payee-active">Status</label>
            <select
              id="payee-active"
              className="select"
              value={form.isActive ? 'active' : 'inactive'}
              onChange={(e) =>
                setForm((c) => ({ ...c, isActive: e.target.value === 'active' }))
              }
              disabled={saving}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive — hidden when writing a cheque</option>
            </select>
          </div>

          <div className="field field--full">
            <label className="field__label" htmlFor="payee-notes">Notes</label>
            <textarea
              id="payee-notes"
              className="textarea"
              rows={2}
              value={form.notes}
              onChange={set('notes')}
              disabled={saving}
            />
          </div>
        </div>

        <p className="field__hint">
          <Icon name="lock" size={13} /> Address, contact, email and TIN are
          encrypted in the database.
        </p>

        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn--primary"
            disabled={saving || !form.name.trim()}
          >
            {saving ? <span className="spinner" /> : <Icon name="save" size={18} />}
            {isEdit ? 'Save changes' : 'Add payee'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
