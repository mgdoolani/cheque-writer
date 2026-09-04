/**
 * Create or edit an account. Admin-provisioned only — there is no self-signup
 * anywhere in the app, so this dialog is the sole way an account comes into
 * existence.
 */

import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import Icon from '../Icon.jsx';
import Modal from '../Modal.jsx';

const ROLES = [
  {
    value: 'accounting',
    label: 'Accounting',
    hint: 'Writes, previews and prints cheques. Manages payees.',
  },
  {
    value: 'admin',
    label: 'Admin',
    hint: 'Everything, plus templates, settings, users and the audit trail.',
  },
];

const BLANK = { username: '', fullName: '', role: 'accounting', password: '' };

export default function UserForm({ open, user, policy, onClose, onSaved }) {
  const [form, setForm] = useState(BLANK);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const isEdit = Boolean(user?.id);
  const minLength = policy?.minLength ?? 10;

  useEffect(() => {
    if (!open) return;
    setForm(user ? { ...BLANK, username: user.username, fullName: user.full_name || '', role: user.role } : BLANK);
    setError(null);
    setSaving(false);
    setShowPassword(false);
  }, [open, user]);

  const set = (key) => (value) => setForm((c) => ({ ...c, [key]: value }));

  const passwordOk =
    isEdit ||
    (form.password.length >= minLength && /[a-z]/i.test(form.password) && /\d/.test(form.password));
  const canSubmit = form.username.trim().length >= 3 && passwordOk && !saving;

  async function handleSubmit(event) {
    event.preventDefault();
    if (!canSubmit) return;

    setSaving(true);
    setError(null);
    try {
      const data = isEdit
        ? await api.patch(`/users/${user.id}`, {
            fullName: form.fullName.trim(),
            role: form.role,
          })
        : await api.post('/users', {
            username: form.username.trim(),
            fullName: form.fullName.trim(),
            role: form.role,
            password: form.password,
          });
      onSaved?.(data.user, isEdit);
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
      title={isEdit ? `Edit ${user?.username}` : 'Add user'}
      description={isEdit ? undefined : 'The account is created ready to use.'}
      width={520}
    >
      <form className="stack" onSubmit={handleSubmit} noValidate>
        {error && (
          <div className="alert alert--danger" role="alert">
            <Icon name="error" size={18} /><span>{error}</span>
          </div>
        )}

        <div className="form-grid">
          <div className="field">
            <label className="field__label" htmlFor="u-username">
              Username {!isEdit && <span className="req">required</span>}
            </label>
            <input
              id="u-username"
              className="input"
              value={form.username}
              onChange={(e) => set('username')(e.target.value)}
              disabled={saving || isEdit}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck="false"
              /* eslint-disable-next-line jsx-a11y/no-autofocus -- first field of a dialog */
              autoFocus={!isEdit}
              required
            />
            {isEdit && <span className="field__hint">Usernames cannot be changed.</span>}
          </div>

          <div className="field">
            <label className="field__label" htmlFor="u-fullname">Full name</label>
            <input
              id="u-fullname"
              className="input"
              value={form.fullName}
              onChange={(e) => set('fullName')(e.target.value)}
              disabled={saving}
            />
          </div>
        </div>

        <div className="field">
          <span className="field__label">Role</span>
          <div className="rolepick">
            {ROLES.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`rolepick__item${form.role === option.value ? ' is-active' : ''}`}
                onClick={() => set('role')(option.value)}
                disabled={saving}
                aria-pressed={form.role === option.value}
              >
                <Icon
                  name={option.value === 'admin' ? 'shield_person' : 'calculate'}
                  size={19}
                />
                <span>
                  <strong>{option.label}</strong>
                  <span className="muted">{option.hint}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        {!isEdit && (
          <div className="field">
            <label className="field__label" htmlFor="u-password">
              Temporary password <span className="req">required</span>
            </label>
            <div className="input-group">
              <input
                id="u-password"
                className="input"
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={(e) => set('password')(e.target.value)}
                disabled={saving}
                autoComplete="new-password"
                required
              />
              <button
                type="button"
                className="input-group__action"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                tabIndex={-1}
              >
                <Icon name={showPassword ? 'visibility_off' : 'visibility'} size={19} />
              </button>
            </div>
            <span className="field__hint">
              At least {minLength} characters with a letter and a number. Give it
              to them in person — they must change it before they can do anything.
            </span>
          </div>
        )}

        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary" disabled={!canSubmit}>
            {saving ? <span className="spinner" /> : <Icon name="save" size={18} />}
            {isEdit ? 'Save changes' : 'Create account'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
