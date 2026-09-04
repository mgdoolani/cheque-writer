import { useLocation } from 'react-router-dom';
import ThemeToggle from '../ThemeToggle.jsx';
import ProfileMenu from './ProfileMenu.jsx';
import { NAV_SECTIONS } from './Sidebar.jsx';
import { PRODUCT_NAME } from '../../lib/branding.js';
import { useDocumentTitle } from '../../branding/BrandingProvider.jsx';

const ALL_ITEMS = NAV_SECTIONS.flatMap((s) => s.items);

/** Longest matching nav path wins, so /cheques/new beats /cheques. */
function currentTitle(pathname) {
  const match = ALL_ITEMS.filter(
    (item) => pathname === item.to || (!item.end && pathname.startsWith(`${item.to}/`)),
  ).sort((a, b) => b.to.length - a.to.length)[0];

  return match?.label || PRODUCT_NAME;
}

export default function TopBar({ user, onSignOut }) {
  const { pathname } = useLocation();
  const page = currentTitle(pathname);
  useDocumentTitle(page);

  return (
    <header className="topbar">
      <div className="topbar__title">{page}</div>

      <div className="spacer" />

      <ThemeToggle />

      {user ? (
        <ProfileMenu user={user} onSignOut={onSignOut} />
      ) : (
        <span className="badge">Not signed in</span>
      )}
    </header>
  );
}
