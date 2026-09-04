/**
 * Reference scan + signature artwork.
 *
 * DPI policy, as locked:
 *   < 200 DPI        rejected outright — too coarse to position against
 *   200 – 300 DPI    accepted, with a visible warning
 *   >= 300 DPI       accepted quietly (the recommended minimum)
 *
 * The server enforces the hard floor; this panel mirrors it so the user finds
 * out before waiting on a 20MB upload.
 */

import { useRef, useState } from 'react';
import { api } from '../../api/client.js';
import Icon from '../Icon.jsx';
import ImageCropDialog from './ImageCropDialog.jsx';

function Uploader({ label, hint, accept, onUpload, busy, children }) {
  const inputRef = useRef(null);

  return (
    <div className="refpanel__block">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="field__label">{label}</span>
        {children}
      </div>
      {hint && <p className="field__hint">{hint}</p>}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) onUpload(file);
        }}
      />
      <button
        type="button"
        className="btn"
        style={{ width: '100%' }}
        onClick={() => inputRef.current?.click()}
        disabled={busy}
      >
        {busy ? <span className="spinner" /> : <Icon name="upload_file" size={18} />}
        Choose file
      </button>
    </div>
  );
}

export default function ReferencePanel({
  template,
  meta,
  onChanged,
  showReference,
  onToggleReference,
}) {
  const [busy, setBusy] = useState(false);
  // The chosen file waits here while the user crops and straightens it.
  const [pendingFile, setPendingFile] = useState(null);
  const [error, setError] = useState(null);
  const [warnings, setWarnings] = useState([]);

  const minDpi = meta?.minimumDpi ?? 200;
  const goodDpi = meta?.recommendedDpi ?? 300;

  /**
   * A chosen file is not uploaded straight away. It goes to the crop step
   * first, where the same DPI and size checks run live — the Sterling scan was
   * accepted, silently stretched, and only found to be wrong once cheques
   * printed with drifting field positions.
   */
  function chooseReference(file) {
    setError(null);
    setWarnings([]);
    setPendingFile(file);
  }

  async function uploadReference(file) {
    setError(null);

    setBusy(true);
    try {
      const body = new FormData();
      body.append('image', file);
      const data = await api.post(`/templates/${template.id}/reference-image`, body);
      // Both the DPI note and the size-mismatch note can apply at once.
      setWarnings(data?.warnings?.length ? data.warnings : data?.warning ? [data.warning] : []);
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function uploadSignature(file) {
    setError(null);
    setBusy(true);
    try {
      const body = new FormData();
      body.append('image', file);
      await api.post(`/templates/${template.id}/signature-image`, body);
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeSignature() {
    setBusy(true);
    try {
      await api.del(`/templates/${template.id}/signature-image`);
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const dpi = template.referenceImageDpi;

  return (
    <div className="refpanel">
      <ImageCropDialog
        open={Boolean(pendingFile)}
        file={pendingFile}
        template={template}
        minDpi={minDpi}
        goodDpi={goodDpi}
        onCancel={() => setPendingFile(null)}
        onConfirm={(croppedFile) => {
          setPendingFile(null);
          uploadReference(croppedFile);
        }}
      />

      {error && (
        <div className="alert alert--danger" role="alert">
          <Icon name="error" size={18} />
          <span>{error}</span>
        </div>
      )}
      {warnings.map((text) => (
        <div className="alert alert--warn" role="status" key={text}>
          <Icon name="warning" size={18} />
          <span>{text}</span>
        </div>
      ))}

      <Uploader
        label="Reference scan"
        hint={`A photo or scan of a blank cheque, ${goodDpi} DPI or better. You will crop it to the cheque's edges before it is saved. Used only as a tracing guide — it is never printed.`}
        accept="image/png,image/jpeg"
        onUpload={chooseReference}
        busy={busy}
      >
        {template.hasReferenceImage && (
          <button
            type="button"
            className="btn btn--ghost btn--icon"
            onClick={onToggleReference}
            title={showReference ? 'Hide the scan' : 'Show the scan'}
            aria-label={showReference ? 'Hide the scan' : 'Show the scan'}
          >
            <Icon name={showReference ? 'visibility' : 'visibility_off'} size={19} />
          </button>
        )}
      </Uploader>

      {template.hasReferenceImage && dpi != null && (
        <div className={`dpi ${dpi >= goodDpi ? 'is-good' : 'is-low'}`}>
          <Icon name={dpi >= goodDpi ? 'check_circle' : 'warning'} size={16} />
          <span>
            <strong>{Math.round(dpi)} DPI</strong>
            {dpi >= goodDpi
              ? ' — good enough to position against.'
              : ` — below the recommended ${goodDpi}. Usable, but fine positioning will be harder.`}
          </span>
        </div>
      )}

      <Uploader
        label="Signature image"
        hint="Optional. Drawn into the Signature field if that field is switched on."
        accept="image/png,image/jpeg"
        onUpload={uploadSignature}
        busy={busy}
      >
        {template.hasSignatureImage && (
          <button
            type="button"
            className="btn btn--ghost btn--icon"
            onClick={removeSignature}
            title="Remove signature image"
            aria-label="Remove signature image"
          >
            <Icon name="delete" size={19} />
          </button>
        )}
      </Uploader>

      {template.hasSignatureImage && (
        <img
          className="refpanel__sig"
          src={`/api/templates/${template.id}/signature-image`}
          alt="Signature"
        />
      )}
    </div>
  );
}
