/**
 * Choose which OS printer a Printer Profile drives, from QZ Tray's own
 * enumeration — rather than inheriting whatever Chrome happens to default to.
 *
 * Degrades honestly: with no agent it explains that and offers a retry. There
 * is no fallback print path — QZ Tray is how cheques are printed.
 */

import { useEffect, useState } from 'react';
import Icon from '../Icon.jsx';
import useQzTray from '../../hooks/useQzTray.js';
import { defaultPrinter } from '../../lib/qzTray.js';

export default function QzPrinterPicker({ value, onChange, disabled }) {
  const qz = useQzTray();
  const [osDefault, setOsDefault] = useState(null);

  useEffect(() => {
    if (qz.available) defaultPrinter().then(setOsDefault).catch(() => {});
  }, [qz.available]);

  if (qz.checking) {
    return (
      <div className="field">
        <span className="field__label">Printer</span>
        <p className="field__hint"><span className="spinner" /> Looking for QZ Tray…</p>
      </div>
    );
  }

  if (!qz.available) {
    return (
      <div className="field">
        <span className="field__label">Printer</span>
        <div className="alert alert--info">
          <Icon name="info" size={18} />
          <span>
            QZ Tray isn&rsquo;t running on this computer, so printers can&rsquo;t
            be listed — and cheques can&rsquo;t be printed from here. Start QZ
            Tray, then press Check again.
            {value && (
              <>
                <br />
                This profile is set to <strong>{value}</strong>, which will be
                used on a machine that does have QZ Tray.
              </>
            )}
          </span>
        </div>
        <button type="button" className="btn" onClick={qz.refresh} disabled={disabled}>
          <Icon name="refresh" size={18} />
          Check again
        </button>
      </div>
    );
  }

  return (
    <div className="field">
      <label className="field__label" htmlFor="qz-printer">
        Printer <span className="subtle">(from QZ Tray)</span>
      </label>
      <select
        id="qz-printer"
        className="select"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      >
        <option value="">Not set — printing is unavailable until you choose one</option>
        {qz.printers.map((name) => (
          <option key={name} value={name}>
            {name}{name === osDefault ? '  (system default)' : ''}
          </option>
        ))}
      </select>
      <span className="field__hint">
        {value
          ? 'Cheques go straight to this printer at actual size, with no print dialog.'
          : 'A printer must be chosen before you can print.'}
      </span>
      {value && !qz.printers.includes(value) && (
        <span className="field__error">
          <Icon name="error" size={13} /> “{value}” isn&rsquo;t among the printers
          on this machine. It may exist on another workstation.
        </span>
      )}
    </div>
  );
}
