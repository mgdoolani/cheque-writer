/**
 * Dialog primitive: backdrop, Escape to close, focus moved in on open and
 * returned to the trigger on close, and a focus loop so Tab cannot wander onto
 * the page behind. Reused by every screen that edits a record.
 */

import { useCallback, useEffect, useRef } from 'react';
import Icon from './Icon.jsx';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = 460,
  // A forced dialog has no way out — no Escape, no backdrop click, no X.
  dismissible = true,
}) {
  const panelRef = useRef(null);
  const restoreFocusTo = useRef(null);

  const close = useCallback(() => {
    if (dismissible) onClose?.();
  }, [dismissible, onClose]);

  useEffect(() => {
    if (!open) return undefined;

    restoreFocusTo.current = document.activeElement;
    // Focus the first real control, not the panel itself.
    const first = panelRef.current?.querySelector(FOCUSABLE);
    (first || panelRef.current)?.focus();

    // The page behind must not scroll under the dialog.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close();
        return;
      }
      if (event.key !== 'Tab') return;

      const items = [...(panelRef.current?.querySelectorAll(FOCUSABLE) || [])];
      if (!items.length) return;

      const edge = event.shiftKey ? items[0] : items[items.length - 1];
      if (document.activeElement === edge) {
        event.preventDefault();
        (event.shiftKey ? items[items.length - 1] : items[0]).focus();
      }
    }

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      restoreFocusTo.current?.focus?.();
    };
  }, [open, close]);

  if (!open) return null;

  return (
    <div
      className="modal__backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <div
        className="modal card"
        style={{ maxWidth: width }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={panelRef}
        tabIndex={-1}
      >
        <div className="card__header">
          <div>
            <h3>{title}</h3>
            {description && (
              <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
                {description}
              </p>
            )}
          </div>
          {dismissible && (
            <button
              type="button"
              className="btn btn--ghost btn--icon"
              onClick={close}
              aria-label="Close"
            >
              <Icon name="close" size={20} />
            </button>
          )}
        </div>

        <div className="card__body">{children}</div>

        {footer && <div className="modal__footer">{footer}</div>}
      </div>
    </div>
  );
}
