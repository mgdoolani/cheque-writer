/**
 * Controls for a segmented-date field.
 *
 * Real cheque stock (Sterling Bank of Asia, among others) pre-prints the date
 * as individual character boxes with the dashes already on the paper:
 *   M M - D D - Y Y Y Y
 * The app fills digits only. Separators are never drawn.
 *
 * Only zero-padded numeric patterns are offered. "M/D/YYYY" yields six digits
 * in September and eight in December, so it can never map onto a fixed row of
 * boxes — word formats are excluded for the same reason.
 */

import { useState } from 'react';
import Icon from '../Icon.jsx';
import { digitCount, boxLabels, sampleDigits, buildSegmentBoxes } from '../../lib/dateSegments.js';
import { tidy } from '../../lib/units.js';

const DEFAULT_ARRANGE = {
  x: 120, y: 10, boxWidth: 4.5, boxHeight: 6, gap: 0.8, groupGap: 3.2,
};

function Num({ id, label, suffix, value, onChange, step = 0.5, min }) {
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label} {suffix && <span className="subtle">({suffix})</span>}
      </label>
      <input
        id={id}
        className="input"
        type="number"
        step={step}
        min={min}
        value={value}
        onChange={(e) => {
          const next = Number(e.target.value);
          if (Number.isFinite(next)) onChange(next);
        }}
      />
    </div>
  );
}

export default function SegmentedDatePanel({
  field,
  formats,
  selectedBoxIndex,
  onChange,
  onBoxChange,
}) {
  const [arrange, setArrange] = useState(() => {
    const first = field.boxes?.[0];
    return first
      ? { ...DEFAULT_ARRANGE, x: first.x, y: first.y, boxWidth: first.width, boxHeight: first.height }
      : DEFAULT_ARRANGE;
  });

  const expected = digitCount(field.datePattern);
  const actual = field.boxes?.length ?? 0;
  const mismatch = expected !== actual;

  const labels = boxLabels(field.datePattern);
  const digits = sampleDigits(field.datePattern);
  const box = selectedBoxIndex != null ? field.boxes?.[selectedBoxIndex] : null;

  /** Re-lay the whole row. Also the one-click fix for a count mismatch. */
  const regenerate = (pattern = field.datePattern, options = arrange) =>
    onChange({ boxes: buildSegmentBoxes(pattern, options) });

  const setArrangeValue = (key) => (value) => {
    const next = { ...arrange, [key]: value };
    setArrange(next);
    regenerate(field.datePattern, next);
  };

  return (
    <>
      <section>
        <h4 className="inspector__legend">Date format</h4>

        <div className="field">
          <label className="field__label" htmlFor="seg-pattern">
            Digit order pre-printed on the stock
          </label>
          <select
            id="seg-pattern"
            className="select"
            value={field.datePattern}
            onChange={(e) => {
              const pattern = e.target.value;
              // Changing the pattern changes the digit count, so rebuild the
              // row rather than leave a mismatch behind.
              onChange({ datePattern: pattern, boxes: buildSegmentBoxes(pattern, arrange) });
            }}
          >
            {formats.map((option) => (
              <option key={option.pattern} value={option.pattern}>
                {option.pattern} — {option.example} ({option.boxes} boxes)
              </option>
            ))}
          </select>
          <span className="field__hint">
            Numeric formats only. Word formats and unpadded ones can’t map to a
            fixed number of boxes.
          </span>
        </div>

        <div className={`segcount ${mismatch ? 'is-bad' : 'is-ok'}`}>
          <Icon name={mismatch ? 'error' : 'check_circle'} size={16} />
          <span>
            {mismatch ? (
              <>
                <strong>{actual} boxes</strong> positioned but{' '}
                <strong>{field.datePattern}</strong> needs <strong>{expected}</strong>.
                This layout cannot be saved while the field is on.
              </>
            ) : (
              <>
                <strong>{actual} boxes</strong> — matches {field.datePattern}.
              </>
            )}
          </span>
        </div>

        {mismatch && (
          <button
            type="button"
            className="btn btn--primary"
            style={{ width: '100%', marginTop: 'var(--sp-2)' }}
            onClick={() => regenerate()}
          >
            <Icon name="auto_fix_high" size={18} />
            Rebuild {expected} boxes
          </button>
        )}

        <div className="segpreview">
          {labels.map((meta, i) => (
            <span
              key={i}
              className={`segpreview__box seg-group${meta.groupIndex % 3}${
                selectedBoxIndex === i ? ' is-selected' : ''
              }`}
              title={`Box ${i + 1} — ${meta.token}`}
            >
              {digits[i]}
            </span>
          ))}
        </div>
        <p className="field__hint" style={{ textAlign: 'center' }}>
          Separators are pre-printed on the cheque — only these digits are drawn.
        </p>
      </section>

      {box && (
        <section>
          <h4 className="inspector__legend">
            Box {selectedBoxIndex + 1} of {actual} · {labels[selectedBoxIndex]?.token}
          </h4>
          <div className="form-grid">
            <Num id="sb-x" label="Left" suffix="mm" value={tidy(box.x)}
              onChange={(v) => onBoxChange(selectedBoxIndex, { x: v })} />
            <Num id="sb-y" label="Top" suffix="mm" value={tidy(box.y)}
              onChange={(v) => onBoxChange(selectedBoxIndex, { y: v })} />
            <Num id="sb-w" label="Width" suffix="mm" min={1.5} value={tidy(box.width)}
              onChange={(v) => onBoxChange(selectedBoxIndex, { width: v })} />
            <Num id="sb-h" label="Height" suffix="mm" min={1.5} value={tidy(box.height)}
              onChange={(v) => onBoxChange(selectedBoxIndex, { height: v })} />
          </div>
        </section>
      )}

      <section>
        <h4 className="inspector__legend">Arrange the whole row</h4>
        <p className="field__hint" style={{ marginBottom: 'var(--sp-3)' }}>
          Lays every box out evenly from a starting point. Each box stays
          independently positioned afterwards — drag any one on its own.
        </p>
        <div className="form-grid">
          <Num id="sa-x" label="Start left" suffix="mm" value={arrange.x}
            onChange={setArrangeValue('x')} />
          <Num id="sa-y" label="Start top" suffix="mm" value={arrange.y}
            onChange={setArrangeValue('y')} />
          <Num id="sa-w" label="Box width" suffix="mm" min={1.5} step={0.1}
            value={arrange.boxWidth} onChange={setArrangeValue('boxWidth')} />
          <Num id="sa-h" label="Box height" suffix="mm" min={1.5} step={0.1}
            value={arrange.boxHeight} onChange={setArrangeValue('boxHeight')} />
          <Num id="sa-g" label="Digit gap" suffix="mm" step={0.1} min={0}
            value={arrange.gap} onChange={setArrangeValue('gap')} />
          <Num id="sa-gg" label="Group gap" suffix="mm" step={0.1} min={0}
            value={arrange.groupGap} onChange={setArrangeValue('groupGap')} />
        </div>
      </section>
    </>
  );
}
