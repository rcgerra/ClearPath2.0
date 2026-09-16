import { Link } from 'react-router-dom';

const AREAS = [
  {
    to: '/admin/requests',
    accent: 'requests',
    title: 'Requests',
    description: 'Intake queue — short title, requester and current phase.',
  },
  {
    to: '/admin/projects',
    accent: 'projects',
    title: 'Projects',
    description: 'Active portfolio — manager, sponsor and last check-in.',
  },
  {
    to: '/admin/departments',
    accent: 'departments',
    title: 'Departments',
    description: 'Org structure — lead, function and last check-in.',
  },
  {
    to: '/admin/people',
    accent: 'people',
    title: 'People',
    description: 'Roster — department, employment type and status.',
  },
  {
    to: '/admin/access',
    accent: 'access',
    title: 'Security Roles',
    description: 'Assign who can administer, moderate demand or availability.',
  },
  {
    to: '/admin/non-project-demand-categories',
    accent: 'projects',
    title: 'Non-project Demand',
    description: 'Manage categories used for work that is not assigned to a project.',
  },
] as const;

export default function AdminHome() {
  return (
    <>
      <h1 className="page-title">Home</h1>
      <p className="page-subtitle">ClearPath 2.0 administration — choose an area to manage.</p>

      <div className="grid cols-3 nav-card-grid">
        {AREAS.map((area) => (
          <Link key={area.to} to={area.to} className={`nav-card accent-${area.accent}`}>
            <h2>{area.title}</h2>
            <p>{area.description}</p>
            <span className="nav-card-cta">Open →</span>
          </Link>
        ))}
      </div>
    </>
  );
}
