import { Link } from 'react-router-dom';

const AREAS = [
  {
    to: '/admin/portfolio',
    accent: 'projects',
    title: 'Portfolio Management',
    description: 'Site capacity model and project performance issues.',
  },
  {
    to: '/admin/requests',
    accent: 'requests',
    title: 'Opportunities',
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
  { to: '/admin/reference/functions', accent: 'departments', title: 'Functions', description: 'Maintain organizational functions.' },
  { to: '/admin/reference/locations', accent: 'requests', title: 'Locations', description: 'Maintain locations used in opportunity intake.' },
  { to: '/admin/reference/programs', accent: 'projects', title: 'Programs', description: 'Maintain program names used in project planning.' },
  { to: '/admin/reference/sites', accent: 'people', title: 'Sites', description: 'Maintain site reference names.' },
  {
    to: '/admin/people',
    accent: 'people',
    title: 'People',
    description: 'Roster — department, employment type and status.',
  },
  {
    to: '/admin/skills',
    accent: 'people',
    title: 'Skills',
    description: 'Maintain the skill categories people can select from.',
  },
  {
    to: '/admin/prioritization-model',
    accent: 'prioritization',
    title: 'Prioritization Model',
    description: 'Maintain scoring categories, weights, questions and answer choices.',
  },
  {
    to: '/admin/access',
    accent: 'access',
    title: 'Security Roles',
    description: 'Assign who can administer, moderate demand or availability.',
  },
  {
    to: '/admin/other-work',
    accent: 'projects',
    title: 'Run the Business',
    description: 'Review non-project demand and manage its categories.',
  },
  {
    to: '/admin/controls',
    accent: 'access',
    title: 'Developer',
    description: 'Preview the application as another person without ending your admin session.',
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
