import Icon from './Icon.jsx';

/** Shown in place of a table when there is nothing to list. */
export default function EmptyState({ icon, title, children, action }) {
  return (
    <div className="empty">
      <span className="empty__icon">
        <Icon name={icon} size={26} />
      </span>
      <h3>{title}</h3>
      {children && <p className="muted">{children}</p>}
      {action && <div style={{ marginTop: 'var(--sp-3)' }}>{action}</div>}
    </div>
  );
}
