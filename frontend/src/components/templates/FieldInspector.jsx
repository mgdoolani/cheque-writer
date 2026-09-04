/**
 * Properties of the selected field. Numeric mm entry alongside dragging, per
 * the brief — typing 24.5 is often faster than nudging to it.
 */

import Icon from '../Icon.jsx';
import SegmentedDatePanel from './SegmentedDatePanel.jsx';
import { tidy } from '../../lib/units.js';

const ALIGNMENTS = [
  { value: 'left', icon: 'format_align_left', label: 'Left' },
  { value: 'center', icon: 'format_align_center', label: 'Centre' },
  { value: 'right', icon: 'format_align_right', label: 'Right' },
];

function NumberField({ id, label, suffix, value, onChange, step = 0.5, min, max }) {
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
        max={max}
        value={tidy(value)}
        onChange={(e) => {
          const next = Number(e.target.value);
          if (Number.isFinite(next)) onChange(next);
        }}
      />
    </div>
  );
}

export default function FieldInspector({
  field,
  fontFamilies,
  segmentedFormats = [],
  selectedBoxIndex = null,
  onChange,
  onBoxChange,
  onToggle,
}) {
  if (!field) {
    return (
      <div className="inspector">
        <div className="inspector__empty">
          <Icon name="ads_click" size={26} />
          <p className="muted">Select a field on the cheque to edit it.</p>
        </div>
      </div>
    );
  }

  const set = (key) => (value) => onChange({ [key]: value });
  const isText = field.type === 'text';
  const isSegmented = field.type === 'segmented_date';

  return (
    <div className="inspector">
      <div className="inspector__head">
        <div style={{ minWidth: 0 }}>
          <h3>{field.label}</h3>
          <p className="subtle mono">{field.key}</p>
        </div>
        <button
          type="button"
          className={`btn btn--icon ${field.enabled ? '' : 'btn--ghost'}`}
          onClick={() => onToggle(field.key, !field.enabled)}
          title={field.enabled ? 'Switch this field off' : 'Switch this field on'}
          aria-label={field.enabled ? 'Switch field off' : 'Switch field on'}
        >
          <Icon name={field.enabled ? 'visibility' : 'visibility_off'} size={19} />
        </button>
      </div>

      <div className="inspector__body">
        {!isSegmented && (
        <section>
          <h4 className="inspector__legend">Position &amp; size</h4>
          <div className="form-grid">
            <NumberField id="f-x" label="Left" suffix="mm" value={field.x} onChange={set('x')} />
            <NumberField id="f-y" label="Top" suffix="mm" value={field.y} onChange={set('y')} />
            <NumberField
              id="f-w" label="Width" suffix="mm" min={3}
              value={field.width} onChange={set('width')}
            />
            <NumberField
              id="f-h" label="Height" suffix="mm" min={3}
              value={field.height} onChange={set('height')}
            />
          </div>
        </section>
        )}

        {isSegmented && (
          <SegmentedDatePanel
            field={field}
            formats={segmentedFormats}
            selectedBoxIndex={selectedBoxIndex}
            onChange={onChange}
            onBoxChange={onBoxChange}
          />
        )}

        {(isText || isSegmented) && (
          <section>
            <h4 className="inspector__legend">{isSegmented ? 'Digits' : 'Text'}</h4>
            <div className="form-grid">
              <div className="field">
                <label className="field__label" htmlFor="f-font">Font</label>
                <select
                  id="f-font"
                  className="select"
                  value={field.fontFamily}
                  onChange={(e) => set('fontFamily')(e.target.value)}
                >
                  {fontFamilies.map((family) => (
                    <option key={family} value={family}>
                      {family === 'Times-Roman' ? 'Times' : family}
                    </option>
                  ))}
                </select>
              </div>

              <NumberField
                id="f-size" label="Size" suffix="pt" step={0.5} min={4} max={48}
                value={field.fontSize} onChange={set('fontSize')}
              />

              {!isSegmented && (
              <div className="field field--full">
                <span className="field__label">Alignment</span>
                <div className="segmented">
                  {ALIGNMENTS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={field.align === option.value ? 'is-active' : ''}
                      onClick={() => set('align')(option.value)}
                      title={option.label}
                      aria-pressed={field.align === option.value}
                    >
                      <Icon name={option.icon} size={18} />
                    </button>
                  ))}
                </div>
              </div>
              )}

              <div className="field field--full">
                <span className="field__label">Style</span>
                <div className="row">
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={field.bold}
                      onChange={(e) => set('bold')(e.target.checked)}
                    />
                    Bold
                  </label>
                  {!isSegmented && (
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={field.uppercase}
                        onChange={(e) => set('uppercase')(e.target.checked)}
                      />
                      UPPERCASE
                    </label>
                  )}
                </div>
              </div>

              {!isSegmented && (
                <>
                  <NumberField
                    id="f-lines" label="Max lines" step={1} min={1} max={4}
                    value={field.maxLines} onChange={set('maxLines')}
                  />
                  <NumberField
                    id="f-gap" label="Line gap" suffix="pt" step={0.5} min={0}
                    value={field.lineGap} onChange={set('lineGap')}
                  />
                </>
              )}
            </div>
            {field.key === 'amount_words' && field.maxLines === 1 && (
              <p className="field__hint">
                <Icon name="info" size={13} /> Long amounts in words often need
                two lines. Raise this if wording gets clipped.
              </p>
            )}
          </section>
        )}

        {field.type === 'crossing' && (
          <section>
            <h4 className="inspector__legend">Crossing</h4>
            <div className="stack">
              <div className="field">
                <label className="field__label" htmlFor="f-crosstext">
                  Caption between the lines
                </label>
                <input
                  id="f-crosstext"
                  className="input"
                  value={field.crossingText || ''}
                  onChange={(e) => set('crossingText')(e.target.value)}
                  placeholder="A/C PAYEE ONLY"
                />
              </div>
              <NumberField
                id="f-crossw" label="Line thickness" suffix="mm" step={0.1} min={0.1}
                value={field.crossingLineWidth} onChange={set('crossingLineWidth')}
              />
            </div>
          </section>
        )}

        {field.type === 'image' && (
          <div className="alert alert--info">
            <Icon name="info" size={18} />
            <span>
              This box is where the signature image is drawn. Upload the image
              in the panel on the left.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
