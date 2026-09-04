import { useState } from 'react';
import { normaliseAmountInput, groupAmount, padAmount } from '../../lib/money.js';

/**
 * Comma-grouped amount entry. Grouping is applied as you type; the two-decimal
 * form is settled on blur so the cursor isn't dragged around mid-entry.
 */
export default function AmountInput({ id, value, onChange, disabled, invalid }) {
  const [focused, setFocused] = useState(false);

  return (
    <div className="amount-input">
      <span className="amount-input__prefix">₱</span>
      <input
        id={id}
        className={`input mono${invalid ? ' is-invalid' : ''}`}
        // A number input would reject the commas outright.
        inputMode="decimal"
        autoComplete="off"
        placeholder="0.00"
        value={value}
        disabled={disabled}
        onFocus={() => setFocused(true)}
        onChange={(e) => onChange(groupAmount(normaliseAmountInput(e.target.value)))}
        onBlur={() => {
          setFocused(false);
          onChange(padAmount(normaliseAmountInput(value)));
        }}
        aria-describedby={focused ? undefined : `${id}-hint`}
      />
    </div>
  );
}
