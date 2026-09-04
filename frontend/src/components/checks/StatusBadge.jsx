import Icon from '../Icon.jsx';

const TONE = {
  draft: { className: '', icon: 'edit_note', label: 'Draft' },
  printed: { className: 'badge--success', icon: 'print', label: 'Printed' },
  void: { className: 'badge--danger', icon: 'block', label: 'Void' },
};

export default function StatusBadge({ status, printCount }) {
  const tone = TONE[status] || TONE.draft;
  return (
    <span className={`badge ${tone.className}`} title={
      printCount > 1 ? `Printed ${printCount} times` : undefined
    }>
      <Icon name={tone.icon} size={13} />
      {tone.label}
      {status === 'printed' && printCount > 1 ? ` ×${printCount}` : ''}
    </span>
  );
}
