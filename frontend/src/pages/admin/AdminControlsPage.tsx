import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { authApi, errorMessage, peopleApi } from '../../api/client';
import AccentSection from '../../components/admin/AccentSection';
import { useAuthStore } from '../../store/authStore';

const roleLabels: Record<string, string> = {
  admin: 'Admin',
  portfolio_manager: 'Portfolio Manager',
  availability_moderator: 'Availability Moderator',
  demand_moderator: 'Demand Moderator',
};

function rolesFor(raw?: string) {
  const roles = String(raw ?? '')
    .split(/[;,]/)
    .map((value) => value.trim().toLowerCase().replace(/\s+/g, '_'))
    .filter((value) => roleLabels[value]);
  return [...roles, 'user'];
}

export default function AdminControlsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const startViewingAs = useAuthStore((state) => state.startViewingAs);
  const [personId, setPersonId] = useState('');
  const [search, setSearch] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const people = useQuery({ queryKey: ['admin-view-as-people'], queryFn: () => peopleApi.list({ active: true }) });
  const filteredPeople = useMemo(() => {
    const rows = [...(people.data ?? [])].sort((left, right) => left.name.localeCompare(right.name));
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((person) =>
      person.name.toLowerCase().includes(query) ||
      person.email?.toLowerCase().includes(query) ||
      person.departmentName?.toLowerCase().includes(query) ||
      person.title?.toLowerCase().includes(query),
    );
  }, [people.data, search]);
  const selectedPerson = people.data?.find((person) => person.id === personId);
  const selectedRoles = selectedPerson ? rolesFor(selectedPerson.role) : [];
  const selectedIsInactive = selectedPerson?.isActive === false;

  async function enableViewAs() {
    if (!personId) return;
    setError(null);
    setIsStarting(true);
    try {
      const session = await authApi.viewAs(personId);
      queryClient.clear();
      startViewingAs(session.viewAsToken, session.user);
      navigate('/');
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setIsStarting(false);
      setConfirming(false);
    }
  }

  function selectPerson(id: string) {
    setPersonId(id);
    setConfirming(false);
    setError(null);
  }

  return (
    <AccentSection
      accent="access"
      title="Admin Controls"
      subtitle="Temporarily preview the application as another person without ending your administrator session."
    >
      <div className="card admin-controls-card">
        <div className="admin-controls-heading">
          <div>
            <h2>View application as</h2>
            <p className="muted">The selected person’s roles and visibility will be applied outside the Admin Portal.</p>
          </div>
          <span className="pill pill-role">Admin only</span>
        </div>

        <div className="admin-controls-search">
          <label htmlFor="view-as-search">Find a person</label>
          <input
            id="view-as-search"
            type="search"
            placeholder="Search by name, email, department, or title…"
            value={search}
            disabled={people.isLoading}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        {people.isLoading && <p className="muted">Loading people…</p>}
        {people.isError && <div className="alert error">{errorMessage(people.error)}</div>}

        {!people.isLoading && !people.isError && (
          <div className="admin-controls-results" role="listbox" aria-label="Matching people">
            {filteredPeople.length === 0 && (
              <p className="muted admin-controls-empty">No people match “{search}”.</p>
            )}
            {filteredPeople.slice(0, 30).map((person) => (
              <button
                type="button"
                key={person.id}
                role="option"
                aria-selected={person.id === personId}
                className={['admin-controls-result', person.id === personId ? 'selected' : ''].filter(Boolean).join(' ')}
                onClick={() => selectPerson(person.id)}
              >
                <span className="admin-controls-result-name">{person.name}</span>
                <span className="admin-controls-result-meta">
                  {[person.title, person.departmentName, person.siteName].filter(Boolean).join(' · ') || person.email}
                </span>
              </button>
            ))}
            {filteredPeople.length > 30 && (
              <p className="muted admin-controls-more">Showing 30 of {filteredPeople.length} matches — refine your search.</p>
            )}
          </div>
        )}

        {!personId && !people.isLoading && (
          <p className="muted admin-controls-empty">Select a person above to preview the application as them.</p>
        )}

        {selectedPerson && (
          <div className="admin-controls-preview">
            <div className="admin-controls-preview-grid">
              <div><span className="muted">Department</span><strong>{selectedPerson.departmentName ?? '—'}</strong></div>
              <div><span className="muted">Site</span><strong>{selectedPerson.siteName ?? '—'}</strong></div>
              <div><span className="muted">Title</span><strong>{selectedPerson.title ?? '—'}</strong></div>
              <div><span className="muted">Status</span><strong>{selectedPerson.isActive === false ? 'Inactive' : 'Active'}</strong></div>
            </div>
            <div>
              <span className="muted">Security roles</span>
              <div className="admin-controls-role-list">
                {selectedRoles.map((role) => <span key={role} className="pill pill-role">{role === 'user' ? 'Anyone' : roleLabels[role]}</span>)}
              </div>
            </div>
            {selectedIsInactive && (
              <div className="alert error">This person is inactive and cannot be used for view-as.</div>
            )}
            {!confirming ? (
              <button
                type="button"
                className="accent-button"
                disabled={selectedIsInactive || isStarting}
                onClick={() => setConfirming(true)}
              >
                Enable view as…
              </button>
            ) : (
              <div className="admin-controls-confirm">
                <p>
                  You are about to view the application as <strong>{selectedPerson.name}</strong>, with roles{' '}
                  {selectedRoles.map((role) => (role === 'user' ? 'Anyone' : roleLabels[role])).join(', ')}. Your admin session
                  will be preserved and you can stop viewing as at any time.
                </p>
                <div className="row-actions">
                  <button type="button" className="accent-button" disabled={isStarting} onClick={() => void enableViewAs()}>
                    {isStarting ? 'Opening…' : 'Confirm and view as'}
                  </button>
                  <button type="button" disabled={isStarting} onClick={() => setConfirming(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        {error && <div className="alert error">{error}</div>}
      </div>
    </AccentSection>
  );
}
