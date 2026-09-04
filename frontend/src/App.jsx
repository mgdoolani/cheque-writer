import { Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout.jsx';
import RequireAuth, { RedirectIfAuthenticated } from './auth/RequireAuth.jsx';
import { useAuth } from './auth/AuthProvider.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Payees from './pages/Payees.jsx';
import Templates from './pages/Templates.jsx';
import LayoutEditor from './pages/LayoutEditor.jsx';
import NewCheck from './pages/NewCheck.jsx';
import Settings from './pages/Settings.jsx';
import Cheques from './pages/Cheques.jsx';
import Reports from './pages/Reports.jsx';
import Audit from './pages/Audit.jsx';
import Users from './pages/Users.jsx';
import Printers from './pages/Printers.jsx';

/** The app shell, fed by the real signed-in user. */
function AuthenticatedShell() {
  const { user, signOut } = useAuth();
  return <AppLayout user={user} onSignOut={signOut} />;
}

/**
 * Route table. `/login` is the only public route; everything else sits behind
 * RequireAuth, which also diverts to the forced password-change screen when an
 * account is still on a temporary password.
 */
export default function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <RedirectIfAuthenticated>
            <Login />
          </RedirectIfAuthenticated>
        }
      />

      <Route element={<RequireAuth />}>
        <Route element={<AuthenticatedShell />}>
          <Route index element={<Dashboard />} />

          <Route path="cheques/new" element={<NewCheck />} />
          <Route path="cheques" element={<Cheques />} />
          <Route path="payees" element={<Payees />} />
          <Route path="reports" element={<Reports />} />
          <Route path="printers" element={<Printers />} />
          <Route path="templates" element={<Templates />} />
          <Route path="templates/:id/layout" element={<LayoutEditor />} />
          <Route path="settings" element={<Settings />} />
          <Route path="users" element={<Users />} />
          <Route path="audit" element={<Audit />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}
