/**
 * User administration (Section 7). Admin-only.
 *
 * Roles are the flat pair the spec defines — Admin and Accounting. Accounts are
 * provisioned here and nowhere else; there is no self-signup route in the app.
 */

import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { useToast } from '../components/Toast.jsx';
import Icon from '../components/Icon.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import UserForm from '../components/users/UserForm.jsx';
import ResetPasswordDialog from '../components/users/ResetPasswordDialog.jsx';

const when = (value) =>
  value ? new Date(value).toLocaleDateString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric',
  }) : '—';

export default function Users() {
  const { user: me } = useAuth();
  const toast = useToast();

  const [users, setUsers] = useState([]);
  const [policy, setPolicy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [editing, setEditing] = useState(null);
  const [resetting, setResetting] = useState(null);
  const [toggling, setToggling] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/users');
      setUsers(data.users);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    api.get('/users/policy').then(setPolicy).catch(() => {});
  }, [load]);

  const activeAdmins = users.filter((u) => u.role === 'admin' && u.is_active).length;

  async function handleToggleActive() {
    const target = toggling;
    await api.patch(`/users/${target.id}`, { isActive: !target.is_active });
    toast.success(
      target.is_active ? `${target.username} deactivated` : `${target.username} reactivated`,
    );
    load();
  }

  return (
    <>
      <div className="page__head">
        <div>
          <h1>Users</h1>
          <p>Accounts are created here. There is no sign-up — an admin provisions everyone.</p>
        </div>
        <button type="button" className="btn btn--primary" onClick={() => setEditing({})}>
          <Icon name="person_add" size={18} />
          Add user
        </button>
      </div>

      {error && (
        <div className="alert alert--danger" role="alert" style={{ marginBottom: 'var(--sp-4)' }}>
          <Icon name="error" size={18} /><span>{error}</span>
        </div>
      )}

      <div className="card">
        {users.length === 0 && !loading ? (
          <div className="card__body">
            <EmptyState icon="group" title="No accounts" />
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Last signed in</th>
                  <th className="table__actions"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isMe = u.id === me?.id;
                  // Mirrors the server guard so the reason is visible, not just
                  // a rejected request.
                  const lastAdmin = u.role === 'admin' && u.is_active && activeAdmins === 1;

                  return (
                    <tr key={u.id} className={u.is_active ? '' : 'is-inactive'}>
                      <td>
                        <div className="table__primary">
                          {u.full_name || u.username}
                          {isMe && <span className="badge" style={{ marginLeft: 6 }}>You</span>}
                        </div>
                        <div className="table__sub mono">@{u.username}</div>
                      </td>
                      <td>
                        <span className={`badge ${u.role === 'admin' ? 'badge--accent' : ''}`}>
                          <Icon
                            name={u.role === 'admin' ? 'shield_person' : 'calculate'}
                            size={13}
                          />
                          {u.role === 'admin' ? 'Admin' : 'Accounting'}
                        </span>
                      </td>
                      <td>
                        {!u.is_active ? (
                          <span className="badge">Inactive</span>
                        ) : u.must_change_password ? (
                          <span className="badge badge--warn" title="Locked to the password-change screen">
                            <Icon name="lock_reset" size={13} />
                            Must set password
                          </span>
                        ) : (
                          <span className="badge badge--success">
                            <Icon name="check_circle" size={13} />
                            Active
                          </span>
                        )}
                      </td>
                      <td className="table__sub">{when(u.created_at)}</td>
                      <td className="table__sub">{when(u.last_login_at)}</td>
                      <td className="table__actions">
                        <button
                          type="button"
                          className="btn btn--ghost btn--icon"
                          onClick={() => setEditing(u)}
                          title={`Edit ${u.username}`}
                          aria-label={`Edit ${u.username}`}
                        >
                          <Icon name="edit" size={19} />
                        </button>
                        <button
                          type="button"
                          className="btn btn--ghost btn--icon"
                          onClick={() => setResetting(u)}
                          title={`Reset ${u.username}'s password`}
                          aria-label={`Reset ${u.username}'s password`}
                        >
                          <Icon name="lock_reset" size={19} />
                        </button>
                        <button
                          type="button"
                          className="btn btn--ghost btn--icon"
                          onClick={() => setToggling(u)}
                          disabled={isMe || lastAdmin}
                          title={
                            isMe
                              ? 'You cannot deactivate your own account'
                              : lastAdmin
                                ? 'This is the only active admin'
                                : u.is_active
                                  ? `Deactivate ${u.username}`
                                  : `Reactivate ${u.username}`
                          }
                          aria-label={u.is_active ? 'Deactivate' : 'Reactivate'}
                        >
                          <Icon name={u.is_active ? 'person_off' : 'person_check'} size={19} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="field__hint" style={{ marginTop: 'var(--sp-3)' }}>
        <Icon name="info" size={13} /> Deactivating takes effect immediately — the
        next request from that account is rejected, even mid-session. Accounts are
        never deleted, so the audit trail keeps resolving who did what.
      </p>

      <UserForm
        open={Boolean(editing)}
        user={editing?.id ? editing : null}
        policy={policy}
        onClose={() => setEditing(null)}
        onSaved={(saved, wasEdit) => {
          setEditing(null);
          toast.success(wasEdit ? `${saved.username} updated` : `${saved.username} created`);
          load();
        }}
      />

      <ResetPasswordDialog
        user={resetting}
        policy={policy}
        onClose={() => setResetting(null)}
        onDone={(u) => {
          setResetting(null);
          toast.success(`${u.username} must now set a new password`);
          load();
        }}
      />

      <ConfirmDialog
        open={Boolean(toggling)}
        onClose={() => setToggling(null)}
        onConfirm={handleToggleActive}
        title={
          toggling?.is_active
            ? `Deactivate ${toggling?.username}?`
            : `Reactivate ${toggling?.username}?`
        }
        confirmLabel={toggling?.is_active ? 'Deactivate' : 'Reactivate'}
        tone={toggling?.is_active ? 'danger' : 'primary'}
        message={
          toggling?.is_active
            ? 'They will be signed out on their next request and cannot sign in again until reactivated. Their cheque and audit history is kept.'
            : 'They will be able to sign in again with their existing password.'
        }
      />
    </>
  );
}
