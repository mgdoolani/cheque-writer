/**
 * The visual layout editor (Section 2).
 *
 * Locked behaviour this screen implements:
 *   - Coordinates are stored in MILLIMETRES, with font settings alongside.
 *     Nothing pixel-based is ever persisted.
 *   - The reference scan is a positioning aid shown only here. It is never part
 *     of printed output.
 *   - Positioning is a ONE-TIME setup per bank: save once and every future
 *     cheque for that template reuses these coordinates automatically.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useBeforeUnload, useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { useToast } from '../components/Toast.jsx';
import Icon from '../components/Icon.jsx';
import { digitCount } from '../lib/dateSegments.js';
import EditorCanvas from '../components/templates/EditorCanvas.jsx';
import FieldInspector from '../components/templates/FieldInspector.jsx';
import ReferencePanel from '../components/templates/ReferencePanel.jsx';

const ZOOM_STEPS = [0.5, 0.75, 1, 1.5, 2, 3];

export default function LayoutEditor() {
  const { id } = useParams();
  const { isAdmin } = useAuth();
  const toast = useToast();

  const [template, setTemplate] = useState(null);
  const [meta, setMeta] = useState(null);
  const [fields, setFields] = useState([]);
  const [savedFields, setSavedFields] = useState([]);

  // `boxIndex` is non-null only when a digit box of a segmented date is picked.
  const [selection, setSelection] = useState({ key: null, boxIndex: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const [zoomIndex, setZoomIndex] = useState(2);
  const [showGrid, setShowGrid] = useState(true);
  const [showReference, setShowReference] = useState(true);

  // Bumped after an upload so the <img> refetches instead of using its cache.
  const [imageVersion, setImageVersion] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [templateData, metaData] = await Promise.all([
        api.get(`/templates/${id}`),
        api.get('/templates/meta'),
      ]);
      setTemplate(templateData.template);
      setMeta(metaData);
      setFields(templateData.template.fields || []);
      setSavedFields(templateData.template.fields || []);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const dirty = useMemo(
    () => JSON.stringify(fields) !== JSON.stringify(savedFields),
    [fields, savedFields],
  );

  // Browser-level guard. In-app navigation is covered by the banner below.
  useBeforeUnload(
    useCallback(
      (event) => {
        if (dirty) event.preventDefault();
      },
      [dirty],
    ),
  );

  const select = useCallback((key, boxIndex = null) => {
    setSelection({ key, boxIndex });
  }, []);

  /** Patch one digit box of a segmented-date field. */
  const updateBox = useCallback((key, index, patch) => {
    setFields((current) =>
      current.map((field) => {
        if (field.key !== key) return field;
        const boxes = (field.boxes || []).map((box, i) =>
          i === index ? { ...box, ...patch } : box,
        );
        return { ...field, boxes };
      }),
    );
  }, []);

  const updateField = useCallback((key, patch) => {
    setFields((current) =>
      current.map((field) => (field.key === key ? { ...field, ...patch } : field)),
    );
  }, []);

  const toggleField = useCallback((key, enabled) => {
    setFields((current) =>
      current.map((field) => (field.key === key ? { ...field, enabled } : field)),
    );
  }, []);

  async function handleSave() {
    // Mirror the server's rule so the user gets a specific message rather than
    // a bounced request: an enabled segmented date must have one box per digit.
    const segmented = fields.find((f) => f.type === 'segmented_date' && f.enabled);
    if (segmented) {
      const expected = digitCount(segmented.datePattern);
      const actual = segmented.boxes?.length ?? 0;
      if (expected !== actual) {
        toast.error(
          `${segmented.datePattern} needs ${expected} digit boxes, but ${actual} ` +
            `${actual === 1 ? 'is' : 'are'} placed. Use “Rebuild ${expected} boxes”.`,
        );
        setSelection({ key: segmented.key, boxIndex: null });
        return;
      }
    }

    setSaving(true);
    try {
      const data = await api.put(`/templates/${id}`, { fields });
      // Take the server's sanitised copy as the new baseline, not our own — it
      // clamps and coerces, and the two must not drift apart.
      setTemplate(data.template);
      setFields(data.template.fields);
      setSavedFields(data.template.fields);
      toast.success('Layout saved — every future cheque for this bank uses it');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  function handleRevert() {
    setFields(savedFields);
    toast.info('Reverted to the last saved layout');
  }

  const selected = fields.find((field) => field.key === selection.key) || null;
  const enabledCount = fields.filter((field) => field.enabled).length;

  if (loading) {
    return (
      <div className="splash" style={{ minHeight: '50vh' }}>
        <span className="spinner" />
        <span className="muted">Loading layout…</span>
      </div>
    );
  }

  if (error || !template) {
    return (
      <div className="alert alert--danger">
        <Icon name="error" size={18} />
        <span>{error || 'Template not found'}</span>
      </div>
    );
  }

  return (
    <div className="editor">
      <div className="page__head">
        <div style={{ minWidth: 0 }}>
          <Link to="/templates" className="backlink">
            <Icon name="arrow_back" size={16} /> Bank Templates
          </Link>
          <h1>{template.name}</h1>
          <p>
            {template.checkWidthMm} × {template.checkHeightMm} mm ·{' '}
            {enabledCount} of {fields.length} fields switched on
          </p>
        </div>

        <div className="row">
          <a
            className="btn"
            href={`/api/templates/${template.id}/alignment-sheet.pdf`}
            target="_blank"
            rel="noreferrer"
            title="Print on plain paper and hold it against a real cheque"
          >
            <Icon name="straighten" size={18} />
            Alignment sheet
          </a>
          {isAdmin && (
            <>
              <button
                type="button"
                className="btn"
                onClick={handleRevert}
                disabled={!dirty || saving}
              >
                <Icon name="undo" size={18} />
                Revert
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={handleSave}
                disabled={!dirty || saving}
              >
                {saving ? <span className="spinner" /> : <Icon name="save" size={18} />}
                Save layout
              </button>
            </>
          )}
        </div>
      </div>

      {!isAdmin && (
        <div className="alert alert--info" style={{ marginBottom: 'var(--sp-4)' }}>
          <Icon name="lock" size={18} />
          <span>You can look around, but only an admin can change a layout.</span>
        </div>
      )}

      {/* An affine tracing error is invisible on screen — the scan looks fine
          because it has been stretched to fit. Say so where the tracing happens. */}
      {template.referenceGeometry?.mismatched && (
        <div className="alert alert--danger" style={{ marginBottom: 'var(--sp-4)' }}>
          <Icon name="warning" size={18} />
          <span>
            <strong>This scan doesn&rsquo;t match the cheque size, so positions
            traced over it will be wrong.</strong>
            <br />
            The image is {template.referenceGeometry.pixelWidth}&times;
            {template.referenceGeometry.pixelHeight}&nbsp;px. At{' '}
            {template.checkWidthMm}&nbsp;mm wide that covers{' '}
            {template.referenceGeometry.impliedHeightMm}&nbsp;mm vertically, but the
            cheque is set to {template.checkHeightMm}&nbsp;mm — a difference of{' '}
            {Math.abs(template.referenceGeometry.differenceMm)}&nbsp;mm. The scan is
            stretched to fill the outline, so a field near the top is off by a
            different amount than one near the bottom. No printer calibration can
            correct that.
            <br />
            Rescan including the full top and bottom edges, or correct the cheque
            height, then re-position the fields.
          </span>
        </div>
      )}

      {dirty && (
        <div className="alert alert--warn" style={{ marginBottom: 'var(--sp-4)' }}>
          <Icon name="edit" size={18} />
          <span>Unsaved changes. Nothing is stored until you press Save layout.</span>
        </div>
      )}

      <div className="editor__grid">
        <aside className="editor__side">
          <div className="card">
            <div className="card__header"><h3>Reference</h3></div>
            <div className="card__body">
              <ReferencePanel
                template={template}
                meta={meta}
                showReference={showReference}
                onToggleReference={() => setShowReference((v) => !v)}
                onChanged={() => {
                  setImageVersion((v) => v + 1);
                  load();
                }}
              />
            </div>
          </div>

          <div className="card">
            <div className="card__header"><h3>Fields</h3></div>
            <div className="card__body">
              <ul className="fieldlist">
                {fields.map((field) => (
                  <li key={field.key}>
                    <button
                      type="button"
                      className={`fieldlist__item${
                        selection.key === field.key ? ' is-active' : ''
                      }${field.enabled ? '' : ' is-off'}`}
                      onClick={() => select(field.key, null)}
                    >
                      <span className="fieldlist__name">{field.label}</span>
                      <span
                        className="fieldlist__toggle"
                        role="switch"
                        aria-checked={field.enabled}
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleField(field.key, !field.enabled);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            e.stopPropagation();
                            toggleField(field.key, !field.enabled);
                          }
                        }}
                        title={field.enabled ? 'Switch off' : 'Switch on'}
                      >
                        <Icon
                          name={field.enabled ? 'toggle_on' : 'toggle_off'}
                          size={22}
                        />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </aside>

        <main className="editor__main card">
          <div className="editor__toolbar">
            <button
              type="button"
              className={`btn btn--ghost btn--icon ${showGrid ? 'is-on' : ''}`}
              onClick={() => setShowGrid((v) => !v)}
              title="5 mm grid"
              aria-pressed={showGrid}
            >
              <Icon name="grid_4x4" size={19} />
            </button>

            <div className="spacer" />

            <button
              type="button"
              className="btn btn--ghost btn--icon"
              onClick={() => setZoomIndex((i) => Math.max(0, i - 1))}
              disabled={zoomIndex === 0}
              aria-label="Zoom out"
            >
              <Icon name="zoom_out" size={19} />
            </button>
            <span className="mono zoomlabel">
              {Math.round(ZOOM_STEPS[zoomIndex] * 100)}%
            </span>
            <button
              type="button"
              className="btn btn--ghost btn--icon"
              onClick={() => setZoomIndex((i) => Math.min(ZOOM_STEPS.length - 1, i + 1))}
              disabled={zoomIndex === ZOOM_STEPS.length - 1}
              aria-label="Zoom in"
            >
              <Icon name="zoom_in" size={19} />
            </button>
          </div>

          <EditorCanvas
            template={template}
            fields={fields}
            selection={selection}
            onSelect={select}
            onFieldChange={updateField}
            onBoxChange={updateBox}
            referenceUrl={
              template.hasReferenceImage
                ? `/api/templates/${template.id}/reference-image?v=${imageVersion}`
                : null
            }
            showGrid={showGrid}
            showReference={showReference}
            zoom={ZOOM_STEPS[zoomIndex]}
          />
        </main>

        <aside className="editor__side editor__side--right">
          <div className="card">
            <FieldInspector
              field={selected}
              fontFamilies={meta?.fontFamilies || []}
              segmentedFormats={meta?.segmentedDateFormats || []}
              selectedBoxIndex={selection.boxIndex}
              onChange={(patch) => updateField(selection.key, patch)}
              onBoxChange={(index, patch) => updateBox(selection.key, index, patch)}
              onToggle={toggleField}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}
