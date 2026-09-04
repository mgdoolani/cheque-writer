import { NavLink } from 'react-router-dom';
import Icon from '../Icon.jsx';
import { useBranding } from '../../branding/BrandingProvider.jsx';

/**
 * Navigation for every module in the app. `adminOnly` entries are filtered once
 * real auth state arrives (Module 2); until then everything is shown.
 */
export const NAV_SECTIONS = [
  {
    label: 'Cheques',
    items: [
      { to: '/', icon: 'dashboard', label: 'Dashboard', end: true },
      { to: '/cheques/new', icon: 'note_add', label: 'New Cheque' },
      { to: '/cheques', icon: 'receipt_long', label: 'Cheque Register' },
    ],
  },
  {
    label: 'Records',
    items: [
      { to: '/payees', icon: 'contacts', label: 'Payees' },
      { to: '/reports', icon: 'monitoring', label: 'Reports' },
    ],
  },
  {
    label: 'Configuration',
    items: [
      { to: '/printers', icon: 'print', label: 'Printers' },
      { to: '/templates', icon: 'design_services', label: 'Bank Templates' },
      // Visible to Accounting too — the page is read-only for them, and it is
      // where they see which currency word and date format are in force.
      { to: '/settings', icon: 'settings', label: 'Settings' },
      { to: '/users', icon: 'group', label: 'Users', adminOnly: true },
      { to: '/audit', icon: 'history', label: 'Audit Trail', adminOnly: true },
    ],
  },
];

export default function Sidebar({ role }) {
  const { companyName, productName, credit } = useBranding();
  // No role yet (pre-auth) means show everything — the server is the real gate.
  const canSee = (item) => !item.adminOnly || !role || role === 'admin';

  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <span className="sidebar__mark">
          <Icon name="payments" size={19} />
        </span>
        <span>
          <span className="sidebar__name">{companyName || productName}</span>
          <br />
          <span className="sidebar__tagline">
            {companyName ? productName : 'Print & register'}
          </span>
        </span>
      </div>

      <nav className="sidebar__nav">
        {NAV_SECTIONS.map((section) => {
          const items = section.items.filter(canSee);
          if (!items.length) return null;

          return (
            <div key={section.label}>
              <div className="sidebar__section">{section.label}</div>
              {items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => `navlink${isActive ? ' is-active' : ''}`}
                  title={item.label}
                >
                  <Icon name={item.icon} size={20} />
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>
          );
        })}
      </nav>

      <div className="sidebar__footer">
        <span>v1.0 · office LAN</span>
        <br />
        <span className="sidebar__credit">{credit}</span>
      </div>
    </aside>
  );
}
