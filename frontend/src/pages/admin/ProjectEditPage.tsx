import { FormEvent, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { departmentsApi, errorMessage, projectsApi } from '../../api/client';
import AccentSection from '../../components/admin/AccentSection';
import UserSelect from '../../components/admin/UserSelect';

const STATUSES = ['Intake', 'Planning', 'Active', 'On hold', 'Complete', 'Cancelled'];

function dateInputValue(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

export default function ProjectEditPage() {
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  // Shared by the admin and front-end routes; return to whichever view we came from.
  const inAdmin = useLocation().pathname.startsWith('/admin');
  const listPath = inAdmin ? '/admin/projects' : isNew ? '/projects' : `/projects/${id}`;

  const project = useQuery({
    queryKey: ['project', id],
    queryFn: () => projectsApi.get(id!),
    enabled: !isNew,
  });
  const departments = useQuery({ queryKey: ['departments'], queryFn: departmentsApi.list });

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      isNew ? projectsApi.create(body) : projectsApi.update(id!, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['project', id] });
      navigate(listPath);
    },
    onError: (err) => setError(errorMessage(err)),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const text = (key: string) => String(form.get(key) || '').trim() || undefined;
    save.mutate({
      name: text('name'),
      code: text('code'),
      spotId: text('spotId'),
      status: text('status'),
      managerPersonId: text('managerPersonId'),
      sponsorPersonId: text('sponsorPersonId'),
      delegatePersonId: text('delegatePersonId'),
      isActive: form.get('isActive') === 'on',
      departmentId: text('departmentId'),
      lastCheckIn: text('lastCheckIn'),
      startDate: text('startDate'),
      endDate: text('endDate'),
      problemStatement: text('problemStatement'),
    });
  }

  const current = project.data;

  return (
    <AccentSection
      accent="projects"
      title={isNew ? 'New project' : (current?.name ?? 'Edit project')}
      subtitle={isNew ? 'Create a project record.' : 'Update project details.'}
    >
      {error && <div className="alert error">{error}</div>}
      {!isNew && project.isLoading ? (
        <p className="muted">Loading…</p>
      ) : (
        <form className="card" onSubmit={handleSubmit} key={current?.id ?? 'new'}>
          <div className="grid cols-3">
            <div className="field">
              <label htmlFor="name">Project name</label>
              <input id="name" name="name" required maxLength={200} defaultValue={current?.name ?? ''} />
            </div>
            <div className="field">
              <label htmlFor="code">Code</label>
              <input id="code" name="code" maxLength={50} defaultValue={current?.code ?? ''} />
            </div>
            <div className="field">
              <label htmlFor="spotId">SPOT ID</label>
              <input id="spotId" name="spotId" maxLength={50} defaultValue={current?.spotId ?? ''} />
            </div>
          </div>

          <div className="grid cols-2">
            <UserSelect id="managerPersonId" name="managerPersonId" label="Project manager" personValue defaultValue={current?.managerPersonId} />
            <UserSelect id="sponsorPersonId" name="sponsorPersonId" label="Project sponsor" personValue defaultValue={current?.sponsorPersonId} />
          </div>

          <div className="grid cols-3">
            <div className="field">
              <label htmlFor="departmentId">Department</label>              <select id="departmentId" name="departmentId" defaultValue={current?.departmentId ?? ''}>
                <option value="">—</option>
                {departments.data?.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="status">Status</label>
              <select id="status" name="status" defaultValue={current?.status ?? 'Planning'}>
                {STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="lastCheckIn">Last check-in</label>
              <input
                id="lastCheckIn"
                name="lastCheckIn"
                type="date"
                defaultValue={dateInputValue(current?.lastCheckIn)}
              />
            </div>
          </div>

          <div className="grid cols-2">
            <div className="field">
              <label htmlFor="startDate">Start date</label>
              <input id="startDate" name="startDate" type="date" defaultValue={dateInputValue(current?.startDate)} />
            </div>
            <div className="field">
              <label htmlFor="endDate">End date</label>
              <input id="endDate" name="endDate" type="date" defaultValue={dateInputValue(current?.endDate)} />
            </div>
          </div>

          <div className="field">
            <label htmlFor="problemStatement">Problem statement</label>
            <textarea
              id="problemStatement"
              name="problemStatement"
              maxLength={4000}
              defaultValue={current?.problemStatement ?? ''}
            />
          </div>

          <div style={{ maxWidth: 320 }}>
            <UserSelect id="delegatePersonId" name="delegatePersonId" label="Project demand delegate" personValue defaultValue={current?.delegatePersonId} />
          </div>

          <label className="switch" style={{ marginBottom: '1rem' }}>
            <input type="checkbox" name="isActive" defaultChecked={current?.isActive !== false} />
            <span className="switch-track" aria-hidden="true" />
            <span className="switch-label">Active</span>
          </label>

          <div className="row-actions">
            <button className="accent-button" type="submit" disabled={save.isPending}>
              {save.isPending ? 'Saving…' : 'Save project'}
            </button>
            <button type="button" onClick={() => navigate(listPath)}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </AccentSection>
  );
}
