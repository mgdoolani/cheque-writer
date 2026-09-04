/**
 * Bank templates (Section 2): list, create, edit metadata, retire, set default.
 *
 * Field positioning lives in the visual editor (Module 6) — this screen is
 * everything around it.
 */

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { useToast } from '../components/Toast.jsx';
import Icon from '../components/Icon.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import TemplateForm from '../components/templates/TemplateForm.jsx';
import LayoutThumbnail from '../components/templates/LayoutThumbnail.jsx';

export default function Templates() {
  const { isAdmin } = useAuth();
  const toast = useToast();

  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showRetired, setShowRetired] = useState(false);

  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);

  const load = useCallback(async (includeInactive) => {
    setLoading(true);
    try {
      const data = await api.get(
        `/templates${includeInactive ? '?includeInactive=true' : ''}`,
      );
      setTemplates(data.templates);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(showRetired);
  }, [showRetired, load]);

  function handleSaved(template, wasEdit) {
    setEditing(null);
    toast.success(wasEdit ? `${template.name} saved` : `${template.name} created`);
    load(showRetired);
  }

  async function handleSetDefault(template) {
    try {
      await api.post(`/templates/${template.id}/default`);
      toast.success(`${template.name} is now the default`);
      load(showRetired);
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleRemove() {
    const data = await api.del(`/templates/${removing.id}`);
    if (data?.deactivated) {
      toast.info(`${removing.name} has cheques on record — retired instead of deleted`);
    } else {
      toast.success(`${removing.name} deleted`);
    }
    load(showRetired);
  }

  const enabledCount = (t) => (t.fields || []).filter((f) => f.enabled).length;

  return (
    <>
      <div className="page__head">
        <div>
          <h1>Bank Templates</h1>
          <p>
            One saved layout per bank account. Position the fields once; every
            cheque printed for that bank reuses them.
          </p>
        </div>
        {isAdmin && (
          <button type="button" className="btn btn--primary" onClick={() => setEditing({})}>
            <Icon name="add" size={18} />
            New template
          </button>
        )}
      </div>

      <div className="toolbar">
        <button
          type="button"
          className={`btn ${showRetired ? 'btn--primary' : ''}`}
          onClick={() => setShowRetired((v) => !v)}
          aria-pressed={showRetired}
        >
          <Icon name={showRetired ? 'visibility' : 'visibility_off'} size={18} />
          {showRetired ? 'Showing retired' : 'Hiding retired'}
        </button>
        <div className="spacer" />
        <span className="subtle">
          {loading ? 'Loading…' : `${templates.length} template${templates.length === 1 ? '' : 's'}`}
        </span>
      </div>

      {error && (
        <div className="alert alert--danger" role="alert" style={{ marginBottom: 'var(--sp-4)' }}>
          <Icon name="error" size={18} />
          <span>{error}</span>
        </div>
      )}

      {templates.length === 0 && !loading ? (
        <div className="card">
          <div className="card__body">
            <EmptyState
              icon="design_services"
              title="No templates"
              action={
                isAdmin && (
                  <button
                    type="button"
                    className="btn btn--primary"
                    onClick={() => setEditing({})}
                  >
                    <Icon name="add" size={18} />
                    Create the first template
                  </button>
                )
              }
            >
              A template holds your cheque’s physical size and where each field
              sits on it.
            </EmptyState>
          </div>
        </div>
      ) : (
        <div className="templates">
          {templates.map((template) => (
            <article
              className={`card template${template.isActive ? '' : ' is-retired'}`}
              key={template.id}
            >
              <LayoutThumbnail template={template} />

              <div className="template__body">
                <div className="template__head">
                  <div style={{ minWidth: 0 }}>
                    <h3 className="template__name">{template.name}</h3>
                    {template.bankName && (
                      <p className="muted table__sub">{template.bankName}</p>
                    )}
                  </div>
                  <div className="template__badges">
                    {template.isDefault && <span className="badge badge--accent">Default</span>}
                    {!template.isActive && <span className="badge">Retired</span>}
                  </div>
                </div>

                <dl className="template__facts">
                  <div>
                    <dt>Size</dt>
                    <dd className="mono">
                      {template.checkWidthMm} × {template.checkHeightMm} mm
                    </dd>
                  </div>
                  <div>
                    <dt>Fields placed</dt>
                    <dd>
                      {enabledCount(template)} of {(template.fields || []).length}
                    </dd>
                  </div>
                  <div>
                    <dt>Paper</dt>
                    <dd>
                      {template.paperMode === 'feed'
                        ? `${template.paperSize} · ${template.orientation}`
                        : 'Cheque-sized page'}
                    </dd>
                  </div>
                  <div>
                    <dt>Reference scan</dt>
                    <dd>
                      {template.hasReferenceImage ? (
                        <span className="ok">
                          <Icon name="check_circle" size={14} />
                          {template.referenceImageDpi
                            ? ` ${Math.round(template.referenceImageDpi)} DPI`
                            : ' Uploaded'}
                        </span>
                      ) : (
                        <span className="subtle">Not uploaded</span>
                      )}
                    </dd>
                  </div>
                </dl>

                <div className="template__actions">
                  <Link to={`/templates/${template.id}/layout`} className="btn btn--primary">
                    <Icon name="drag_pan" size={18} />
                    Position fields
                  </Link>

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
                        className="btn btn--ghost btn--icon"
                        onClick={() => setEditing(template)}
                        title="Edit template"
                        aria-label={`Edit ${template.name}`}
                      >
                        <Icon name="edit" size={19} />
                      </button>
                      {!template.isDefault && template.isActive && (
                        <button
                          type="button"
                          className="btn btn--ghost btn--icon"
                          onClick={() => handleSetDefault(template)}
                          title="Make this the default"
                          aria-label={`Make ${template.name} the default`}
                        >
                          <Icon name="star" size={19} />
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btn--ghost btn--icon"
                        onClick={() => setRemoving(template)}
                        title="Remove template"
                        aria-label={`Remove ${template.name}`}
                      >
                        <Icon name="delete" size={19} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <TemplateForm
        open={Boolean(editing)}
        template={editing?.id ? editing : null}
        onClose={() => setEditing(null)}
        onSaved={handleSaved}
      />

      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        onConfirm={handleRemove}
        title={`Remove ${removing?.name}?`}
        confirmLabel="Remove"
        message={
          'If any cheque was printed with this template it will be retired rather ' +
          'than deleted, so those records keep resolving to the layout they were ' +
          'printed with. Otherwise it is removed permanently, along with its ' +
          'reference scan.'
        }
      />
    </>
  );
}
