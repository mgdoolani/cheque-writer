/**
 * Payee entry: pick a saved one, or type a name that isn't in the book yet.
 *
 * The cheque stores the typed NAME regardless — a payee record can be renamed
 * or deactivated later, and the paper must keep saying what it said.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../Icon.jsx';

export default function PayeePicker({
  id,
  value,
  payeeId,
  payees,
  onChange,
  disabled,
  invalid,
}) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef(null);

  const matches = useMemo(() => {
    const term = value.trim().toLowerCase();
    const pool = payees.filter((p) => p.isActive);
    if (!term) return pool.slice(0, 8);
    return pool.filter((p) => p.name.toLowerCase().includes(term)).slice(0, 8);
  }, [payees, value]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const choose = (payee) => {
    onChange(payee.name, payee.id);
    setOpen(false);
  };

  const onKeyDown = (event) => {
    if (!open && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
      setOpen(true);
      return;
    }
    if (!open) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlight((h) => Math.min(h + 1, matches.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (event.key === 'Enter' && matches[highlight]) {
      event.preventDefault();
      choose(matches[highlight]);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  const selected = payees.find((p) => p.id === payeeId);
  const isNewName = value.trim() && !selected;

  return (
    <div className="picker" ref={wrapRef}>
      <div className="input-group">
        <input
          id={id}
          className={`input${invalid ? ' is-invalid' : ''}`}
          value={value}
          disabled={disabled}
          autoComplete="off"
          placeholder="Start typing a name…"
          onChange={(e) => {
            // Typing after picking someone breaks the link to that record.
            onChange(e.target.value, null);
            setHighlight(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
        />
        <button
          type="button"
          className="input-group__action"
          onClick={() => setOpen((v) => !v)}
          tabIndex={-1}
          aria-label="Show saved payees"
        >
          <Icon name={open ? 'expand_less' : 'expand_more'} size={19} />
        </button>
      </div>

      {open && matches.length > 0 && (
        <ul className="picker__list" role="listbox">
          {matches.map((payee, index) => (
            <li key={payee.id}>
              <button
                type="button"
                className={`picker__item${index === highlight ? ' is-active' : ''}`}
                onMouseEnter={() => setHighlight(index)}
                onClick={() => choose(payee)}
                role="option"
                aria-selected={index === highlight}
              >
                <span className="picker__name">{payee.name}</span>
                {payee.contact && <span className="subtle">{payee.contact}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected ? (
        <span className="field__hint">
          <Icon name="how_to_reg" size={13} /> Saved payee
          {selected.address ? ` · ${selected.address}` : ''}
        </span>
      ) : isNewName ? (
        <span className="field__hint">
          <Icon name="info" size={13} /> Not in the payee book — the cheque will
          still print this name.
        </span>
      ) : null}
    </div>
  );
}
