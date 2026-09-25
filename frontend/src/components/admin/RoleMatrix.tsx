import { useState } from 'react';
import type { Role } from '../../types';

export const ROLE_LABELS: Array<{ value: Role; label: string }> = [
  { value: 'admin', label: 'Admin' },
  { value: 'portfolio_manager', label: 'Portfolio Manager' },
  { value: 'availability_moderator', label: 'Availability Moderator' },
  { value: 'demand_moderator', label: 'Demand Moderator' },
];

type Area = 'requests' | 'projects' | 'departments' | 'people';

const AREAS: Array<{ value: Area; label: string; accent: string }> = [
  { value: 'requests', label: 'Requests', accent: 'accent-requests' },
  { value: 'projects', label: 'Projects', accent: 'accent-projects' },
  { value: 'departments', label: 'Departments', accent: 'accent-departments' },
  { value: 'people', label: 'People', accent: 'accent-people' },
];

/** Mirrors the role guards and record-level rules enforced by the API. */
const CAPABILITIES: Array<{ label: string; area: Area; roles: Role[]; note?: string }> = [
  { label: 'New request', area: 'requests', roles: ['admin', 'portfolio_manager', 'user'] },
  { label: 'Add project', area: 'projects', roles: ['admin'] },
  { label: 'Edit any project', area: 'projects', roles: ['admin'] },
  { label: 'Edit assigned project', area: 'projects', roles: ['admin', 'portfolio_manager', 'user'] },
  { label: 'View portfolio', area: 'projects', roles: ['admin', 'portfolio_manager'] },
  { label: 'Add department', area: 'departments', roles: ['admin'] },
  { label: 'Edit any department', area: 'departments', roles: ['admin'] },
  { label: 'Edit assigned department', area: 'departments', roles: ['admin', 'portfolio_manager', 'user'] },
  { label: 'Manage any person', area: 'people', roles: ['admin'] },
  { label: 'Manage own profile', area: 'people', roles: ['admin', 'portfolio_manager', 'user'] },
];

export default function RoleMatrix() {
  const [area, setArea] = useState<Area>('requests');
  const visible = CAPABILITIES.filter((entry) => entry.area === area);
  const activeAccent = AREAS.find((entry) => entry.value === area)?.accent ?? '';

  return (
    <div className={`card role-matrix-card ${activeAccent}`.trim()}>
      <h2>What each role can do</h2>
      <p className="muted">
        Anyone is the baseline access level. Admin, Portfolio Manager, Availability Moderator, and Demand Moderator
        are global roles. Project Manager, Department Lead, Project Demand Delegate,
        and Department Delegate are assigned by administrators on each project or department record.
      </p>

      <div className="tabs" role="tablist" aria-label="Filter capabilities by area">
        {AREAS.map((entry) => (
          <button
            key={entry.value}
            type="button"
            role="tab"
            aria-selected={area === entry.value}
            className={`${entry.accent} ${area === entry.value ? 'active' : ''}`.trim()}
            onClick={() => setArea(entry.value)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div className="data-table-wrap role-matrix-scroll">
        <table className="data-table role-matrix">
          <thead>
            <tr>
              <th className="role-column">Role</th>
              {visible.map((capability) => (
                <th key={capability.label}>{capability.label}</th>
              ))}
              <th className="spacer-column" aria-hidden="true" />
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row" className="role-column">Anyone</th>
              {visible.map((capability) => {
                const allowed = capability.roles.includes('user');
                return (
                  <td key={capability.label} className={allowed ? 'cap-yes' : 'cap-no'}>
                    <span aria-label={allowed ? 'Allowed' : 'Not allowed'}>{allowed ? '✓' : '—'}</span>
                  </td>
                );
              })}
              <td className="spacer-column" aria-hidden="true" />
            </tr>
            {ROLE_LABELS.map((role) => (
              <tr key={role.value}>
                <th scope="row" className="role-column">
                  {role.label}
                </th>
                {visible.map((capability) => {
                  const allowed = capability.roles.includes(role.value);
                  return (
                    <td key={capability.label} className={allowed ? 'cap-yes' : 'cap-no'}>
                      <span aria-label={allowed ? 'Allowed' : 'Not allowed'}>{allowed ? '✓' : '—'}</span>
                    </td>
                  );
                })}
                <td className="spacer-column" aria-hidden="true" />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="muted" style={{ marginTop: '0.6rem' }}>
        "Assigned" means the person is the project manager, department lead, project demand delegate, or department
        delegate on that record. These assignments control editing without granting organization-wide access.
      </p>
    </div>
  );
}
