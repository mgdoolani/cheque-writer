/**
 * Crop and straighten a reference scan before it is saved.
 *
 * This exists because of a real failure: a Sterling scan that was cropped short
 * at the top was accepted, stretched to fill the declared cheque outline, and
 * every field traced over it came out ~3mm high — by an amount that varied down
 * the page, so no printer calibration could fix it. Nobody found out until
 * cheques printed wrong.
 *
 * So the checks that used to run after upload run HERE, live, while the crop is
 * being adjusted. The user sees what the current crop implies about the cheque
 * before committing to it.
 *
 * The suggested crop box is a convenience only. It is an obvious starting
 * rectangle the user drags, and nothing is saved until they press Confirm.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Modal from '../Modal.jsx';
import Icon from '../Icon.jsx';
import {
  rotatedBounds, renderRotated, guessContentBox, exportCropped, croppedPixelSize,
} from '../../lib/imageCrop.js';
import { imageDpi } from '../../lib/units.js';

const PREVIEW_MAX = 620;
const FULL_BOX = { x: 0, y: 0, width: 1, height: 1 };
const HANDLES = ['nw', 'ne', 'sw', 'se'];

export default function ImageCropDialog({
  open, file, template, minDpi = 200, goodDpi = 300, onCancel, onConfirm,
}) {
  const [img, setImg] = useState(null);
  const [rotation, setRotation] = useState(0);
  const [box, setBox] = useState(FULL_BOX);
  const [suggested, setSuggested] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const canvasRef = useRef(null);
  const frameRef = useRef(null);
  const drag = useRef(null);

  // ── Load the chosen file ──────────────────────────────────────────────────
  useEffect(() => {
    if (!open || !file) return undefined;
    setImg(null); setRotation(0); setBox(FULL_BOX);
    setSuggested(null); setError(null); setBusy(false);

    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => setImg(image);
    image.onerror = () => setError('That file could not be read as an image.');
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [open, file]);

  // ── Suggest a starting rectangle once the image is in ─────────────────────
  useEffect(() => {
    if (!img) return;
    try {
      const guess = guessContentBox(renderRotated(img, 0, 1));
      const isWhole = guess.width > 0.98 && guess.height > 0.98;
      setSuggested(isWhole ? null : guess);
      if (!isWhole) setBox(guess);
    } catch {
      setSuggested(null);
    }
  }, [img]);

  // ── Draw the rotated preview ──────────────────────────────────────────────
  const preview = useMemo(() => {
    if (!img) return null;
    const bounds = rotatedBounds(img.naturalWidth, img.naturalHeight, rotation);
    const scale = Math.min(PREVIEW_MAX / bounds.width, 380 / bounds.height, 1);
    return { ...bounds, scale, w: bounds.width * scale, h: bounds.height * scale };
  }, [img, rotation]);

  useEffect(() => {
    if (!img || !preview || !canvasRef.current) return;
    const rendered = renderRotated(img, rotation, preview.scale);
    const canvas = canvasRef.current;
    canvas.width = rendered.width;
    canvas.height = rendered.height;
    canvas.getContext('2d').drawImage(rendered, 0, 0);
  }, [img, rotation, preview]);

  // ── Dragging the box and its corners ──────────────────────────────────────
  const begin = (event, mode) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = { mode, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, origin: { ...box } };
  };

  const move = (event) => {
    const state = drag.current;
    if (!state || state.pointerId !== event.pointerId || !preview) return;

    const dx = (event.clientX - state.startX) / preview.w;
    const dy = (event.clientY - state.startY) / preview.h;
    const o = state.origin;
    const MIN = 0.05;
    const clamp01 = (v) => Math.min(Math.max(v, 0), 1);

    if (state.mode === 'move') {
      setBox({
        ...o,
        x: clamp01(Math.min(o.x + dx, 1 - o.width)),
        y: clamp01(Math.min(o.y + dy, 1 - o.height)),
      });
      return;
    }

    const next = { ...o };
    if (state.mode.includes('w')) {
      const x = clamp01(Math.min(o.x + dx, o.x + o.width - MIN));
      next.width = o.width + (o.x - x);
      next.x = x;
    }
    if (state.mode.includes('e')) {
      next.width = Math.min(clamp01(o.width + dx), 1 - o.x);
      if (next.width < MIN) next.width = MIN;
    }
    if (state.mode.includes('n')) {
      const y = clamp01(Math.min(o.y + dy, o.y + o.height - MIN));
      next.height = o.height + (o.y - y);
      next.y = y;
    }
    if (state.mode.includes('s')) {
      next.height = Math.min(clamp01(o.height + dy), 1 - o.y);
      if (next.height < MIN) next.height = MIN;
    }
    setBox(next);
  };

  const end = (event) => {
    if (drag.current?.pointerId === event.pointerId) drag.current = null;
  };

  // ── Live validation: exactly the checks the server will run ───────────────
  const check = useMemo(() => {
    if (!img || !template) return null;
    const size = croppedPixelSize(img, rotation, box);
    const declaredW = template.checkWidthMm;
    const declaredH = template.checkHeightMm;
    const dpi = imageDpi(size.width, declaredW);
    const impliedHeightMm = size.height * (declaredW / size.width);
    const differenceMm = declaredH - impliedHeightMm;

    return {
      ...size,
      dpi,
      impliedHeightMm,
      differenceMm,
      tooCoarse: dpi < minDpi,
      lowDpi: dpi < goodDpi,
      mismatched: Math.abs(differenceMm) > 1,
    };
  }, [img, rotation, box, template, minDpi, goodDpi]);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const { blob, width, height } = await exportCropped(img, rotation, box);
      const name = (file?.name || 'reference').replace(/\.[^.]+$/, '');
      onConfirm(new File([blob], `${name}-cropped.jpg`, { type: 'image/jpeg' }), { width, height });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <Modal
      open
      onClose={busy ? undefined : onCancel}
      dismissible={!busy}
      title="Crop and straighten the scan"
      description="Trim to the cheque's edges so positions traced over it are true."
      width={720}
    >
      <div className="stack">
        {error && (
          <div className="alert alert--danger" role="alert">
            <Icon name="error" size={18} /><span>{error}</span>
          </div>
        )}

        {!img ? (
          <div className="splash" style={{ minHeight: 200 }}>
            <span className="spinner" /><span className="muted">Loading the image…</span>
          </div>
        ) : (
          <>
            <div className="cropstage">
              <div
                className="cropframe"
                ref={frameRef}
                style={{ width: preview.w, height: preview.h }}
              >
                <canvas ref={canvasRef} className="cropcanvas" />

                {/* Everything outside the box, dimmed. */}
                <div className="cropmask" style={{
                  clipPath: `polygon(0% 0%, 0% 100%, ${box.x * 100}% 100%, ${box.x * 100}% ${box.y * 100}%, ${(box.x + box.width) * 100}% ${box.y * 100}%, ${(box.x + box.width) * 100}% ${(box.y + box.height) * 100}%, ${box.x * 100}% ${(box.y + box.height) * 100}%, ${box.x * 100}% 100%, 100% 100%, 100% 0%)`,
                }} />

                <div
                  className="cropbox"
                  style={{
                    left: `${box.x * 100}%`, top: `${box.y * 100}%`,
                    width: `${box.width * 100}%`, height: `${box.height * 100}%`,
                  }}
                  onPointerDown={(e) => begin(e, 'move')}
                  onPointerMove={move}
                  onPointerUp={end}
                  onPointerCancel={end}
                >
                  {HANDLES.map((h) => (
                    <span
                      key={h}
                      className={`crophandle crophandle--${h}`}
                      onPointerDown={(e) => begin(e, h)}
                      onPointerMove={move}
                      onPointerUp={end}
                      onPointerCancel={end}
                    />
                  ))}
                </div>
              </div>
            </div>

            {suggested && (
              <div className="alert alert--info">
                <Icon name="auto_fix_high" size={18} />
                <span>
                  The edges below are a <strong>suggestion</strong> from a quick
                  scan of the image — check them against the cheque&rsquo;s real
                  corners and drag as needed. Nothing is saved until you confirm.
                </span>
                <button type="button" className="btn btn--ghost"
                  onClick={() => setBox(suggested)}>
                  Re-apply
                </button>
              </div>
            )}

            <div className="form-grid">
              <div className="field field--full">
                <label className="field__label" htmlFor="crop-rot">
                  Straighten <span className="subtle">({rotation.toFixed(1)}°)</span>
                </label>
                <input
                  id="crop-rot"
                  type="range"
                  min="-15" max="15" step="0.1"
                  value={rotation}
                  onChange={(e) => setRotation(Number(e.target.value))}
                  className="slider"
                />
                <div className="row" style={{ flexWrap: 'wrap' }}>
                  <button type="button" className="btn" onClick={() => setRotation(0)}>
                    <Icon name="restart_alt" size={17} /> 0°
                  </button>
                  <button type="button" className="btn"
                    onClick={() => setRotation((r) => Math.round((r - 90) * 10) / 10)}>
                    <Icon name="rotate_left" size={17} /> 90° left
                  </button>
                  <button type="button" className="btn"
                    onClick={() => setRotation((r) => Math.round((r + 90) * 10) / 10)}>
                    <Icon name="rotate_right" size={17} /> 90° right
                  </button>
                  <div className="spacer" />
                  <button type="button" className="btn btn--ghost" onClick={() => setBox(FULL_BOX)}>
                    Whole image
                  </button>
                </div>
              </div>
            </div>

            {/* The same validation the server applies, run continuously so a
                bad crop is obvious here rather than three screens later. */}
            {check && (
              <div className={`cropcheck ${
                check.tooCoarse ? 'is-bad' : check.mismatched || check.lowDpi ? 'is-warn' : 'is-ok'
              }`}>
                <dl>
                  <div>
                    <dt>Cropped size</dt>
                    <dd className="mono">{check.width} × {check.height} px</dd>
                  </div>
                  <div>
                    <dt>Resolution</dt>
                    <dd className="mono">
                      {check.dpi.toFixed(0)} DPI
                      {check.tooCoarse ? ' — too coarse'
                        : check.lowDpi ? ` — below ${goodDpi}` : ''}
                    </dd>
                  </div>
                  <div>
                    <dt>Covers</dt>
                    <dd className="mono">{check.impliedHeightMm.toFixed(2)} mm tall</dd>
                  </div>
                  <div>
                    <dt>Cheque is set to</dt>
                    <dd className="mono">{template.checkHeightMm} mm</dd>
                  </div>
                </dl>
                <p>
                  {check.tooCoarse ? (
                    <><Icon name="error" size={15} /> Too coarse to position against at{' '}
                      {template.checkWidthMm}&nbsp;mm wide. Rescan at {goodDpi}&nbsp;DPI or higher.</>
                  ) : check.mismatched ? (
                    <><Icon name="warning" size={15} /> This crop is{' '}
                      <strong>{Math.abs(check.differenceMm).toFixed(2)}&nbsp;mm{' '}
                      {check.differenceMm > 0 ? 'short of' : 'taller than'}</strong> the
                      declared cheque height. It will be stretched to fit, and fields
                      traced over it will drift by a growing amount down the page.
                      Adjust the top and bottom edges, or correct the cheque height.</>
                  ) : (
                    <><Icon name="check_circle" size={15} /> This crop matches the
                      declared cheque size. Positions traced over it will be true.</>
                  )}
                </p>
              </div>
            )}
          </>
        )}

        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary"
            onClick={confirm} disabled={busy || !img || check?.tooCoarse}>
            {busy ? <span className="spinner" /> : <Icon name="crop" size={18} />}
            Confirm &amp; upload
          </button>
        </div>
      </div>
    </Modal>
  );
}
