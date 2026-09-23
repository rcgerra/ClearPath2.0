import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi, departmentsApi, errorMessage, lookupsApi, projectsApi, requestsApi } from '../api/client';
import { PLANNING_HORIZONS, sumWeeks } from '../utils/arrayParser';
import { useAuthStore } from '../store/authStore';
import { isAdmin } from '../utils/permissions';

export default function AdminDashboard() {
  const user = useAuthStore((state) => state.user);
  const canConfigure = isAdmin(user);
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [horizon, setHorizon] = useState(26);

  const portfolio = useQuery({ queryKey: ['portfolio'], queryFn: adminApi.portfolio });
  const departments = useQuery({ queryKey: ['departments'], queryFn: departmentsApi.list });
  const projects = useQuery({ queryKey: ['projects'], queryFn: () => projectsApi.list() });
  const requests = useQuery({ queryKey: ['requests'], queryFn: () => requestsApi.list() });
  const functions = useQuery({ queryKey: ['lookups', 'functions'], queryFn: () => lookupsApi.list('functions') });

  const syncUsers = useMutation({
    mutationFn: () => adminApi.syncUsers(false),
    onSuccess: (result) =>
      setMessage(
        `User sync complete — scanned ${result.scanned}, created ${result.created}, updated ${result.updated}, skipped ${result.skipped}.`,
      ),
    onError: (err) => setError(errorMessage(err)),
  });

  const createDepartment = useMutation({
    mutationFn: (body: { name: string; code?: string }) => departmentsApi.create(body),
    onSuccess: () => {
      setMessage('Department created.');
      queryClient.invalidateQueries({ queryKey: ['departments'] });
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const createProject = useMutation({
    mutationFn: (body: { name: string; departmentId?: string; status: string }) => projectsApi.create(body),
    onSuccess: () => {
      setMessage('Project created.');
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const promote = useMutation({
    mutationFn: (id: string) => requestsApi.promote(id),
    onSuccess: () => {
      setMessage('Request promoted to a project.');
      queryClient.invalidateQueries({ queryKey: ['requests'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: (err) => setError(errorMessage(err)),
  });

  function handleDepartment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    createDepartment.mutate({ name: String(form.get('name')), code: String(form.get('code') || '') || undefined });
    event.currentTarget.reset();
  }

  function handleProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    createProject.mutate({
      name: String(form.get('name')),
      departmentId: String(form.get('departmentId') || '') || undefined,
      status: 'Planning',
    });
    event.currentTarget.reset();
  }

  const supply = portfolio.data ? sumWeeks(portfolio.data.availability, 0, horizon - 1) : 0;
  const demand = portfolio.data ? sumWeeks(portfolio.data.demand, 0, horizon - 1) : 0;

  return (
    <>
      <h1 className="page-title">{canConfigure ? 'Administration' : 'Portfolio Overview'}</h1>
      <p className="page-subtitle">{canConfigure ? 'Portfolio configuration, reference data and Dataverse synchronization.' : 'Read-only supply, demand, project, and department context.'}</p>

      <div className="workspace-horizon-bar">
        <span>Planning horizon</span>
        <div className="pill-toggle" role="group" aria-label="Planning horizon">
          {PLANNING_HORIZONS.map((weeks) => <button key={weeks} type="button" className={horizon === weeks ? 'active' : ''} onClick={() => setHorizon(weeks)}>{weeks} weeks</button>)}
        </div>
      </div>

      {message && <div className="alert success">{message}</div>}
      {error && <div className="alert error">{error}</div>}

      <div className="grid cols-4" style={{ marginBottom: '1.25rem' }}>
        <div className="stat">
          <div className="label">Projects</div>
          <div className="value">{portfolio.data?.projectCount ?? '—'}</div>
        </div>
        <div className="stat">
          <div className="label">Requests</div>
          <div className="value">{portfolio.data?.requestCount ?? '—'}</div>
        </div>
        <div className="stat">
          <div className="label">Supply ({horizon} wks)</div>
          <div className="value">{supply.toLocaleString()} h</div>
        </div>
        <div className="stat">
          <div className="label">Demand ({horizon} wks)</div>
          <div className="value" style={{ color: demand > supply ? 'var(--danger)' : 'var(--success)' }}>
            {demand.toLocaleString()} h
          </div>
        </div>
      </div>

      {canConfigure && <>
      <div className="card">
        <h2>Dataverse</h2>
        <p className="muted">
          The User table is read-only. Sync copies active directory users into _People without touching local
          department, function or role assignments.
        </p>
        <button className="primary" onClick={() => syncUsers.mutate()} disabled={syncUsers.isPending}>
          {syncUsers.isPending ? 'Syncing…' : 'Sync users to _People'}
        </button>
      </div>

      <div className="grid cols-2">
        <div className="card">
          <h2>Departments</h2>
          <form onSubmit={handleDepartment} className="toolbar">
            <div style={{ flex: 2 }}>
              <label htmlFor="dept-name">Name</label>
              <input id="dept-name" name="name" required maxLength={200} />
            </div>
            <div style={{ flex: 1 }}>
              <label htmlFor="dept-code">Code</label>
              <input id="dept-code" name="code" maxLength={50} />
            </div>
            <button className="primary" type="submit" disabled={createDepartment.isPending}>
              Add
            </button>
            <button type="reset" disabled={createDepartment.isPending}>
              Cancel
            </button>
          </form>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Code</th>
                <th>Lead</th>
              </tr>
            </thead>
            <tbody>
              {departments.data?.map((dept) => (
                <tr key={dept.id}>
                  <td>{dept.name}</td>
                  <td>{dept.code ?? '—'}</td>
                  <td>{dept.leadName ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h2>Projects</h2>
          <form onSubmit={handleProject} className="toolbar">
            <div style={{ flex: 2 }}>
              <label htmlFor="proj-name">Name</label>
              <input id="proj-name" name="name" required maxLength={200} />
            </div>
            <div style={{ flex: 1 }}>
              <label htmlFor="proj-dept">Department</label>
              <select id="proj-dept" name="departmentId">
                <option value="">—</option>
                {departments.data?.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name}
                  </option>
                ))}
              </select>
            </div>
            <button className="primary" type="submit" disabled={createProject.isPending}>
              Add
            </button>
            <button type="reset" disabled={createProject.isPending}>
              Cancel
            </button>
          </form>
          <table>
            <thead>
              <tr>
                <th>Project</th>
                <th>Department</th>
                <th>Status</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
              {projects.data?.map((project) => (
                <tr key={project.id}>
                  <td>{project.name}</td>
                  <td>{project.departmentName ?? '—'}</td>
                  <td>
                    <span className="badge">{project.status ?? 'Unknown'}</span>
                  </td>
                  <td>{project.priorityScore ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2>Intake queue</h2>
        <table>
          <thead>
            <tr>
              <th>Request</th>
              <th>Requester</th>
              <th>Department</th>
              <th>Score</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {requests.data?.map((request) => (
              <tr key={request.id}>
                <td>{request.title ?? request.name}</td>
                <td>{request.requesterName ?? '—'}</td>
                <td>{request.departmentName ?? '—'}</td>
                <td>{request.priorityScore ?? 0}</td>
                <td>
                  <span className="badge">{request.status ?? '—'}</span>
                </td>
                <td className="row-actions">
                  <button
                    onClick={() => promote.mutate(request.id)}
                    disabled={promote.isPending || Boolean(request.projectId)}
                  >
                    {request.projectId ? 'Promoted' : 'Promote'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Functions</h2>
        <p className="muted">{functions.data?.map((fn) => fn.name).join(' · ') || 'No functions defined yet.'}</p>
      </div>
      </>}
    </>
  );
}
