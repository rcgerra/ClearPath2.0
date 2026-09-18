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
  { to: '/people', label: 'People', end: false, accent: 'accent-people' },
  { to: '/skills', label: 'Skills', end: false, accent: 'accent-people' },
] as const;

/** Areas shown while inside the admin portal (/admin/*). */
const ADMIN_NAV = [
  { to: '/admin', label: 'Admin Dashboard', end: true, accent: 'accent-access' },
  { to: '/admin/requests', label: 'Requests', end: false, accent: 'accent-requests' },
  { to: '/admin/projects', label: 'Projects', end: false, accent: 'accent-projects' },
  { to: '/admin/non-project-demand-categories', label: 'Non-Projects', end: false, accent: 'accent-projects' },
  { to: '/admin/other-work', label: 'Other Work', end: false, accent: '' },
  { to: '/admin/departments', label: 'Departments', end: false, accent: 'accent-departments' },
  { to: '/admin/people', label: 'People', end: false, accent: 'accent-people' },
  { to: '/admin/skills', label: 'Skills', end: false, accent: 'accent-people' },
  { to: '/admin/access', label: 'Security Roles', end: false, accent: 'accent-access' },
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

/** Accent to color the back button by, matching the section the current page belongs to. */
function accentForPath(pathname: string): string {
  if (pathname.startsWith('/admin/requests') || pathname.startsWith('/requests')) return 'accent-requests';
  if (pathname.startsWith('/admin/projects') || pathname.startsWith('/projects')) return 'accent-projects';
  if (pathname.startsWith('/admin/departments') || pathname.startsWith('/departments') || pathname.startsWith('/department')) {
    return 'accent-departments';
  }
  if (pathname.startsWith('/admin/people') || pathname.startsWith('/people')) return 'accent-people';
  if (pathname.startsWith('/admin/skills') || pathname.startsWith('/skills') || pathname.startsWith('/admin/other-work')) return 'accent-people';
  if (pathname.startsWith('/admin')) return 'accent-access';
  return '';
}

export default function Layout() {
  const user = useAuthStore((state) => state.user);
  const location = useLocation();
  const navigate = useNavigate();
  const isAdmin = Boolean(user?.roles.includes('admin'));
  const topRole = ROLE_LABELS.find(([value]) => user?.roles.includes(value as never));
  const inAdminPortal = isAdmin && location.pathname.startsWith('/admin');
  const showBack = !isDashboardPath(location.pathname) && !hasInlineBackButton(location.pathname);
  const links = inAdminPortal
    ? ADMIN_NAV
    : isAdmin
      ? [...USER_NAV, { to: '/admin', label: 'Admin', end: false, accent: 'accent-access' }]
      : USER_NAV;

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
      {inAdminPortal && (
        <div className="admin-portal-banner">
          <span>Admin Portal</span>
          <button
            type="button"
            className="admin-portal-exit"
            onClick={() => navigate('/me')}
            aria-label="Exit admin portal"
            title="Exit admin portal"
          >
            ×
          </button>
        </div>
      )}
      <main className="app-main">
        {showBack && (
          <div className={['back-button-row', accentForPath(location.pathname)].filter(Boolean).join(' ')}>
            <button type="button" className="back-button" onClick={() => navigate(-1)} aria-label="Go back" title="Go back">
              ←
            </button>
          </div>
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

