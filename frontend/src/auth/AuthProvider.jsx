/**
 * Signed-in state for the whole app.
 *
 * The session itself is an httpOnly cookie the browser holds — there is no
 * token here to store or refresh. This context only mirrors *who* that cookie
 * belongs to, so the UI can show a name, gate admin-only navigation and react
 * when the session ends.
 *
 * The server re-checks the role on every request; hiding a link is a courtesy,
 * never the security boundary.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { api, setUnauthorizedHandler } from '../api/client.js';
import { useTheme } from '../theme/ThemeProvider.jsx';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // 'checking' until the initial session probe answers, so the login screen
  // never flashes for someone who is already signed in.
  const [status, setStatus] = useState('checking');
  const { adoptUserTheme } = useTheme();

  const applyUser = useCallback(
    (next) => {
      setUser(next);
      setStatus(next ? 'authenticated' : 'anonymous');
      // The stored preference travels with the account, so signing in on a
      // different machine brings your theme with you.
      if (next?.theme) adoptUserTheme(next.theme);
    },
    [adoptUserTheme],
  );

  // Is there already a valid session cookie?
  useEffect(() => {
    let cancelled = false;

    api
      .get('/auth/me', { skipAuthRedirect: true })
      .then((data) => {
        if (!cancelled) applyUser(data.user);
      })
      .catch(() => {
        if (!cancelled) applyUser(null);
      });

    return () => {
      cancelled = true;
    };
  }, [applyUser]);

  // A 401 from anywhere else means the session lapsed while the tab sat open.
  useEffect(() => {
    setUnauthorizedHandler(() => setUser((current) => (current ? null : current)));
    return () => setUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    if (status === 'authenticated' && !user) setStatus('anonymous');
  }, [status, user]);

  const signIn = useCallback(
    async (username, password) => {
      const data = await api.post(
        '/auth/login',
        { username, password },
        { skipAuthRedirect: true },
      );
      applyUser(data.user);
      return data.user;
    },
    [applyUser],
  );

  /** Set this account's own printer (per-desk, not shared). */
  const setPrinter = useCallback(async (qzPrinterName) => {
    const data = await api.patch('/auth/me/printer', { qzPrinterName });
    setUser((current) => ({ ...current, qzPrinterName: data.qzPrinterName }));
    return data.qzPrinterName;
  }, []);

  /** Merge a fresh user record in, e.g. after a password change clears a flag. */
  const updateUser = useCallback((next) => {
    setUser((current) => ({ ...current, ...next }));
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Already expired server-side — clearing locally is still correct.
    }
    applyUser(null);
  }, [applyUser]);

  const value = useMemo(
    () => ({
      user,
      status,
      isAuthenticated: Boolean(user),
      isAdmin: user?.role === 'admin',
      // True while the account is still on a shipped default password. The
      // server enforces this too — the UI gate is only the friendly half.
      mustChangePassword: Boolean(user?.mustChangePassword),
      // Where THIS person's print jobs go, from their own machine.
      qzPrinterName: user?.qzPrinterName || '',
      signIn,
      signOut,
      updateUser,
      setPrinter,
    }),
    [user, status, signIn, signOut, updateUser, setPrinter],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
