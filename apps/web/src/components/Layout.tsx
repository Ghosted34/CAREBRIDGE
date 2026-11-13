import { NavLink, Outlet, useNavigate } from 'react-router';
import type { Role } from '../api/types';
import { useAuth } from '../auth/authContext';
import { ClinicSwitcher } from './ClinicSwitcher';
import { NotificationBell } from './NotificationBell';

const NAV: Record<Role, { to: string; label: string }[]> = {
  patient: [
    { to: '/patient', label: 'My visits' },
    { to: '/patient/new', label: 'Book a visit' },
    { to: '/patient/appointments', label: 'Appointments' },
    { to: '/providers', label: 'Find providers' },
    { to: '/account/privacy', label: 'Privacy' },
  ],
  provider_staff: [
    { to: '/provider', label: 'Bookings' },
    { to: '/provider/capacity', label: 'Centres & hours' },
    { to: '/provider/fees', label: 'Fees' },
    { to: '/provider/team', label: 'Team' },
  ],
  operator: [
    { to: '/ops', label: 'Overview' },
    { to: '/ops/sla', label: 'Needs attention' },
    { to: '/ops/audit-logs', label: 'Audit Logs' },
    { to: '/ops/providers', label: 'Providers' },
  ],
  admin: [
    { to: '/ops', label: 'Overview' },
    { to: '/ops/sla', label: 'Needs attention' },
    { to: '/ops/audit-logs', label: 'Audit Logs' },
    { to: '/ops/providers', label: 'Providers' },
    { to: '/ops/users', label: 'Users' },
  ],
};

const ROLE_LABEL: Record<Role, string> = {
  patient: 'Patient',
  provider_staff: 'Provider',
  operator: 'Operator',
  admin: 'Admin',
};

export function Brand() {
  return (
    <NavLink to="/" className="brand" aria-label="OnDiGoH home">
      OnDi<span>GoH</span>
    </NavLink>
  );
}

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const links = user ? NAV[user.role] : [{ to: '/providers', label: 'Find providers' }];

  return (
    <div className="shell">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header className="topbar">
        <div className="topbar-inner">
          <Brand />
          <nav aria-label="Main" className="nav">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end
                className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
              >
                {l.label}
              </NavLink>
            ))}
          </nav>
          <div className="topbar-user">
            {user ? (
              <>
                <ClinicSwitcher />
                <NotificationBell />
                <span className="user-chip" title={user.email}>
                  {user.full_name}
                  <small>{ROLE_LABEL[user.role]}</small>
                </span>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    logout();
                    navigate('/');
                  }}
                >
                  Sign out
                </button>
              </>
            ) : (
              <>
                <NavLink to="/login" className="btn btn-ghost btn-sm">
                  Sign in
                </NavLink>
                <NavLink to="/register" className="btn btn-primary btn-sm">
                  Get started
                </NavLink>
              </>
            )}
          </div>
        </div>
      </header>
      <main id="main" className="main">
        <Outlet />
      </main>
      <footer className="footer">
        OnDiGoH coordinates access to care; clinical decisions remain with licensed professionals.
        In an emergency call <strong>112</strong>.{' '}
        <NavLink to="/policies">Terms &amp; privacy</NavLink>
      </footer>
    </div>
  );
}
