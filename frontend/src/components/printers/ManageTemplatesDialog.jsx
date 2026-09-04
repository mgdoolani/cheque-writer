/**
 * Which bank templates use this printer profile.
 *
 * Deliberately its own dialog. This checklist used to live inside the
 * calibration flow, which meant you had to run a physical test print before you
 * could even reach it — bookkeeping gated behind paper. Nothing here prints.
 */

import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import Modal from '../Modal.jsx';
import Icon from '../Icon.jsx';

export default function ManageTemplatesDialog({ printer, onClose, onSaved }) {
  const [templates, setTemplates] = useState([]);
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!printer) return;
    setLoading(true);
    try {
      const data = await api.get('/templates?includeInactive=true');
      setTemplates(data.templates);
      setSelected(
        data.templates.filter((t) => t.printerProfileId === printer.id).map((t) => t.id),
      );
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [printer]);

  useEffect(() => { load(); }, [load]);

  if (!printer) return null;

  const toggle = (id) =>
    setSelected((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  async function save() {
    setSaving(true);
    setError(null);
    try {
      // Attach the ticked ones...
      await api.post(`/printers/${printer.id}/apply`, { templateIds: selected });

      // ...and detach any that were unticked, which `apply` does not cover.
      const removed = templates
        .filter((t) => t.printerProfileId === printer.id && !selected.includes(t.id))
        .map((t) => t.id);
      for (const id of removed) {
        // eslint-disable-next-line no-await-in-loop -- a handful at most
        await api.patch(`/templates/${id}/print-options`, { printerProfileId: null });
      }

      onSaved?.(selected.length, removed.length);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={saving ? undefined : onClose}
      dismissible={!saving}
      title={`Templates using ${printer.name}`}
      description="Nothing is printed — this just records which cheques use this printer's page size and alignment."
      width={520}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary" onClick={save} disabled={saving || loading}>
            {saving ? <span className="spinner" /> : <Icon name="save" size={18} />}
            Save
          </button>
        </>
      }
    >
      <div className="stack">
        {error && (
          <div className="alert alert--danger" role="alert">
            <Icon name="error" size={18} /><span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="splash" style={{ minHeight: 120 }}>
            <span className="spinner" /><span className="muted">Loading templates…</span>
          </div>
        ) : (
          <>
            {templates.map((t) => {
              const elsewhere = t.printerProfileId && t.printerProfileId !== printer.id;
              return (
                <label className="check" key={t.id} style={{ padding: 'var(--sp-2) 0' }}>
                  <input
                    type="checkbox"
                    checked={selected.includes(t.id)}
                    onChange={() => toggle(t.id)}
                    disabled={saving}
                  />
                  <span>
                    <strong>{t.name}</strong>{' '}
                    <span className="subtle">
                      {t.checkWidthMm}×{t.checkHeightMm} mm
                      {!t.isActive && ' · retired'}
                    </span>
                    {elsewhere && !selected.includes(t.id) && (
                      <span className="table__sub">
                        currently uses {t.printerName}
                      </span>
                    )}
                  </span>
                </label>
              );
            })}
            <p className="field__hint">
              <Icon name="info" size={13} /> Unticking a template returns it to its
              own paper settings, which may mean nothing prints until you point it
              at another printer.
            </p>
          </>
        )}
      </div>
    </Modal>
  );
}
