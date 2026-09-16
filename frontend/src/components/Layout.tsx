import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

/** Highest-privilege role first; shown as a pill beside the logo. */
const ROLE_LABELS: Array<[string, string]> = [
  ['admin', 'Admin'],
  ['demand_moderator', 'Demand Moderator'],
  ['availability_moderator', 'Availability Moderator'],
  ['user', 'User'],
];

/** Front-end areas. */
const USER_NAV = [
  { to: '/me', label: 'My Work', end: true, accent: '' },
  { to: '/projects', label: 'Projects', end: false, accent: 'accent-projects' },
  { to: '/departments', label: 'Departments', end: false, accent: 'accent-departments' },
  { to: '/requests', label: 'Requests', end: false, accent: 'accent-requests' },
] as const;

/** Landing/dashboard pages reached directly from nav — these don't get a back button. */
function isDashboardPath(pathname: string) {
  if (['/', '/me', '/admin', '/department', '/admin/portfolio'].includes(pathname)) return true;
  if (/^\/projects\/[^/]+\/team$/.test(pathname)) return true;
  return false;
}

function hasInlineBackButton(pathname: string) {
  return /^\/departments\/[^/]+$/.test(pathname) && pathname !== '/departments/new';
}

export default function Layout() {
  const user = useAuthStore((state) => state.user);
  const location = useLocation();
  const navigate = useNavigate();
  const isAdmin = Boolean(user?.roles.includes('admin'));
  const topRole = ROLE_LABELS.find(([value]) => user?.roles.includes(value as never));
  const showBack = !isDashboardPath(location.pathname) && !hasInlineBackButton(location.pathname);
  const links = isAdmin ? [...USER_NAV, { to: '/admin', label: 'Admin', end: false, accent: 'accent-access' }] : USER_NAV;

  return (
    <div className="app-shell">
      <header className="app-header">
        <span className="brand">
          <span className="brand-mark" aria-hidden="true" />
          ClearPath 2.0
        </span>
        {topRole && <span className="pill pill-role">{topRole[1]}</span>}
        <nav className="app-nav">
          {links.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => [item.accent, isActive ? 'active' : ''].filter(Boolean).join(' ')}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className={showBack ? 'app-main app-main-with-back' : 'app-main'}>
        {showBack && (
          <button type="button" className="back-button" onClick={() => navigate(-1)} aria-label="Go back" title="Go back">
            ←
          </button>
        )}
        <Outlet />
      </main>
      <footer className="app-footer">
        <span>
          Signed in as <strong>{user?.name}</strong>
          {user?.email ? ` · ${user.email}` : ''}
        </span>
        <span>{user?.roles.join(', ')}</span>
        <span className="app-footer-version">ClearPath 2.0</span>
      </footer>
    </div>
  );
}

