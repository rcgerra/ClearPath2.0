import { FormEvent, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { departmentsApi, errorMessage, peopleApi, usersApi } from '../../api/client';
import AccentSection from '../../components/admin/AccentSection';
import SkillsCard from '../../components/SkillsCard';
import { useAuthStore } from '../../store/authStore';
import { canEditAvailability } from '../../utils/permissions';

const EMPLOYMENT_TYPES = ['FTE', 'Contractor'];

export default function PersonEditPage() {
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState('');
  const [directoryUserId, setDirectoryUserId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [isActive, setIsActive] = useState(true);

  const person = useQuery({ queryKey: ['person', id], queryFn: () => peopleApi.get(id!), enabled: !isNew });
  const departments = useQuery({ queryKey: ['departments'], queryFn: departmentsApi.list });
  const directory = useQuery({
    queryKey: ['users', userSearch],
    queryFn: () => usersApi.search(userSearch),
    enabled: isNew && userSearch.length > 2,
  });

  const current = person.data;

  useEffect(() => {
    setDepartmentId(current?.departmentId ?? '');
    setIsActive(current?.isActive !== false);
  }, [current?.id]);

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => (isNew ? peopleApi.create(body) : peopleApi.update(id!, body)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['people'] });
      queryClient.invalidateQueries({ queryKey: ['person', id] });
      navigate('/admin/people');
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const selectedDirectoryUser = directory.data?.find((entry) => entry.id === directoryUserId);
  const selectedDepartment = departments.data?.find((dept) => dept.id === departmentId);
  const email = selectedDirectoryUser?.email ?? current?.email ?? '';
  const title = selectedDirectoryUser?.jobTitle ?? current?.title ?? '';
  const functionName = selectedDepartment?.functionName ?? 'Inferred from department';
  const authUser = useAuthStore((state) => state.user);
  const canEditSkills = Boolean(current) && canEditAvailability(authUser, { personId: current?.id, department: selectedDepartment });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const text = (key: string) => String(form.get(key) || '').trim() || undefined;

    save.mutate({
      name: selectedDirectoryUser?.fullName ?? text('name'),
      email: email || undefined,
      userId: directoryUserId || undefined,
      departmentId: departmentId || undefined,
      employmentType: text('employmentType'),
      title: title || undefined,
      role: text('role'),
      isActive,
    });
  }

  return (
    <AccentSection
      accent="people"
      title={isNew ? 'New person' : (current?.name ?? 'Edit person')}
      subtitle={isNew ? 'Add someone to the roster.' : 'Update roster details.'}
      actions={
        <label className="switch" style={{ margin: 0 }}>
          <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />
          <span className="switch-track" aria-hidden="true" />
          <span className="switch-label">{isActive ? 'Active' : 'Inactive'}</span>
        </label>
      }
    >
      {error && <div className="alert error">{error}</div>}
      {!isNew && person.isLoading ? (
        <p className="muted">Loading…</p>
      ) : (
        <form className="card" onSubmit={handleSubmit} key={current?.id ?? 'new'}>
          {isNew && (
            <div className="grid cols-2">
              <div className="field">
                <label htmlFor="userSearch">Search directory (read-only User table)</label>
                <input
                  id="userSearch"
                  value={userSearch}
                  onChange={(event) => setUserSearch(event.target.value)}
                  placeholder="Type at least 3 characters"
                />
              </div>
              <div className="field">
                <label htmlFor="userId">Linked directory user</label>
                <select id="userId" name="userId" value={directoryUserId} onChange={(event) => setDirectoryUserId(event.target.value)}>
                  <option value="">— not linked —</option>
                  {directory.data?.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.fullName} {entry.email ? `(${entry.email})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="grid cols-2">
            <div className="field">
              <label htmlFor="name">Name</label>
              <input id="name" name="name" maxLength={200} defaultValue={current?.name ?? ''} />
            </div>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" value={email} disabled title="Sourced from Active Directory" />
            </div>
          </div>

          <div className="grid cols-3">
            <div className="field">
              <label htmlFor="departmentId">Department</label>
              <select id="departmentId" name="departmentId" value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}>
                <option value="">—</option>
                {departments.data?.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="functionDisplay">Function</label>
              <input id="functionDisplay" value={functionName} disabled />
            </div>
            <div className="field">
              <label htmlFor="employmentType">Employment type</label>
              <select id="employmentType" name="employmentType" defaultValue={current?.employmentType ?? 'FTE'}>
                {EMPLOYMENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid cols-2">
            <div className="field">
              <label htmlFor="title">Job title</label>
              <input id="title" value={title} disabled title="Sourced from Active Directory" />
            </div>
            <div className="field">
              <label htmlFor="role">App roles (semicolon separated)</label>
              <input
                id="role"
                name="role"
                maxLength={100}
                placeholder="user;portfolio_manager"
                defaultValue={current?.role ?? ''}
              />
            </div>
          </div>

          <div className="row-actions">
            <button className="accent-button" type="submit" disabled={save.isPending}>
              {save.isPending ? 'Saving…' : 'Save person'}
            </button>
            <button type="button" onClick={() => navigate('/admin/people')}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {!isNew && current && (
        <SkillsCard personId={current.id} canEdit={canEditSkills} subtitle="Skills recorded on this person's profile." />
      )}
    </AccentSection>
  );
}
