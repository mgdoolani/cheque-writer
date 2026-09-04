import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar.jsx';
import TopBar from './TopBar.jsx';

/** Sidebar + top bar frame. Every screen renders into the <Outlet>. */
export default function AppLayout({ user, onSignOut }) {
  return (
    <div className="app">
      <Sidebar role={user?.role} />
      <div className="main">
        <TopBar user={user} onSignOut={onSignOut} />
        <div className="page">
          <div className="page__inner">
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  );
}
