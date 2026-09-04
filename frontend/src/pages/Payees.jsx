/**
 * Payee book (Section 8): list, search, add, edit, remove.
 *
 * Removal is admin-only and is not always a delete — a payee with cheque
 * history is deactivated instead, so old records keep pointing at who they were
 * written to. The server decides which happens; this screen reports back what
 * it did.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { useToast } from '../components/Toast.jsx';
import Icon from '../components/Icon.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import PayeeForm from '../components/payees/PayeeForm.jsx';

const SEARCH_DEBOUNCE_MS = 250;

export default function Payees() {
  const { isAdmin } = useAuth();
  const toast = useToast();

  const [payees, setPayees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  const [editing, setEditing] = useState(null); // payee object, or {} for "new"
  const [removing, setRemoving] = useState(null);

  // Guards against a slow early request overwriting a faster later one.
  const requestId = useRef(0);

  const load = useCallback(
    async (term, includeInactive) => {
      const id = requestId.current + 1;
      requestId.current = id;

      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (term) params.set('search', term);
        if (includeInactive) params.set('includeInactive', 'true');

        const data = await api.get(`/payees?${params}`);
        if (requestId.current !== id) return;

        setPayees(data.payees);
        setError(null);
      } catch (err) {
        if (requestId.current === id) setError(err.message);
      } finally {
        if (requestId.current === id) setLoading(false);
      }
    },
    [],
  );

  // Debounced so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => load(search.trim(), showInactive), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search, showInactive, load]);

  function handleSaved(payee, wasEdit) {
    setEditing(null);
    toast.success(wasEdit ? `${payee.name} updated` : `${payee.name} added`);
    load(search.trim(), showInactive);
  }

  async function handleRemove() {
    const data = await api.del(`/payees/${removing.id}`);
    if (data?.deactivated) {
      toast.info(`${removing.name} has cheque history — deactivated instead of deleted`);
    } else {
      toast.success(`${removing.name} deleted`);
    }
    load(search.trim(), showInactive);
  }

  const isSearching = search.trim().length > 0;

  return (
    <>
      <div className="page__head">
        <div>
          <h1>Payees</h1>
          <p>People and firms you write cheques to.</p>
        </div>
        <button type="button" className="btn btn--primary" onClick={() => setEditing({})}>
          <Icon name="person_add" size={18} />
          Add payee
        </button>
      </div>

      <div className="toolbar">
        <div className="toolbar__search">
          <Icon name="search" size={18} />
          <input
            className="input"
            placeholder="Search by name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search payees"
          />
          {isSearching && (
            <button
              type="button"
              className="toolbar__clear"
              onClick={() => setSearch('')}
              aria-label="Clear search"
            >
              <Icon name="close" size={16} />
            </button>
          )}
        </div>

        <button
          type="button"
          className={`btn ${showInactive ? 'btn--primary' : ''}`}
          onClick={() => setShowInactive((v) => !v)}
          aria-pressed={showInactive}
        >
          <Icon name={showInactive ? 'visibility' : 'visibility_off'} size={18} />
          {showInactive ? 'Showing inactive' : 'Hiding inactive'}
        </button>

        <div className="spacer" />
        <span className="subtle">
          {loading ? 'Loading…' : `${payees.length} payee${payees.length === 1 ? '' : 's'}`}
        </span>
      </div>

      {error && (
        <div className="alert alert--danger" role="alert" style={{ marginBottom: 'var(--sp-4)' }}>
          <Icon name="error" size={18} />
          <span>{error}</span>
        </div>
      )}

      <div className="card">
        {payees.length === 0 && !loading ? (
          <div className="card__body">
            {isSearching ? (
              <EmptyState icon="search_off" title="No matches">
                Nothing matches “{search.trim()}”.
                {!showInactive && ' Inactive payees are hidden — try showing them.'}
              </EmptyState>
            ) : (
              <EmptyState
                icon="contacts"
                title="No payees yet"
                action={
                  <button
                    type="button"
                    className="btn btn--primary"
                    onClick={() => setEditing({})}
                  >
                    <Icon name="person_add" size={18} />
                    Add the first payee
                  </button>
                }
              >
                Save the people and firms you pay regularly and they will be one
                click away when you write a cheque.
              </EmptyState>
            )}
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Contact</th>
                  <th>Address</th>
                  <th className="table__num">Cheques</th>
                  <th className="table__actions">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {payees.map((payee) => (
                  <tr key={payee.id} className={payee.isActive ? '' : 'is-inactive'}>
                    <td>
                      <div className="table__primary">{payee.name}</div>
                      {!payee.isActive && <span className="badge">Inactive</span>}
                      {payee.tin && <div className="table__sub">TIN {payee.tin}</div>}
                    </td>
                    <td>
                      {payee.contact || <span className="subtle">—</span>}
                      {payee.email && <div className="table__sub">{payee.email}</div>}
                    </td>
                    <td>
                      {payee.address ? (
                        <span title={payee.address}>{payee.address}</span>
                      ) : (
                        <span className="subtle">—</span>
                      )}
                    </td>
                    <td className="table__num">{payee.checkCount ?? 0}</td>
                    <td className="table__actions">
                      <button
                        type="button"
                        className="btn btn--ghost btn--icon"
                        onClick={() => setEditing(payee)}
                        title={`Edit ${payee.name}`}
                        aria-label={`Edit ${payee.name}`}
                      >
                        <Icon name="edit" size={19} />
                      </button>
                      {isAdmin && (
                        <button
                          type="button"
                          className="btn btn--ghost btn--icon"
                          onClick={() => setRemoving(payee)}
                          title={`Remove ${payee.name}`}
                          aria-label={`Remove ${payee.name}`}
                        >
                          <Icon name="delete" size={19} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <PayeeForm
        open={Boolean(editing)}
        payee={editing?.id ? editing : null}
        onClose={() => setEditing(null)}
        onSaved={handleSaved}
      />

      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        onConfirm={handleRemove}
        title={`Remove ${removing?.name}?`}
        confirmLabel="Remove"
        message={
          removing?.checkCount
            ? `${removing.name} has ${removing.checkCount} cheque${
                removing.checkCount === 1 ? '' : 's'
              } on record, so they will be deactivated rather than deleted. Existing cheques keep their history.`
            : 'This payee has no cheque history and will be deleted permanently.'
        }
      />
    </>
  );
}
