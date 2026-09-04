/**
 * The positioning surface.
 *
 * The reference scan is shown stretched to exactly the cheque rectangle — it is
 * a tracing guide and NOTHING MORE. It is never sent to the printer; the PDF
 * renderer draws text only. Losing that distinction would put a picture of a
 * cheque on top of real bank stock, so it is worth being blunt about.
 *
 * All geometry is millimetres. `scale` (px per mm) is the only bridge to the
 * screen, and it is applied at the last possible moment.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { MM_PER_PT, snap, tidy, clamp } from '../../lib/units.js';
import { boxLabels, sampleDigits } from '../../lib/dateSegments.js';

/** What each field shows on the canvas, so the box isn't an empty rectangle. */
const SAMPLES = {
  date: '09/05/2025',
  payee: 'SAN MIGUEL CORPORATION',
  amount_numeric: '1,500.00',
  amount_words: 'One Thousand Five Hundred Pesos Only',
  memo: 'August billing',
  account_payee: 'ACCOUNT PAYEE ONLY',
  signature: 'Signature',
};

const NUDGE_MM = 0.5;
const NUDGE_FINE_MM = 0.1;
const NUDGE_COARSE_MM = 5;

const HANDLES = ['e', 's', 'se'];

/**
 * One draggable, resizable, keyboard-nudgeable rectangle in millimetre space.
 * Shared by ordinary fields and by the individual digit boxes of a segmented
 * date, so both behave identically — same snap, same nudge, same handles.
 */
function PositionBox({
  rect,
  scale,
  bounds,
  selected,
  onSelect,
  onChange,
  className = '',
  tag,
  ariaLabel,
  children,
}) {
  const drag = useRef(null);

  const beginDrag = (event, mode) => {
    event.preventDefault();
    event.stopPropagation();
    onSelect();

    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = {
      mode,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin: { ...rect },
    };
  };

  const onPointerMove = (event) => {
    const state = drag.current;
    if (!state || state.pointerId !== event.pointerId) return;

    // Shift = fine control. Everything else lands on a 0.5mm grid.
    const step = event.shiftKey ? NUDGE_FINE_MM : NUDGE_MM;
    const dxMm = (event.clientX - state.startX) / scale;
    const dyMm = (event.clientY - state.startY) / scale;
    const { origin } = state;

    if (state.mode === 'move') {
      onChange({
        x: clamp(snap(origin.x + dxMm, step), -10, bounds.width + 10),
        y: clamp(snap(origin.y + dyMm, step), -10, bounds.height + 10),
      });
      return;
    }

    const patch = {};
    if (state.mode.includes('e')) {
      patch.width = clamp(snap(origin.width + dxMm, step), 1.5, bounds.width + 20);
    }
    if (state.mode.includes('s')) {
      patch.height = clamp(snap(origin.height + dyMm, step), 1.5, bounds.height + 20);
    }
    onChange(patch);
  };

  const endDrag = (event) => {
    if (drag.current?.pointerId === event.pointerId) drag.current = null;
  };

  const onKeyDown = (event) => {
    const step = event.shiftKey
      ? NUDGE_FINE_MM
      : event.ctrlKey || event.metaKey
        ? NUDGE_COARSE_MM
        : NUDGE_MM;

    const moves = {
      ArrowLeft: { x: -step },
      ArrowRight: { x: step },
      ArrowUp: { y: -step },
      ArrowDown: { y: step },
    };
    const move = moves[event.key];
    if (!move) return;

    event.preventDefault();
    onChange({
      x: 'x' in move ? clamp(tidy(rect.x + move.x), -10, bounds.width + 10) : rect.x,
      y: 'y' in move ? clamp(tidy(rect.y + move.y), -10, bounds.height + 10) : rect.y,
    });
  };

  return (
    <div
      className={`fbox ${className}${selected ? ' is-selected' : ''}`}
      style={{
        left: `${rect.x * scale}px`,
        top: `${rect.y * scale}px`,
        width: `${rect.width * scale}px`,
        height: `${rect.height * scale}px`,
      }}
      onPointerDown={(e) => beginDrag(e, 'move')}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
      onFocus={onSelect}
      tabIndex={0}
      role="button"
      aria-label={ariaLabel}
    >
      {tag && <span className="fbox__tag">{tag}</span>}
      {children}

      {selected &&
        HANDLES.map((handle) => (
          <span
            key={handle}
            className={`fbox__handle fbox__handle--${handle}`}
            onPointerDown={(e) => beginDrag(e, handle)}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          />
        ))}
    </div>
  );
}

/** CSS font stack matching the PDF's base-14 choice. */
const fontStack = (family) =>
  family === 'Courier'
    ? 'var(--font-mono)'
    : family === 'Times-Roman'
      ? 'Georgia, "Times New Roman", serif'
      : 'Helvetica, Arial, sans-serif';

