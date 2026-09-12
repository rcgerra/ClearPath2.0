import { FormEvent, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { demandApi, errorMessage, lookupsApi, peopleApi, projectsApi } from '../api/client';
import WeeklyGrid from '../components/WeeklyGrid';
import { useAuthStore } from '../store/authStore';
import { sumWeeks } from '../utils/arrayParser';

export default function ProjectManagerDashboard() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const [projectId, setProjectId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const projects = useQuery({
    queryKey: ['projects', 'mine', user?.personId],
    queryFn: () => projectsApi.list(user?.personId ? { managerPersonId: user.personId } : undefined),
  });
  const people = useQuery({ queryKey: ['people'], queryFn: () => peopleApi.list({ active: true }) });
  const functions = useQuery({ queryKey: ['lookups', 'functions'], queryFn: () => lookupsApi.list('functions') });
  const team = useQuery({
    queryKey: ['project-team', projectId],
    queryFn: () => projectsApi.team(projectId),
    enabled: Boolean(projectId),
  });

  useEffect(() => {
    if (!projectId && projects.data?.length) setProjectId(projects.data[0].id);
  }, [projects.data, projectId]);

  const addDemand = useMutation({
    mutationFn: (body: {
      personId?: string;
      functionId?: string;
      startWeek: number;
      endWeek: number;
      hoursPerWeek: number;
    }) => demandApi.create({ projectId, ...body }),
    onSuccess: () => {
      setMessage('Demand added to the project.');
      queryClient.invalidateQueries({ queryKey: ['project-team', projectId] });
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const setWeek = useMutation({
    mutationFn: ({ demandId, week, hours }: { demandId: string; week: number; hours: number }) =>
      demandApi.setWeeks(demandId, { week, hours }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['project-team', projectId] }),
    onError: (err) => setError(errorMessage(err)),
  });

  const removeDemand = useMutation({
    mutationFn: (id: string) => demandApi.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['project-team', projectId] }),
    onError: (err) => setError(errorMessage(err)),
  });

  function handleAddDemand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    addDemand.mutate({
      personId: String(form.get('personId') || '') || undefined,
      functionId: String(form.get('functionId') || '') || undefined,
      startWeek: Number(form.get('startWeek') || 0),
      endWeek: Number(form.get('endWeek') || 0),
      hoursPerWeek: Number(form.get('hoursPerWeek') || 0),
    });
    event.currentTarget.reset();
  }

  const selected = projects.data?.find((project) => project.id === projectId);

  return (
    <>
      <h1 className="page-title">Project manager</h1>
      <p className="page-subtitle">Build your team and shape weekly demand.</p>

      {message && <div className="alert success">{message}</div>}
      {error && <div className="alert error">{error}</div>}

      <div className="card">
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <div style={{ minWidth: 300 }}>
            <label htmlFor="project">Project</label>
            <select id="project" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
              <option value="">Select…</option>
              {projects.data?.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>
          {selected && (
            <div className="muted" style={{ alignSelf: 'flex-end' }}>
              {selected.status ?? 'No status'} · priority {selected.priorityScore ?? 0}
            </div>
          )}
        </div>
        {selected?.problemStatement && (
          <p className="muted" style={{ marginTop: '0.9rem' }}>
            <strong>Problem statement:</strong> {selected.problemStatement}
          </p>
        )}
      </div>

      <div className="card">
        <h2>Add demand</h2>
        <form onSubmit={handleAddDemand} className="toolbar">
          <div style={{ flex: 2 }}>
            <label htmlFor="personId">Person</label>
            <select id="personId" name="personId">
              <option value="">Unnamed (role placeholder)</option>
              {people.data?.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                  {person.departmentName ? ` · ${person.departmentName}` : ''}
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label htmlFor="demandFunction">Function</label>
            <select id="demandFunction" name="functionId">
              <option value="">—</option>
              {functions.data?.map((fn) => (
                <option key={fn.id} value={fn.id}>
                  {fn.name}
                </option>
              ))}
            </select>
          </div>
          <div style={{ width: 110 }}>
            <label htmlFor="startWeek">Start week</label>
            <input id="startWeek" name="startWeek" type="number" min={0} max={1332} defaultValue={0} />
          </div>
          <div style={{ width: 110 }}>
            <label htmlFor="endWeek">End week</label>
            <input id="endWeek" name="endWeek" type="number" min={0} max={1332} defaultValue={11} />
          </div>
          <div style={{ width: 110 }}>
            <label htmlFor="hoursPerWeek">Hrs/week</label>
            <input id="hoursPerWeek" name="hoursPerWeek" type="number" min={0} max={99} defaultValue={8} />
          </div>
          <button className="primary" type="submit" disabled={!projectId || addDemand.isPending}>
            Add
          </button>
          <button type="reset" disabled={addDemand.isPending}>
            Cancel
          </button>
        </form>
      </div>

      {team.data?.map((row) => (
        <div className="card" key={row.id}>
          <h2>
            {row.personName ?? 'Unassigned role'}{' '}
            <span className="muted">· {row.functionName ?? 'No function'}</span>
          </h2>
          <p className="muted">
            Next 16 weeks: {sumWeeks(row.weeks, 0, 15)} h committed
            {row.status ? ` · ${row.status}` : ''}
          </p>
          <WeeklyGrid
            values={row.weeks}
            weekCount={16}
            onChange={(week, hours) => setWeek.mutate({ demandId: row.id, week, hours })}
          />
          <div className="row-actions" style={{ marginTop: '0.75rem' }}>
            <button className="danger" onClick={() => removeDemand.mutate(row.id)} disabled={removeDemand.isPending}>
              Remove from team
            </button>
          </div>
        </div>
      ))}

      {projectId && team.data?.length === 0 && <p className="muted">No demand rows yet for this project.</p>}
    </>
  );
}
