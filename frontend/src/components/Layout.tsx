import { Suspense, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

const NAV_ICON_NAMES = [
  'home',
  'work',
  'requests',
  'prioritization',
  'projects',
  'departments',
  'people',
  'admin',
  'portfolio',
  'skills',
  'security',
  'business',
] as const;

type NavIconName = (typeof NAV_ICON_NAMES)[number];

function NavIcon({ name }: { name: NavIconName }) {
  const commonProps = {
    width: 16,
    height: 16,
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  switch (name) {
    case 'home':
      return (
        <svg {...commonProps}>
          <path d="M2.25 6.5L8 2l5.75 4.5" />
          <path d="M3.5 5.8V12.5h9V5.8" />
          <path d="M6.5 12.5v-4h3v4" />
        </svg>
      );
    case 'work':
      return (
        <svg {...commonProps}>
          <rect x="2.3" y="4.2" width="11.4" height="8.5" rx="1.5" />
          <path d="M6.2 4.2V3.3A1.1 1.1 0 0 1 7.3 2.2h1.4a1.1 1.1 0 0 1 1.1 1.1v.9" />
          <path d="M2.8 7.8h10.4" />
        </svg>
      );
    case 'requests':
      return (
        <svg {...commonProps}>
          <path d="M4 2.8h6.5L12.7 5v7.2A1.3 1.3 0 0 1 11.4 13.5H4.6A1.3 1.3 0 0 1 3.3 12.2V4.1A1.3 1.3 0 0 1 4.6 2.8Z" />
          <path d="M10.5 2.8V5h2.2" />
          <path d="M5.2 8h5.6M5.2 10.4h4.4" />
        </svg>
      );
    case 'prioritization':
      return (
        <svg {...commonProps}>
          <path d="M3 12.5V8.6M8 12.5V3.5M13 12.5v-6.1" />
          <path d="M1.9 12.5h12.2" />
        </svg>
      );
    case 'projects':
      return (
        <svg {...commonProps}>
          <path d="M3.3 3.3h9.4v9.4H3.3z" />
          <path d="M6.1 3.3v9.4M9.9 3.3v9.4M3.3 6.1h9.4M3.3 9.9h9.4" />
        </svg>
      );
    case 'departments':
      return (
        <svg {...commonProps}>
          <path d="M2.7 12.7V5.3h10.6v7.4" />
          <path d="M5.6 5.3V3.3h4.8v2" />
          <path d="M5.8 8h4.4M5.8 10.2h4.4" />
        </svg>
      );
    case 'people':
      return (
        <svg {...commonProps}>
          <circle cx="6.3" cy="5.3" r="2.2" />
          <path d="M2.5 12.6c.6-1.8 2.1-2.8 3.8-2.8s3.2 1 3.8 2.8" />
          <path d="M10.7 6.2a2 2 0 0 1 2.8 0" />
          <path d="M10 12.5c.4-1.2 1.3-2 2.6-2.4" />
        </svg>
      );
    case 'admin':
      return (
        <svg {...commonProps}>
          <path d="M8 2.5v4.2M4.3 5.4l2.6 2.6M11.7 5.4 9.1 8M8 12.1V8M4.3 10.6l2.6-2.6M11.7 10.6l-2.6-2.6" />
          <circle cx="8" cy="8" r="2.6" />
        </svg>
      );
    case 'portfolio':
      return (
        <svg {...commonProps}>
          <path d="M2.5 10.5 6 7.3l2.2 2.1 5.4-5.6" />
          <path d="M10.6 3.8h2.9v2.9" />
          <path d="M2.5 13.2h11" />
        </svg>
      );
    case 'skills':
      return (
        <svg {...commonProps}>
          <path d="M8 2.5 9.3 5l2.9.4-2.1 2.1.5 2.9L8 0 5.4 10.4l.5-2.9L3.8 5.4l2.9-.4L8 2.5Z" />
        </svg>
      );
    case 'security':
      return (
        <svg {...commonProps}>
          <path d="M8 2.2 12.3 4v3.4c0 2.8-1.9 5.3-4.3 6.4-2.4-1.1-4.3-3.6-4.3-6.4V4L8 2.2Z" />
          <path d="M6.8 8.1 7.6 9l1.7-2.1" />
        </svg>
      );
    case 'business':
      return (
        <svg {...commonProps}>
          <path d="M2.5 12.7V4.6h11v8.1" />
          <path d="M6.2 4.6V3.3h3.6v1.3M4.5 7.9h7M4.5 10.1h7" />
        </svg>
      );
    default:
      return null;
  }
}

const VIEW_ROLE_LABELS: Array<[string, string]> = [
  ['admin', 'Admin'],
  ['portfolio_manager', 'Portfolio Manager'],
  ['availability_moderator', 'Availability Moderator'],
  ['demand_moderator', 'Demand Moderator'],
];

const HEADER_CHEVRONS = [
  { x: 0, y: 19, size: 16, tone: 'dark' },
  { x: 13, y: 67, size: 13, tone: 'red' },
  { x: 22, y: 42, size: 20, tone: 'dark' },
  { x: 32, y: 78, size: 15, tone: 'red' },
  { x: 38, y: 23, size: 12, tone: 'dark' },
  { x: 46, y: 54, size: 18, tone: 'red' },
  { x: 53, y: 14, size: 14, tone: 'dark' },
  { x: 58, y: 83, size: 17, tone: 'red' },
  { x: 62, y: 37, size: 12, tone: 'dark' },
  { x: 67, y: 65, size: 20, tone: 'red' },
  { x: 70, y: 34, size: 14, tone: 'red' },
  { x: 71, y: 20, size: 16, tone: 'dark' },
  { x: 74, y: 48, size: 13, tone: 'red' },
  { x: 76, y: 70, size: 13, tone: 'dark' },
  { x: 79, y: 78, size: 17, tone: 'dark' },
  { x: 82, y: 31, size: 19, tone: 'red' },
  { x: 83, y: 16, size: 13, tone: 'red' },
  { x: 85, y: 58, size: 12, tone: 'dark' },
  { x: 88, y: 13, size: 17, tone: 'red' },
  { x: 90, y: 61, size: 15, tone: 'dark' },
  { x: 91, y: 43, size: 15, tone: 'dark' },
  { x: 94, y: 73, size: 20, tone: 'red' },
  { x: 96, y: 37, size: 17, tone: 'red' },
  { x: 97, y: 24, size: 13, tone: 'dark' },
  { x: 100, y: 53, size: 16, tone: 'red' },
];

/** Front-end areas. */
const USER_NAV = [
  { to: '/', label: 'Home', end: true, accent: '', icon: 'home' as const },
  { to: '/me', label: 'My Work', end: true, accent: '', icon: 'work' as const },
  { to: '/requests', label: 'Requests', end: false, accent: 'accent-requests', icon: 'requests' as const },
  { to: '/prioritization', label: 'Prioritization', end: false, accent: 'accent-prioritization', icon: 'prioritization' as const },
  { to: '/projects', label: 'Project Planning', end: false, accent: 'accent-projects', icon: 'projects' as const },
  { to: '/departments', label: 'Department Planning', end: false, accent: 'accent-departments', icon: 'departments' as const },
  { to: '/people', label: 'People', end: false, accent: 'accent-people', icon: 'people' as const },
] as const;

/** Areas shown while inside the admin portal (/admin/*). */
const ADMIN_NAV = [
  { to: '/admin', label: 'Admin Dashboard', end: true, accent: 'accent-access', icon: 'admin' as const },
  { to: '/admin/requests', label: 'Requests', end: false, accent: 'accent-requests', icon: 'requests' as const },
  { to: '/admin/projects', label: 'Projects', end: false, accent: 'accent-projects', icon: 'projects' as const },
  { to: '/admin/other-work', label: 'Run the Business', end: false, accent: 'accent-projects', icon: 'business' as const },
  { to: '/admin/departments', label: 'Departments', end: false, accent: 'accent-departments', icon: 'departments' as const },
  { to: '/admin/people', label: 'People', end: false, accent: 'accent-people', icon: 'people' as const },
  { to: '/admin/skills', label: 'Skills', end: false, accent: 'accent-people', icon: 'skills' as const },
  { to: '/admin/prioritization-model', label: 'Prioritization', end: false, accent: 'accent-prioritization', icon: 'prioritization' as const },
  { to: '/admin/access', label: 'Security Roles', end: false, accent: 'accent-access', icon: 'security' as const },
  { to: '/admin/controls', label: 'Admin Controls', end: false, accent: 'accent-access', icon: 'security' as const },
] as const;

/** Accent to color the back button by, matching the section the current page belongs to. */
function accentForPath(pathname: string): string {
  if (pathname === '/') return 'accent-access';
  if (pathname.startsWith('/admin/prioritization-model') || pathname.startsWith('/prioritization')) return 'accent-prioritization';
  if (pathname.startsWith('/admin/requests') || pathname.startsWith('/requests') || pathname.startsWith('/capture')) return 'accent-requests';
  if (pathname.startsWith('/admin/projects') || pathname.startsWith('/projects')) return 'accent-projects';
  if (pathname === '/me') return 'accent-projects';
  if (pathname.startsWith('/admin/departments') || pathname.startsWith('/departments') || pathname.startsWith('/department')) {
    return 'accent-departments';
  }
  if (pathname.startsWith('/admin/people') || pathname.startsWith('/people')) return 'accent-people';
  if (pathname.startsWith('/my-skills')) return 'accent-people';
  if (pathname.startsWith('/portfolio')) return 'accent-access';
  if (pathname.startsWith('/admin/skills') || pathname.startsWith('/skills') || pathname.startsWith('/admin/other-work')) return 'accent-people';
  if (pathname.startsWith('/admin')) return 'accent-access';
  return '';
}

export default function Layout() {
  const { user, viewingAs, stopViewingAs } = useAuthStore();
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const isAdmin = Boolean(user?.roles.includes('admin'));
  const inAdminPortal = isAdmin && location.pathname.startsWith('/admin');
  const isPortfolioManager = Boolean(user?.roles.includes('portfolio_manager'));
  const roleLabels = VIEW_ROLE_LABELS
    .filter(([value]) => user?.roles.includes(value as never))
    .map(([, label]) => label);
  const links = inAdminPortal
    ? ADMIN_NAV
    : isAdmin
      ? [...USER_NAV, { to: '/admin', label: 'Admin', end: false, accent: 'accent-access', icon: 'admin' as const }]
      : isPortfolioManager
        ? [...USER_NAV, { to: '/portfolio', label: 'Portfolio', end: true, accent: 'accent-access', icon: 'portfolio' as const }]
        : USER_NAV;

  const navigationGroups = [{ title: inAdminPortal ? 'Admin' : 'Workspace', items: links }];

  function stopViewing() {
    queryClient.clear();
    stopViewingAs();
    navigate('/admin');
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <NavLink to="/" className="brand" aria-label="ClearPath home">
          <span className="brand-copy">
            <span className="brand-wordmark"><span className="brand-clear">Clear</span><span className="brand-path">Path</span></span>
            <span className="brand-caption">Right People, Right Work, Right Time</span>
          </span>
          <svg className="brand-chevron-mark" viewBox="0 0 68 28" aria-hidden="true">
            <path className="brand-chevron-dark" d="M2 2 17 14 2 26h10l15-12L12 2H2Z" />
            <path className="brand-chevron-dark" d="M22 2 37 14 22 26h10l15-12L32 2H22Z" />
            <path className="brand-chevron-red" d="M42 2 57 14 42 26h10l15-12L52 2H42Z" />
          </svg>
        </NavLink>
        <div className="header-chevron-pattern" aria-hidden="true">
          {HEADER_CHEVRONS.map((chevron, index) => (
            <svg
              key={`${chevron.x}-${index}`}
              className={`header-chevron header-chevron-${chevron.tone}`}
              viewBox="0 0 27 28"
              style={{ left: `${chevron.x}%`, top: `${chevron.y}%`, width: `${chevron.size}px` }}
            >
              <path d="M2 2 17 14 2 26h10l15-12L12 2H2Z" />
            </svg>
          ))}
        </div>
        {roleLabels.length > 0 && (
          <div className="header-identity" aria-label="My roles">
            <span className="header-identity-label">My Roles:</span>
            {roleLabels.map((label) => <span key={label} className="pill pill-role">{label}</span>)}
          </div>
        )}
      </header>

      {inAdminPortal && (
        <div className="admin-portal-banner">
          <span>Admin Portal</span>
          <span className="admin-portal-hint">Admin Controls available in the Admin navigation.</span>
          <button
            type="button"
            className="admin-portal-exit"
            onClick={() => navigate('/')}
            aria-label="Exit admin portal"
            title="Exit admin portal"
          >
            ×
          </button>
        </div>
      )}

      {viewingAs && user && (
        <div className="view-as-banner" role="status">
          <div className="view-as-person">
            <span>Viewing as</span>
            <strong>{user.name}</strong>
          </div>
          {roleLabels.length > 0 && (
            <div className="view-as-roles" aria-label={`${user.name} security roles`}>
              {roleLabels.map((label) => <span key={label} className="pill view-as-role-badge">{label}</span>)}
            </div>
          )}
          <button type="button" className="view-as-stop" onClick={stopViewing} aria-label="Stop viewing as this person" title="Stop viewing as this person">×</button>
        </div>
      )}

      <div className={['app-body', sidebarCollapsed ? 'sidebar-collapsed' : ''].filter(Boolean).join(' ')}>
        <aside className="app-sidebar" aria-label="Primary navigation">
          <div className="app-sidebar-topbar">
            <button
              type="button"
              className="sidebar-toggle"
              onClick={() => setSidebarCollapsed((current) => !current)}
              aria-label={sidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'}
              title={sidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'}
            >
              <span className="sidebar-toggle-glyph" aria-hidden="true">{sidebarCollapsed ? '›' : '‹'}</span>
            </button>
          </div>

          <nav className="app-nav">
            {navigationGroups.map((group) => (
              <div key={group.title} className="nav-group">
                {!sidebarCollapsed && <span className="nav-group-label">{group.title}</span>}
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) => [item.accent, isActive ? 'active' : ''].filter(Boolean).join(' ')}
                    title={item.label}
                  >
                    <span className="nav-item-icon" aria-hidden="true">
                      <NavIcon name={item.icon} />
                    </span>
                    <span className="nav-label">{item.label}</span>
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
        </aside>

        <div className="app-content">
          <main className={['app-main', accentForPath(location.pathname)].filter(Boolean).join(' ')}>
            <Suspense fallback={<div role="status" className="muted">Loading page…</div>}>
              <Outlet />
            </Suspense>
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
      </div>
    </div>
  );
}

