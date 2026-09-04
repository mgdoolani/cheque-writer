import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider.jsx';
import Icon from '../components/Icon.jsx';
import ForcePasswordChange from '../pages/ForcePasswordChange.jsx';

/** Shown for the moment it takes to ask the server whether we're signed in. */
function SessionSplash() {
  return (
    <div className="splash">
      <span className="splash__mark">
        <Icon name="payments" size={24} />
      </span>
      <span className="spinner" />
      <span className="muted">Checking your session…</span>
    </div>
  );
}

/**
 * Gate for every authenticated route. Remembers where the user was heading so
 * signing in drops them there rather than on the dashboard.
 */
export default function RequireAuth() {
  const { status, isAuthenticated, mustChangePassword } = useAuth();
  const location = useLocation();

  if (status === 'checking') return <SessionSplash />;

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // Takes over every route — there is nothing useful to do until it is done.
  if (mustChangePassword) return <ForcePasswordChange />;

  return <Outlet />;
}

/** Inverse guard: keeps a signed-in user off the login screen. */
export function RedirectIfAuthenticated({ children }) {
  const { status, isAuthenticated } = useAuth();
  const location = useLocation();

  if (status === 'checking') return <SessionSplash />;
  if (isAuthenticated) {
    return <Navigate to={location.state?.from?.pathname || '/'} replace />;
  }
  return children;
}
