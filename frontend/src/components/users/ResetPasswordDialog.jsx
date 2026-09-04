/**
 * Admin password reset. The new password is temporary: the server sets
 * must_change_password, so the account is locked to the reset screen until its
 * owner picks their own.
 */

import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import Modal from '../Modal.jsx';
import Icon from '../Icon.jsx';

export default function ResetPasswordDialog({ user, policy, onClose, onDone }) {
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const minLength = policy?.minLength ?? 10;

  useEffect(() => {
    setPassword('');
    setError(null);
    setSaving(false);
    setShow(false);
  }, [user]);

  if (!user) return null;

  const valid =
    password.length >= minLength && /[a-z]/i.test(password) && /\d/.test(password);

  async function submit(event) {
    event.preventDefault();
    if (!valid || saving) return;

    setSaving(true);
    setError(null);
    try {
      await api.patch(`/users/${user.id}`, { password });
      onDone?.(user);
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
      title={`Reset password for ${user.username}`}
      width={480}
    >
      <form className="stack" onSubmit={submit} noValidate>
        {error && (
          <div className="alert alert--danger" role="alert">
            <Icon name="error" size={18} /><span>{error}</span>
          </div>
        )}

        <div className="alert alert--info">
          <Icon name="info" size={18} />
          <span>
            This is a temporary password. {user.username} will be locked to the
            password-change screen until they set their own.
          </span>
        </div>

        <div className="field">
          <label className="field__label" htmlFor="reset-pw">New temporary password</label>
          <div className="input-group">
            <input
              id="reset-pw"
              className="input"
              type={show ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={saving}
              autoComplete="new-password"
              /* eslint-disable-next-line jsx-a11y/no-autofocus -- only field in the dialog */
              autoFocus
              required
            />
            <button
              type="button"
              className="input-group__action"
              onClick={() => setShow((v) => !v)}
              aria-label={show ? 'Hide password' : 'Show password'}
              tabIndex={-1}
            >
              <Icon name={show ? 'visibility_off' : 'visibility'} size={19} />
            </button>
          </div>
          <span className="field__hint">
            At least {minLength} characters with a letter and a number.
          </span>
        </div>

        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary" disabled={!valid || saving}>
            {saving ? <span className="spinner" /> : <Icon name="lock_reset" size={18} />}
            Reset password
          </button>
        </div>
      </form>
    </Modal>
  );
}
