import { FormEvent, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { departmentsApi, errorMessage, lookupsApi, peopleApi, usersApi } from '../../api/client';
import AccentSection from '../../components/admin/AccentSection';

const EMPLOYMENT_TYPES = ['FTE', 'Contractor'];

export default function PersonEditPage() {
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState('');

  const person = useQuery({ queryKey: ['person', id], queryFn: () => peopleApi.get(id!), enabled: !isNew });
  const departments = useQuery({ queryKey: ['departments'], queryFn: departmentsApi.list });
  const functions = useQuery({ queryKey: ['lookups', 'functions'], queryFn: () => lookupsApi.list('functions') });
  const directory = useQuery({
    queryKey: ['users', userSearch],
    queryFn: () => usersApi.search(userSearch),
    enabled: isNew && userSearch.length > 2,
  });

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => (isNew ? peopleApi.create(body) : peopleApi.update(id!, body)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['people'] });
      queryClient.invalidateQueries({ queryKey: ['person', id] });
      navigate('/admin/people');
    },
    onError: (err) => setError(errorMessage(err)),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const text = (key: string) => String(form.get(key) || '').trim() || undefined;
    const directoryId = text('userId');
    const selected = directory.data?.find((entry) => entry.id === directoryId);
    const weeklyHours = Number(form.get('weeklyHours'));

    save.mutate({
      name: selected?.fullName ?? text('name'),
      email: selected?.email ?? text('email'),
      userId: directoryId,
      departmentId: text('departmentId'),
      functionId: text('functionId'),
      employmentType: text('employmentType'),
      title: text('title'),
      role: text('role'),
      weeklyHours: Number.isFinite(weeklyHours) && weeklyHours > 0 ? weeklyHours : undefined,
      isActive: form.get('isActive') === 'on',
    });
  }

  const current = person.data;

  return (
    <AccentSection
      accent="people"
      title={isNew ? 'New person' : (current?.name ?? 'Edit person')}
      subtitle={isNew ? 'Add someone to the roster.' : 'Update roster details.'}
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
                <select id="userId" name="userId">
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
              <input id="email" name="email" type="email" maxLength={320} defaultValue={current?.email ?? ''} />
            </div>
          </div>

          <div className="grid cols-3">
            <div className="field">
              <label htmlFor="departmentId">Department</label>
              <select id="departmentId" name="departmentId" defaultValue={current?.departmentId ?? ''}>
                <option value="">—</option>
                {departments.data?.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="functionId">Function</label>
              <select id="functionId" name="functionId" defaultValue={current?.functionId ?? ''}>
                <option value="">—</option>
                {functions.data?.map((fn) => (
                  <option key={fn.id} value={fn.id}>
                    {fn.name}
                  </option>
                ))}
              </select>
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

          <div className="grid cols-3">
            <div className="field">
              <label htmlFor="title">Job title</label>
              <input id="title" name="title" maxLength={200} defaultValue={current?.title ?? ''} />
            </div>
            <div className="field">
              <label htmlFor="role">App roles (semicolon separated)</label>
              <input
                id="role"
                name="role"
                maxLength={100}
                placeholder="user;availability_moderator"
                defaultValue={current?.role ?? ''}
              />
            </div>
            <div className="field">
              <label htmlFor="weeklyHours">Weekly hours</label>
              <input
                id="weeklyHours"
                name="weeklyHours"
                type="number"
                min={0}
                max={99}
                defaultValue={current?.weeklyHours ?? 40}
              />
            </div>
          </div>

          <label className="switch" style={{ marginBottom: '1rem' }}>
            <input type="checkbox" name="isActive" defaultChecked={current?.isActive !== false} />
            <span className="switch-track" aria-hidden="true" />
            <span className="switch-label">Active</span>
          </label>

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
    </AccentSection>
  );
}
