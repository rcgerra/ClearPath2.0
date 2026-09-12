import { FormEvent, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { capacityApi, departmentsApi, errorMessage, lookupsApi, peopleApi, usersApi } from '../api/client';
import WeeklyGrid from '../components/WeeklyGrid';
import { useAuthStore } from '../store/authStore';
import { decodeArray, sumWeeks } from '../utils/arrayParser';

export default function DeptLeadDashboard() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const [departmentId, setDepartmentId] = useState(user?.departmentId ?? '');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState('');

  const departments = useQuery({ queryKey: ['departments'], queryFn: departmentsApi.list });
  const functions = useQuery({ queryKey: ['lookups', 'functions'], queryFn: () => lookupsApi.list('functions') });
  const team = useQuery({
    queryKey: ['team', departmentId],
    queryFn: () => departmentsApi.team(departmentId),
    enabled: Boolean(departmentId),
  });
  const directory = useQuery({
    queryKey: ['users', userSearch],
    queryFn: () => usersApi.search(userSearch),
    enabled: userSearch.length > 2,
  });

  useEffect(() => {
    if (!departmentId && departments.data?.length) setDepartmentId(departments.data[0].id);
  }, [departments.data, departmentId]);

  const addMember = useMutation({
    mutationFn: (body: { name: string; email?: string; userId?: string; functionId?: string; weeklyHours?: number }) =>
      peopleApi.create({ ...body, departmentId }),
    onSuccess: () => {
      setMessage('Team member added.');
      queryClient.invalidateQueries({ queryKey: ['team', departmentId] });
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const createCapacity = useMutation({
    mutationFn: (body: { personId: string; weeklyBaseline: number }) =>
      capacityApi.create({ ...body, departmentId, weeks: new Array(52).fill(body.weeklyBaseline) }),
    onSuccess: () => {
      setMessage('Availability baseline created.');
      queryClient.invalidateQueries({ queryKey: ['team', departmentId] });
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const setWeek = useMutation({
    mutationFn: ({ capacityId, week, hours }: { capacityId: string; week: number; hours: number }) =>
      capacityApi.setWeeks(capacityId, { week, hours }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['team', departmentId] }),
    onError: (err) => setError(errorMessage(err)),
  });

  function handleAddMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const directoryId = String(form.get('userId') || '');
    const selected = directory.data?.find((entry) => entry.id === directoryId);
    addMember.mutate({
      name: selected?.fullName ?? String(form.get('name') || ''),
      email: selected?.email,
      userId: directoryId || undefined,
      functionId: String(form.get('functionId') || '') || undefined,
      weeklyHours: Number(form.get('weeklyHours') || 40),
    });
    event.currentTarget.reset();
  }

  return (
    <>
      <h1 className="page-title">Department lead</h1>
      <p className="page-subtitle">Manage your team roster and weekly availability.</p>

      {message && <div className="alert success">{message}</div>}
      {error && <div className="alert error">{error}</div>}

      <div className="card">
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <div style={{ minWidth: 260 }}>
            <label htmlFor="dept">Department</label>
            <select id="dept" value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}>
              <option value="">Select…</option>
              {departments.data?.map((dept) => (
                <option key={dept.id} value={dept.id}>
                  {dept.name}
                </option>
              ))}
            </select>
          </div>
          <div className="muted" style={{ alignSelf: 'flex-end' }}>
            {team.data?.length ?? 0} people
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Add a team member</h2>
        <form onSubmit={handleAddMember} className="toolbar">
          <div style={{ flex: 2 }}>
            <label htmlFor="userSearch">Search directory (read-only User table)</label>
            <input
              id="userSearch"
              value={userSearch}
              onChange={(event) => setUserSearch(event.target.value)}
              placeholder="Type at least 3 characters"
            />
          </div>
          <div style={{ flex: 2 }}>
            <label htmlFor="userId">Directory user</label>
            <select id="userId" name="userId">
              <option value="">—</option>
              {directory.data?.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.fullName} {entry.email ? `(${entry.email})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label htmlFor="functionId">Function</label>
            <select id="functionId" name="functionId">
              <option value="">—</option>
              {functions.data?.map((fn) => (
                <option key={fn.id} value={fn.id}>
                  {fn.name}
                </option>
              ))}
            </select>
          </div>
          <div style={{ width: 120 }}>
            <label htmlFor="weeklyHours">Weekly hrs</label>
            <input id="weeklyHours" name="weeklyHours" type="number" min={0} max={99} defaultValue={40} />
          </div>
          <button className="primary" type="submit" disabled={!departmentId || addMember.isPending}>
            Add
          </button>
          <button type="reset" disabled={addMember.isPending}>
            Cancel
          </button>
        </form>
      </div>

      {team.data?.map((member) => {
        const weeks = decodeArray(member.availabilityHours);
        return (
          <div className="card" key={member.id}>
            <h2>
              {member.name} <span className="muted">· {member.functionName ?? 'No function'}</span>
            </h2>
            <p className="muted">
              {member.email ?? 'No email'} · standard {member.weeklyHours ?? 0} h/wk · next 16 weeks:{' '}
              {sumWeeks(weeks, 0, 15)} h available
            </p>
            {member.capacityId ? (
              <WeeklyGrid
                values={weeks}
                weekCount={16}
                onChange={(week, hours) => setWeek.mutate({ capacityId: member.capacityId!, week, hours })}
              />
            ) : (
              <button
                onClick={() =>
                  createCapacity.mutate({ personId: member.id, weeklyBaseline: member.weeklyHours ?? 40 })
                }
                disabled={createCapacity.isPending}
              >
                Create availability baseline
              </button>
            )}
          </div>
        );
      })}
    </>
  );
}
