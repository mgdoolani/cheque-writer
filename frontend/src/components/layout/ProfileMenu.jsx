/**
 * The signed-in user's menu in the top bar: identity, role, change password,
 * sign out.
 */

import { useEffect, useRef, useState } from 'react';
import Icon from '../Icon.jsx';
import Modal from '../Modal.jsx';
import PasswordChangeForm from '../PasswordChangeForm.jsx';

const initials = (user) =>
  (user?.fullName || user?.username || '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || '?';

export default function ProfileMenu({ user, onSignOut }) {
  const [open, setOpen] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [changed, setChanged] = useState(false);
  const wrapRef = useRef(null);

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event) => {
      if (!wrapRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => event.key === 'Escape' && setOpen(false);

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const isAdmin = user?.role === 'admin';

  return (
    <div className="profile" ref={wrapRef}>
      <button
        type="button"
        className="profile__trigger"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="avatar">{initials(user)}</span>
        <span className="profile__id">
          <span className="topbar__username">{user?.fullName || user?.username}</span>
          <span className={`badge ${isAdmin ? 'badge--accent' : ''}`}>
            {isAdmin ? 'Admin' : 'Accounting'}
          </span>
        </span>
        <Icon name={open ? 'expand_less' : 'expand_more'} size={18} />
      </button>

      {open && (
        <div className="menu" role="menu">
          <div className="menu__head">
            <div className="topbar__username">{user?.fullName || user?.username}</div>
            <div className="subtle">@{user?.username}</div>
          </div>

          <button
            type="button"
            className="menu__item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setChangingPassword(true);
            }}
          >
            <Icon name="lock_reset" size={19} />
            Change password
          </button>

          <div className="menu__divider" />

          <button
            type="button"
            className="menu__item menu__item--danger"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onSignOut?.();
            }}
          >
            <Icon name="logout" size={19} />
            Sign out
          </button>
        </div>
      )}

      <Modal
        open={changingPassword}
        onClose={() => setChangingPassword(false)}
        title="Change password"
        description="You stay signed in on this device."
        width={440}
      >
        <PasswordChangeForm
          onCancel={() => setChangingPassword(false)}
          onDone={() => {
            setChangingPassword(false);
            setChanged(true);
          }}
        />
      </Modal>

      <Modal
        open={changed}
        onClose={() => setChanged(false)}
        title="Password changed"
        width={380}
        footer={
          <button type="button" className="btn btn--primary" onClick={() => setChanged(false)}>
            Done
          </button>
        }
      >
        <div className="alert alert--success">
          <Icon name="check_circle" size={18} />
          <span>Your password has been updated. Use it next time you sign in.</span>
        </div>
      </Modal>
    </div>
  );
}
