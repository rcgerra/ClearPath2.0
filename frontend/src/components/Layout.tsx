import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

/** Highest-privilege role first; shown as a pill beside the logo. */
const ROLE_LABELS: Array<[string, string]> = [
  ['admin', 'Admin'],
  ['demand_moderator', 'Demand Moderator'],
  ['availability_moderator', 'Availability Moderator'],
  ['user', 'User'],
];

/** Back-end (admin) areas. Accent classes tint each link to match its page. */
const ADMIN_NAV = [
  { to: '/admin', label: 'Home', end: true, accent: '' },
  { to: '/admin/requests', label: 'Requests', end: false, accent: 'accent-requests' },
  { to: '/admin/projects', label: 'Projects', end: false, accent: 'accent-projects' },
  { to: '/admin/departments', label: 'Departments', end: false, accent: 'accent-departments' },
  { to: '/admin/people', label: 'People', end: false, accent: 'accent-people' },
  { to: '/admin/access', label: 'Security Roles', end: false, accent: 'accent-access' },
] as const;

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

export default function Layout() {
  const user = useAuthStore((state) => state.user);
  const location = useLocation();
  const navigate = useNavigate();
  const isAdmin = Boolean(user?.roles.includes('admin'));
  const inAdminArea = location.pathname.startsWith('/admin');
  const topRole = ROLE_LABELS.find(([value]) => user?.roles.includes(value as never));
  const showBack = !isDashboardPath(location.pathname);

  const links = isAdmin && inAdminArea ? ADMIN_NAV : USER_NAV;

  return (
    <div className="app-shell">
      <header className="app-header">
        <span className="brand">
          <span className="brand-mark" aria-hidden="true" />
          ClearPath 2.0
        </span>
        {topRole &&
          (isAdmin ? (
            <Link className="pill pill-role" to={inAdminArea ? '/me' : '/admin'}>
              {inAdminArea ? 'Exit admin' : 'Admin'}
            </Link>
          ) : (
            <span className="pill pill-role">{topRole[1]}</span>
          ))}
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
      <main className="app-main">
        {showBack && (
          <button type="button" className="back-button" onClick={() => navigate(-1)} aria-label="Go back">
            ← Back
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

