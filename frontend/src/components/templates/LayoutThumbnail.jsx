/**
 * A small to-scale plan of a template: the cheque outline with a box for each
 * enabled field, drawn straight from the saved millimetre coordinates.
 *
 * The viewBox is the cheque's real dimensions in mm, so the SVG scales itself
 * and the proportions are honest — a 178x76 template looks like a cheque, and a
 * field dragged to the far right shows up on the far right.
 */

const FIELD_TONES = {
  payee: 'var(--brand-500)',
  amount_numeric: 'var(--green-500)',
  amount_words: 'var(--green-500)',
  date: 'var(--amber-500)',
  memo: 'var(--text-subtle)',
  crossing: 'var(--red-500)',
  account_payee: 'var(--red-500)',
  signature: 'var(--brand-400)',
};

export default function LayoutThumbnail({ template }) {
  const { checkWidthMm: w, checkHeightMm: h, fields = [] } = template;
  const enabled = fields.filter((f) => f.enabled);

  return (
    <div className="thumb">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="thumb__svg"
        role="img"
        aria-label={`${enabled.length} fields positioned on a ${w} by ${h} millimetre cheque`}
        preserveAspectRatio="xMidYMid meet"
      >
        <rect
          x="0.4"
          y="0.4"
          width={w - 0.8}
          height={h - 0.8}
          rx="2"
          fill="var(--surface-2)"
          stroke="var(--border-strong)"
          strokeWidth="0.5"
        />
        {enabled.map((field) => (
          <rect
            key={field.key}
            x={field.x}
            y={field.y}
            width={field.width}
            height={field.height}
            rx="0.8"
            fill={FIELD_TONES[field.key] || 'var(--text-subtle)'}
            fillOpacity="0.22"
            stroke={FIELD_TONES[field.key] || 'var(--text-subtle)'}
            strokeWidth="0.4"
          />
        ))}
      </svg>
      {enabled.length === 0 && <span className="thumb__empty">No fields switched on</span>}
    </div>
  );
}
