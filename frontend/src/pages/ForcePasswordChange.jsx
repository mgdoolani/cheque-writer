/**
 * Hard gate for an account still on a shipped default password. The server
 * refuses every data route with `mustChangePassword` until this is done, so
 * this screen is the UI half of that lock, not the lock itself.
 */

import PasswordChangeForm from '../components/PasswordChangeForm.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';
import Icon from '../components/Icon.jsx';
import { useAuth } from '../auth/AuthProvider.jsx';

export default function ForcePasswordChange() {
  const { user, signOut } = useAuth();

  return (
    <div className="login">
      <div className="login__corner">
        <ThemeToggle />
      </div>

      <div className="login__card card" style={{ maxWidth: 440 }}>
        <div className="login__brand">
          <span className="login__mark" style={{ background: 'var(--amber-500)' }}>
            <Icon name="lock_reset" size={26} />
          </span>
          <h1>Choose a new password</h1>
          <p className="muted">
            <strong>{user?.username}</strong> is still using the default password
            that ships with the app. Set your own before continuing.
          </p>
        </div>

        <div className="alert alert--warn" style={{ marginBottom: 'var(--sp-5)' }}>
          <Icon name="warning" size={18} />
          <span>
            Anyone who can reach this server on the network knows that default.
            Nothing else in the app will open until this is changed.
          </span>
        </div>

        <PasswordChangeForm forced />

        <button
          type="button"
          className="btn btn--ghost"
          onClick={signOut}
          style={{ width: '100%', marginTop: 'var(--sp-4)' }}
        >
          <Icon name="logout" size={18} />
          Sign out instead
        </button>
      </div>
    </div>
  );
}
