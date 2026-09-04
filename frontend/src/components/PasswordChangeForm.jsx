/**
 * The password-change form itself, shared by two callers:
 *   - the profile menu, as a dismissible modal (self-service)
 *   - the forced-reset screen, when an account is still on a shipped default
 *
 * The rules mirror the server's `validateNewPassword`. The server is still the
 * authority; checking here just avoids a round trip to be told the obvious.
 */

import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import Icon from './Icon.jsx';

const MIN_LENGTH = 10;

const RULES = [
  { key: 'length', label: `At least ${MIN_LENGTH} characters`, test: (v) => v.length >= MIN_LENGTH },
  { key: 'letter', label: 'Contains a letter', test: (v) => /[a-z]/i.test(v) },
  { key: 'number', label: 'Contains a number', test: (v) => /\d/.test(v) },
];

function PasswordInput({ id, label, value, onChange, autoComplete, disabled, autoFocus }) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>{label}</label>
      <div className="input-group">
        <input
          id={id}
          className="input"
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          disabled={disabled}
          /* eslint-disable-next-line jsx-a11y/no-autofocus -- first field of a modal */
          autoFocus={autoFocus}
          required
        />
        <button
          type="button"
          className="input-group__action"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          tabIndex={-1}
        >
          <Icon name={visible ? 'visibility_off' : 'visibility'} size={19} />
        </button>
      </div>
    </div>
  );
}

export default function PasswordChangeForm({ onDone, onCancel, forced = false }) {
  const { updateUser } = useAuth();

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const results = RULES.map((rule) => ({ ...rule, ok: rule.test(next) }));
  const rulesPass = results.every((r) => r.ok);
  const matches = next.length > 0 && next === confirm;
  const isReused = next.length > 0 && next === current;
  const canSubmit = Boolean(current) && rulesPass && matches && !isReused && !submitting;

  useEffect(() => setError(null), [current, next, confirm]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    try {
      const data = await api.post('/auth/me/password', {
        currentPassword: current,
        newPassword: next,
      });
      if (data?.user) updateUser(data.user);
      onDone?.();
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  return (
    <form className="stack" onSubmit={handleSubmit} noValidate>
      {error && (
        <div className="alert alert--danger" role="alert">
          <Icon name="error" size={18} />
          <span>{error}</span>
        </div>
      )}

      <PasswordInput
        id="current-password"
        label={forced ? 'Current (default) password' : 'Current password'}
        value={current}
        onChange={setCurrent}
        autoComplete="current-password"
        disabled={submitting}
        autoFocus
      />

      <PasswordInput
        id="new-password"
        label="New password"
        value={next}
        onChange={setNext}
        autoComplete="new-password"
        disabled={submitting}
      />

      <ul className="rules">
        {results.map((rule) => (
          <li key={rule.key} className={rule.ok ? 'is-met' : ''}>
            <Icon name={rule.ok ? 'check_circle' : 'radio_button_unchecked'} size={15} />
            {rule.label}
          </li>
        ))}
        <li className={isReused ? 'is-failed' : next && !isReused ? 'is-met' : ''}>
          <Icon
            name={
              isReused
                ? 'cancel'
                : next && !isReused
                  ? 'check_circle'
                  : 'radio_button_unchecked'
            }
            size={15}
          />
          Different from your current password
        </li>
      </ul>

      <PasswordInput
        id="confirm-password"
        label="Confirm new password"
        value={confirm}
        onChange={setConfirm}
        autoComplete="new-password"
        disabled={submitting}
      />
      {confirm.length > 0 && !matches && (
        <span className="field__error">
          <Icon name="error" size={14} /> Passwords do not match
        </span>
      )}

      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 'var(--sp-2)' }}>
        {onCancel && (
          <button type="button" className="btn" onClick={onCancel} disabled={submitting}>
            Cancel
          </button>
        )}
        <button type="submit" className="btn btn--primary" disabled={!canSubmit}>
          {submitting ? (
            <>
              <span className="spinner" />
              Saving…
            </>
          ) : (
            <>
              <Icon name="lock_reset" size={18} />
              Change password
            </>
          )}
        </button>
      </div>
    </form>
  );
}
