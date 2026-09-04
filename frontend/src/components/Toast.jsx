/**
 * Transient confirmations ("Payee saved"). Deliberately not used for errors
 * that need a decision — those belong inline in the form that caused them.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import Icon from './Icon.jsx';

const ToastContext = createContext(null);

const ICONS = { success: 'check_circle', danger: 'error', info: 'info' };
const DISMISS_AFTER = 4000;

function Toast({ toast, onDismiss }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, DISMISS_AFTER);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div className={`toast toast--${toast.tone}`} role="status">
      <Icon name={ICONS[toast.tone]} size={19} />
      <span>{toast.message}</span>
      <button
        type="button"
        className="toast__close"
        onClick={onDismiss}
        aria-label="Dismiss"
      >
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((message, tone = 'success') => {
    const id = nextId.current;
    nextId.current += 1;
    setToasts((current) => [...current, { id, message, tone }]);
  }, []);

  const value = useMemo(
    () => ({
      toast: push,
      success: (message) => push(message, 'success'),
      error: (message) => push(message, 'danger'),
      info: (message) => push(message, 'info'),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts">
        {toasts.map((toast) => (
          <Toast key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>');
  return context;
}
