import { NavLink, Outlet, useNavigate } from 'react-router';
import type { Role } from '../api/types';
import { useAuth } from '../auth/authContext';
import { NotificationBell } from './NotificationBell';

const NAV: Record<Role, { to: string; label: string }[]> = {
  patient: [
    { to: '/patient', label: 'My care' },
    { to: '/patient/new', label: 'New request' },
    { to: '/patient/appointments', label: 'Appointments' },
    { to: '/providers', label: 'Find providers' },
    { to: '/account/privacy', label: 'Privacy' },
  ],
  provider_staff: [
    { to: '/provider', label: 'Request queue' },
    { to: '/provider/patients', label: 'My patients' },
    { to: '/provider/appointments', label: 'Appointments' },
    { to: '/provider/capacity', label: 'Capacity' },
    { to: '/provider/referrals', label: 'Referrals' },
    { to: '/provider/offers', label: 'Offers' },
  ],
  operator: [
    { to: '/ops', label: 'Overview' },
    { to: '/ops/queue', label: 'Queue' },
    { to: '/ops/journeys', label: 'Journeys' },
    { to: '/ops/sla', label: 'SLA' },
    { to: '/ops/audit-logs', label: 'Audit Logs' },
    { to: '/ops/providers', label: 'Providers' },
  ],
  admin: [
    { to: '/ops', label: 'Overview' },
    { to: '/ops/queue', label: 'Queue' },
    { to: '/ops/journeys', label: 'Journeys' },
    { to: '/ops/sla', label: 'SLA' },
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
    <NavLink to="/" className="brand" aria-label="CareBridge home">
      Care<span>Bridge</span>
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
        CareBridge coordinates access to care; clinical decisions remain with licensed
        professionals. In an emergency call <strong>112</strong>.{' '}
        <NavLink to="/policies">Terms &amp; privacy</NavLink>
      </footer>
    </div>
  );
}
