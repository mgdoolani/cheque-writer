/**
 * Sign in (Section 7 / 9). Talks to POST /api/auth/login, which sets the
 * httpOnly session cookie and returns the user record.
 */

import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import Icon from '../components/Icon.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';
import { useBranding, useDocumentTitle } from '../branding/BrandingProvider.jsx';

export default function Login() {
  const { signIn } = useAuth();
  const { companyName, productName, credit } = useBranding();
  useDocumentTitle('Sign in');
  const navigate = useNavigate();
  const location = useLocation();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const usernameRef = useRef(null);
  useEffect(() => usernameRef.current?.focus(), []);

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting) return;

    setError(null);
    setSubmitting(true);

    try {
      await signIn(username.trim(), password);
      navigate(location.state?.from?.pathname || '/', { replace: true });
    } catch (err) {
      // The server deliberately returns the same message for a bad username and
      // a bad password; pass it through rather than guessing which it was.
      setError(err.message);
      setPassword('');
      setSubmitting(false);
    }
  }

  return (
    <div className="login">
      <div className="login__corner">
        <ThemeToggle />
      </div>

      <div className="login__card card">
        <div className="login__brand">
          <span className="login__mark">
            <Icon name="payments" size={26} />
          </span>
          <h1>{companyName || productName}</h1>
          <p className="muted">
            {companyName ? `${productName} — sign in to write and print cheques.`
                         : 'Sign in to write and print cheques.'}
          </p>
        </div>

        <form className="stack" onSubmit={handleSubmit} noValidate>
          {error && (
            <div className="alert alert--danger" role="alert">
              <Icon name="error" size={18} />
              <span>{error}</span>
            </div>
          )}

          <div className="field">
            <label className="field__label" htmlFor="username">
              Username
            </label>
            <input
              id="username"
              className="input"
              ref={usernameRef}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck="false"
              disabled={submitting}
              required
            />
          </div>

          <div className="field">
            <label className="field__label" htmlFor="password">
              Password
            </label>
            <div className="input-group">
              <input
                id="password"
                className="input"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyUp={(e) => setCapsLock(e.getModifierState?.('CapsLock') ?? false)}
                autoComplete="current-password"
                disabled={submitting}
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
            {capsLock && (
              <span className="field__hint">
                <Icon name="keyboard_capslock" size={13} /> Caps Lock is on
              </span>
            )}
          </div>

          <button
            type="submit"
            className="btn btn--primary login__submit"
            disabled={submitting || !username.trim() || !password}
          >
            {submitting ? (
              <>
                <span className="spinner" />
                Signing in…
              </>
            ) : (
              <>
                <Icon name="login" size={18} />
                Sign in
              </>
            )}
          </button>
        </form>
      </div>

      <p className="login__foot subtle">
        Office LAN only · Sessions expire after 12 hours
        <br />
        {credit}
      </p>
    </div>
  );
}
