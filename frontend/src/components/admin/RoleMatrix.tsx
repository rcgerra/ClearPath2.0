import { useState } from 'react';
import type { Role } from '../../types';

export const ROLE_LABELS: Array<{ value: Role; label: string }> = [
  { value: 'admin', label: 'Admin' },
  { value: 'demand_moderator', label: 'Demand Moderator' },
  { value: 'availability_moderator', label: 'Availability Moderator' },
  { value: 'user', label: 'User' },
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
  { label: 'New request', area: 'requests', roles: ['admin', 'demand_moderator', 'availability_moderator', 'user'] },
  { label: 'Add project', area: 'projects', roles: ['admin', 'demand_moderator'] },
  { label: 'Edit any project', area: 'projects', roles: ['admin'] },
  { label: 'Edit own project', area: 'projects', roles: ['admin', 'demand_moderator', 'availability_moderator', 'user'] },
  { label: 'Manage any demand', area: 'projects', roles: ['admin', 'demand_moderator'] },
  { label: 'Add department', area: 'departments', roles: ['admin'] },
  { label: 'Edit any department', area: 'departments', roles: ['admin'] },
  {
    label: 'Edit own department',
    area: 'departments',
    roles: ['admin', 'demand_moderator', 'availability_moderator', 'user'],
  },
  { label: 'Manage assignments', area: 'people', roles: ['admin', 'demand_moderator'] },
  { label: 'Manage any availability', area: 'people', roles: ['admin', 'availability_moderator'] },
  {
    label: 'Manage own availability',
    area: 'people',
    roles: ['admin', 'demand_moderator', 'availability_moderator', 'user'],
  },
];

export default function RoleMatrix() {
  const [area, setArea] = useState<Area>('requests');
  const visible = CAPABILITIES.filter((entry) => entry.area === area);
  const activeAccent = AREAS.find((entry) => entry.value === area)?.accent ?? '';

  return (
    <div className={`card role-matrix-card ${activeAccent}`.trim()}>
      <h2>What each role can do</h2>
      <p className="muted">
        Everyone can view every record. Admins can edit everything; other roles edit records where they are the
        project manager, department lead or a delegate.
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
        "Own" means you are the project manager, department lead, or a delegate on that record. Project managers and
        department leads assign their own delegates.
      </p>
    </div>
  );
}