export default function EditorCanvas({
  template,
  fields,
  selection,
  onSelect,
  onFieldChange,
  onBoxChange,
  referenceUrl,
  showGrid,
  showReference,
  zoom,
}) {
  const wrapRef = useRef(null);
  const [fitScale, setFitScale] = useState(2);

  const { checkWidthMm: W, checkHeightMm: H } = template;
  const bounds = { width: W, height: H };

  const measure = useCallback(() => {
    const available = wrapRef.current?.clientWidth;
    if (available) setFitScale((available - 32) / W);
  }, [W]);

  useEffect(() => {
    measure();
    const observer = new ResizeObserver(measure);
    if (wrapRef.current) observer.observe(wrapRef.current);
    return () => observer.disconnect();
  }, [measure]);

  const scale = fitScale * zoom;

  const renderField = (field) => {
    // ── Segmented date: one independently positioned box per digit ──────────
    if (field.type === 'segmented_date') {
      const labels = boxLabels(field.datePattern);
      const digits = sampleDigits(field.datePattern);

      return (field.boxes || []).map((box, index) => {
        const meta = labels[index];
        return (
          <PositionBox
            key={`${field.key}-${index}`}
            rect={box}
            scale={scale}
            bounds={bounds}
            selected={selection.key === field.key && selection.boxIndex === index}
            onSelect={() => onSelect(field.key, index)}
            onChange={(patch) => onBoxChange(field.key, index, patch)}
            className={`fbox--segment fbox--group${(meta?.groupIndex ?? 0) % 3}${
              meta?.first ? ' is-group-start' : ''
            }`}
            tag={meta?.first ? meta.token : null}
            ariaLabel={`${field.label} box ${index + 1} of ${
              (field.boxes || []).length
            }, ${meta?.token || ''}`}
          >
            <span
              className="fbox__digit"
              style={{
                fontSize: `${field.fontSize * MM_PER_PT * scale}px`,
                fontFamily: fontStack(field.fontFamily),
                fontWeight: field.bold ? 700 : 400,
              }}
            >
              {digits[index] ?? ''}
            </span>
          </PositionBox>
        );
      });
    }

    // ── Everything else: a single box ───────────────────────────────────────
    const selected = selection.key === field.key && selection.boxIndex === null;

    return (
      <PositionBox
        key={field.key}
        rect={field}
        scale={scale}
        bounds={bounds}
        selected={selected}
        onSelect={() => onSelect(field.key, null)}
        onChange={(patch) => onFieldChange(field.key, patch)}
        className={`fbox--${field.type}`}
        tag={field.label}
        ariaLabel={`${field.label}, ${tidy(field.x)} by ${tidy(field.y)} millimetres`}
      >
        {field.type === 'text' && (
          <span
            className="fbox__text"
            style={{
              fontSize: `${field.fontSize * MM_PER_PT * scale}px`,
              fontFamily: fontStack(field.fontFamily),
              fontWeight: field.bold ? 700 : 400,
              justifyContent:
                field.align === 'right'
                  ? 'flex-end'
                  : field.align === 'center'
                    ? 'center'
                    : 'flex-start',
              textTransform: field.uppercase ? 'uppercase' : 'none',
            }}
          >
            {SAMPLES[field.key] || field.label}
          </span>
        )}

        {field.type === 'crossing' && (
          <svg className="fbox__crossing" viewBox="0 0 100 100" preserveAspectRatio="none">
            <line x1="0" y1="100" x2="67" y2="0" />
            <line x1="33" y1="100" x2="100" y2="0" />
          </svg>
        )}

        {field.type === 'image' && (
          <span className="fbox__image"><span>Signature image</span></span>
        )}
      </PositionBox>
    );
  };

  return (
    <div className="canvas-wrap" ref={wrapRef}>
      <div className="canvas-scroll">
        <div
          className="ruler ruler--top"
          style={{ width: `${W * scale}px`, marginLeft: '22px' }}
        >
          {Array.from({ length: Math.floor(W / 10) + 1 }, (_, i) => (
            <span key={i} style={{ left: `${i * 10 * scale}px` }}>{i * 10}</span>
          ))}
        </div>

        <div className="canvas-row">
          <div className="ruler ruler--left" style={{ height: `${H * scale}px` }}>
            {Array.from({ length: Math.floor(H / 10) + 1 }, (_, i) => (
              <span key={i} style={{ top: `${i * 10 * scale}px` }}>{i * 10}</span>
            ))}
          </div>

          <div
            className="sheet"
            style={{ width: `${W * scale}px`, height: `${H * scale}px` }}
            onPointerDown={() => onSelect(null, null)}
          >
            {referenceUrl && showReference && (
              <img className="sheet__reference" src={referenceUrl} alt="" draggable={false} />
            )}

            {showGrid && (
              <div
                className="sheet__grid"
                style={{ backgroundSize: `${5 * scale}px ${5 * scale}px` }}
              />
            )}

            {fields.filter((field) => field.enabled).map(renderField)}
          </div>
        </div>
      </div>

      <p className="canvas-hint subtle">
        Drag a box to move it. Arrow keys nudge by 0.5&nbsp;mm — hold
        <kbd>Shift</kbd> for 0.1&nbsp;mm, <kbd>Ctrl</kbd> for 5&nbsp;mm. Drag the
        square handles to resize.
      </p>
    </div>
  );
}
