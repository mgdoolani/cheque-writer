/**
 * Day / night mode (Section 11).
 *
 * Three preferences — light, dark, system. "system" is resolved here rather
 * than in CSS so that `data-theme` on <html> is always a concrete value and
 * component CSS never needs a media query.
 *
 * Persistence is two-layer: localStorage always (instant, survives logout) and
 * the user record when someone is signed in, which is what makes the preference
 * follow them to another machine. The API call is best-effort — a 401 before
 * login is expected and ignored.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client.js';

const STORAGE_KEY = 'phcheck.theme';
const PREFERENCES = ['light', 'dark', 'system'];

const ThemeContext = createContext(null);

const prefersDark = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-color-scheme: dark)').matches;

function readStored() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return PREFERENCES.includes(value) ? value : 'system';
  } catch {
    return 'system';
  }
}

const resolve = (preference) =>
  preference === 'system' ? (prefersDark() ? 'dark' : 'light') : preference;

export function ThemeProvider({ children }) {
  const [preference, setPreference] = useState(readStored);
  const [resolved, setResolved] = useState(() => resolve(readStored()));

  // Paint the resolved theme onto <html> for the CSS tokens to key off.
  useEffect(() => {
    const next = resolve(preference);
    setResolved(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      // Private browsing / storage disabled — the in-memory theme still works.
    }
  }, [preference]);

  // Follow the OS while the preference is "system".
  useEffect(() => {
    if (preference !== 'system') return undefined;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      const next = prefersDark() ? 'dark' : 'light';
      setResolved(next);
      document.documentElement.dataset.theme = next;
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [preference]);

  /** Change the preference and try to persist it against the signed-in user. */
  const setTheme = useCallback((next) => {
    if (!PREFERENCES.includes(next)) return;
    setPreference(next);
    api.patch('/auth/me/theme', { theme: next }).catch(() => {
      // Not signed in yet, or offline. localStorage already has it.
    });
  }, []);

  /** Adopt the theme stored on a user record, called just after sign-in. */
  const adoptUserTheme = useCallback((next) => {
    if (PREFERENCES.includes(next)) setPreference(next);
  }, []);

  /** Light -> dark -> system -> light. */
  const cycleTheme = useCallback(() => {
    setTheme(PREFERENCES[(PREFERENCES.indexOf(preference) + 1) % PREFERENCES.length]);
  }, [preference, setTheme]);

  const value = useMemo(
    () => ({ preference, resolved, setTheme, cycleTheme, adoptUserTheme }),
    [preference, resolved, setTheme, cycleTheme, adoptUserTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside <ThemeProvider>');
  return context;
}
