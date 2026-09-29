import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { capacityApi, demandApi, departmentsApi, governanceApi, lookupsApi, nonProjectDemandApi, peopleApi, prioritizationApi, projectsApi, requestsApi } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { isMine, ownershipRole } from '../utils/ownership';
import { buildAllocationConflicts } from '../utils/allocationRisk';
import { calculateProjectScheduleHealth } from '../utils/projectSchedule';
import CapacityChart from '../components/CapacityChart';
import CapacityGapChart from '../components/CapacityGapChart';
import SkillsCard from '../components/SkillsCard';
import { weekLabel, weekLabelShort } from '../utils/arrayParser';
import type { Department } from '../types';

const OUTLOOK_WEEKS = 13;

function addWeeks(total: number[], weeks: number[]) {
  for (let week = 0; week < OUTLOOK_WEEKS; week += 1) total[week] += weeks[week] ?? 0;
}

function reviewAge(lastCheckIn: string | undefined): number {
  if (!lastCheckIn) return Number.POSITIVE_INFINITY;
  const reviewed = new Date(lastCheckIn).getTime();
  return Number.isNaN(reviewed) ? Number.POSITIVE_INFINITY : Math.floor((Date.now() - reviewed) / 86_400_000);
}

export default function HomePage() {
  const user = useAuthStore((state) => state.user);
  const [localHour, setLocalHour] = useState(() => new Date().getHours());
  const [outlookView, setOutlookView] = useState('work');

  useEffect(() => {
    const interval = window.setInterval(() => setLocalHour(new Date().getHours()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const greeting = localHour < 12 ? 'Good Morning' : localHour < 17 ? 'Good Afternoon' : 'Good Evening';
  const projects = useQuery({ queryKey: ['projects'], queryFn: () => projectsApi.list() });
  const departments = useQuery({ queryKey: ['departments'], queryFn: departmentsApi.list });
  const functions = useQuery({ queryKey: ['lookups', 'functions'], queryFn: () => lookupsApi.list('functions') });
  const people = useQuery({ queryKey: ['people'], queryFn: () => peopleApi.list() });
  const capacity = useQuery({ queryKey: ['capacity', 'all'], queryFn: () => capacityApi.list() });
  const demand = useQuery({ queryKey: ['demand', 'all'], queryFn: () => demandApi.list() });
  const nonProjectDemand = useQuery({ queryKey: ['non-project-demand', 'all'], queryFn: () => nonProjectDemandApi.list() });
  const myRequests = useQuery({ queryKey: ['requests', 'mine'], queryFn: () => requestsApi.list({ mine: true }) });
  const sponsorRequests = useQuery({ queryKey: ['sponsored-requests'], queryFn: prioritizationApi.requests });
  const governance = useQuery({ queryKey: ['governance'], queryFn: governanceApi.list });
  const personId = user?.personId;
  const activePersonIds = useMemo(() => new Set(
    (people.data ?? []).filter((person) => person.isActive !== false).map((person) => person.id.toLowerCase()),
  ), [people.data]);

  const openRequests = useMemo(
    () => (myRequests.data ?? []).filter((request) =>
      request.phase !== 'Processed' && !request.projectId && !['Cancelled', 'Not Endorsed'].includes(request.disposition ?? 'Pending'),
    ),
    [myRequests.data],
  );
  const needsPrioritization = useMemo(
    () => [...(sponsorRequests.data ?? [])]
      .filter((request) => !request.prioritizationComplete)
      .sort((left, right) => String(right.submittedOn ?? '').localeCompare(String(left.submittedOn ?? ''))),
    [sponsorRequests.data],
  );

  const myProjects = useMemo(
    () => (projects.data ?? []).filter((project) => project.isActive !== false && personId && (
      project.managerPersonId?.toLowerCase() === personId.toLowerCase()
      || project.delegatePersonId?.toLowerCase() === personId.toLowerCase()
    )),
    [personId, projects.data],
  );
  const myDepartments = useMemo(
    () => (departments.data ?? []).filter((department) => department.isActive !== false && isMine(department, personId)),
    [departments.data, personId],
  );
  const ledFunctions = useMemo(() => (functions.data ?? []).filter((item) => personId && (
    item.leadPersonId?.toLowerCase() === personId.toLowerCase()
    || item.assistantLeadPersonIds?.some((id) => id.toLowerCase() === personId.toLowerCase())
  )), [functions.data, personId]);
  const outlookViews = [
    ...ledFunctions.map((item) => ({ id: `function:${item.id}`, label: 'My Function' })),
    ...(myDepartments.length > 0 ? [{ id: 'departments', label: 'My Departments' }] : []),
    { id: 'work', label: 'My Work' },
  ];
  const activeOutlookView = outlookViews.find((view) => view.id === outlookView) ?? outlookViews[0];
  const activeFunction = ledFunctions.find((item) => activeOutlookView.id === `function:${item.id}`);
  const functionDepartments = useMemo(() => {
    const functionId = activeFunction?.id.toLowerCase();
    return (departments.data ?? []).filter((department) =>
      Boolean(functionId) && department.isActive !== false && department.functionId?.toLowerCase() === functionId,
    );
  }, [departments.data, activeFunction?.id]);
  const departmentGapSeries = useMemo(() => {
    const selected: Department[] = activeFunction ? functionDepartments : myDepartments;
    const personDepartment = new Map((people.data ?? []).map((person) => [person.id.toLowerCase(), person.departmentId?.toLowerCase()]));
    return selected.map((department) => {
      const availability = Array(OUTLOOK_WEEKS).fill(0) as number[];
      const committed = Array(OUTLOOK_WEEKS).fill(0) as number[];
      const departmentId = department.id.toLowerCase();
      for (const row of capacity.data ?? []) {
        if (row.isActive !== false && activePersonIds.has(row.personId.toLowerCase()) && (personDepartment.get(row.personId.toLowerCase()) ?? row.departmentId?.toLowerCase()) === departmentId) addWeeks(availability, row.weeks);
      }
      for (const row of [...(demand.data ?? []), ...(nonProjectDemand.data ?? [])]) {
        if (row.isActive !== false && row.personId && activePersonIds.has(row.personId.toLowerCase()) && (personDepartment.get(row.personId.toLowerCase()) ?? ('departmentId' in row ? row.departmentId?.toLowerCase() : undefined)) === departmentId) addWeeks(committed, row.weeks);
      }
      return { id: department.id, label: department.name, availability, committed, weeks: availability.map((hours, week) => hours - committed[week]) };
    });
  }, [activeFunction, functionDepartments, myDepartments, people.data, activePersonIds, capacity.data, demand.data, nonProjectDemand.data]);
  const personalOutlook = useMemo(() => {
    const availability = Array(OUTLOOK_WEEKS).fill(0) as number[];
    const committed = Array(OUTLOOK_WEEKS).fill(0) as number[];
    if (personId && activePersonIds.has(personId.toLowerCase())) {
      for (const row of capacity.data ?? []) {
        if (row.isActive !== false && row.personId.toLowerCase() === personId.toLowerCase()) addWeeks(availability, row.weeks);
      }
      for (const row of [...(demand.data ?? []), ...(nonProjectDemand.data ?? [])]) {
        if (row.isActive !== false && row.personId?.toLowerCase() === personId.toLowerCase()) addWeeks(committed, row.weeks);
      }
    }
    return { availability, committed };
  }, [activePersonIds, capacity.data, demand.data, nonProjectDemand.data, personId]);
  const chartTotals = activeOutlookView.id === 'work'
    ? { capacity: personalOutlook.availability.reduce((sum, hours) => sum + hours, 0), demand: personalOutlook.committed.reduce((sum, hours) => sum + hours, 0) }
    : departmentGapSeries.reduce((totals, series) => ({
      capacity: totals.capacity + series.availability.reduce((sum, hours) => sum + hours, 0),
      demand: totals.demand + series.committed.reduce((sum, hours) => sum + hours, 0),
    }), { capacity: 0, demand: 0 });
  const functionMatrixRows = useMemo(() => departmentGapSeries.map((department) => ({
    ...department,
    overWeeks: department.weeks.filter((gap) => gap < 0).length,
    shortageHours: department.weeks.reduce((sum, gap) => sum + Math.max(0, -gap), 0),
  })).sort((left, right) => right.overWeeks - left.overWeeks || right.shortageHours - left.shortageHours || left.label.localeCompare(right.label)), [departmentGapSeries]);
  const teamPersonIds = useMemo(() => {
    const projectIds = new Set(myProjects.map((project) => project.id));
    const departmentIds = new Set(myDepartments.map((department) => department.id));
    const relevantPersonIds = new Set<string>();
    for (const row of demand.data ?? []) {
      if (row.personId && projectIds.has(row.projectId)) relevantPersonIds.add(row.personId.toLowerCase());
    }
    for (const person of people.data ?? []) {
      if (person.departmentId && departmentIds.has(person.departmentId)) relevantPersonIds.add(person.id.toLowerCase());
    }
    return relevantPersonIds;
  }, [demand.data, myDepartments, myProjects, people.data]);
  const relevantConflicts = useMemo(() => {
    return buildAllocationConflicts({
      capacity: capacity.data ?? [],
      demand: demand.data ?? [],
      nonProjectDemand: nonProjectDemand.data ?? [],
      people: people.data ?? [],
      horizon: 26,
      personIds: teamPersonIds,
    });
  }, [capacity.data, demand.data, nonProjectDemand.data, people.data, teamPersonIds]);
  const scheduleHealthByProject = useMemo(() => {
    const map = new Map<string, ReturnType<typeof calculateProjectScheduleHealth>>();
    for (const project of myProjects) {
      const projectDemand = (demand.data ?? []).filter((row) => row.projectId === project.id);
      const projectPeople = new Set(projectDemand.flatMap((row) => row.personId ? [row.personId.toLowerCase()] : []));
      const conflicts = relevantConflicts.filter((conflict) => projectPeople.has(conflict.personId));
      map.set(project.id, calculateProjectScheduleHealth(project, projectDemand, {
        people: conflicts.length,
        hours: conflicts.reduce((sum, conflict) => sum + conflict.totalOver, 0),
      }));
    }
    return map;
  }, [demand.data, myProjects, relevantConflicts]);
  const conflictPersonIds = useMemo(() => new Set(relevantConflicts.map((conflict) => conflict.personId)), [relevantConflicts]);
  const conflictedDepartmentIds = useMemo(() => new Set(
    (people.data ?? [])
      .filter((person) => conflictPersonIds.has(person.id.toLowerCase()) && person.departmentId)
      .map((person) => person.departmentId as string),
  ), [conflictPersonIds, people.data]);
  const governanceNeedingAttention = useMemo(
    () => (governance.data ?? []).filter(
      (item) => !item.cancelled && item.phase !== 'Processed' && isMine(item, personId),
    ),
    [governance.data, personId],
  );

  const attentionGroups = [
    {
      key: 'opportunities',
      accent: 'accent-requests',
      label: 'Opportunities',
      to: '/requests',
      items: openRequests.map((request) => ({
        id: request.id,
        label: request.shortTitle ?? request.title ?? request.name ?? 'Untitled opportunity',
        to: `/requests/${request.id}`,
      })),
      emptyHint: 'Nothing in your intake queue',
    },
    {
      key: 'priority',
      accent: 'accent-prioritization',
      label: 'Prioritization',
      to: '/prioritization',
      items: needsPrioritization.map((request) => ({
        id: request.id,
        label: request.shortTitle ?? request.title ?? request.name ?? 'Untitled opportunity',
        to: `/prioritization?requestId=${encodeURIComponent(request.id)}`,
      })),
      emptyHint: 'No assessments due',
    },
    {
      key: 'governance',
      accent: 'accent-governance',
      label: 'Governance',
      to: '/governance',
      items: governanceNeedingAttention.map((item) => ({
        id: item.id,
        label: item.shortTitle ?? item.title ?? 'Untitled opportunity',
        to: `/governance/item/${item.id}`,
      })),
      emptyHint: 'Nothing in your governance queue',
    },
  ] as const;
  const attentionCount = attentionGroups.reduce((sum, group) => sum + group.items.length, 0);

  return (
    <section className="operational-home">
      <header className="operational-home-header">
        <div className="operational-home-header-top">
          <div className="operational-home-header-copy">
            <h1 className="page-title">{greeting}, {user?.name?.split(' ')[0] ?? 'planner'}</h1>
            <p>The next 13 weeks at a glance</p>
          </div>

          <div className="operational-home-kpis">
            <div className="home-mini-stat">
              <strong>{Math.round(chartTotals.demand).toLocaleString()} h</strong>
              <span>{activeOutlookView.id === 'work' ? 'Committed demand' : 'Total demand'}</span>
            </div>
            <div className="home-mini-stat">
              <strong>{Math.round(chartTotals.capacity).toLocaleString()} h</strong>
              <span>{activeOutlookView.id === 'work' ? 'Available capacity' : 'Total capacity'}</span>
            </div>
            <div className={`home-mini-stat${chartTotals.demand > chartTotals.capacity ? ' home-mini-stat-over' : ''}`}>
              <strong>{activeOutlookView.id === 'work'
                ? chartTotals.capacity > 0 ? `${Math.round(chartTotals.demand / chartTotals.capacity * 100)}%` : '—'
                : `${Math.round(chartTotals.capacity - chartTotals.demand).toLocaleString()} h`}</strong>
              <span>{activeOutlookView.id === 'work' ? 'Utilization' : 'Capacity gap'}</span>
            </div>
          </div>
        </div>
      </header>

      <div className="home-dashboard-layout">
        <div className="home-dashboard-main">
          <section className="home-outlook">
            <div className="home-focus-heading">
              <div>
                {activeFunction && <span className="home-section-kicker">My Function</span>}
                <h2>{activeFunction?.name ?? activeOutlookView.label}</h2>
                <p>{activeOutlookView.id === 'work'
                  ? `My current assignments and availability over the next ${OUTLOOK_WEEKS} weeks.`
                  : activeFunction
                    ? `Weeks over and under capacity by department in my function over the next ${OUTLOOK_WEEKS} weeks.`
                    : `Capacity gap for my departments over the next ${OUTLOOK_WEEKS} weeks.`}</p>
              </div>
              <div className="home-outlook-navigation" aria-label="Workload chart views">
                <button type="button" aria-label="Previous chart" onClick={() => setOutlookView(outlookViews[(outlookViews.indexOf(activeOutlookView) - 1 + outlookViews.length) % outlookViews.length].id)} disabled={outlookViews.length === 1}>‹</button>
                <span>{outlookViews.indexOf(activeOutlookView) + 1} / {outlookViews.length}</span>
                <button type="button" aria-label="Next chart" onClick={() => setOutlookView(outlookViews[(outlookViews.indexOf(activeOutlookView) + 1) % outlookViews.length].id)} disabled={outlookViews.length === 1}>›</button>
              </div>
            </div>
            {activeFunction ? (
              functionMatrixRows.length > 0 ? (
                <div className="home-function-matrix">
                  <table aria-label="Weekly capacity gap in hours by department">
                    <thead>
                      <tr>
                        <th scope="col" className="home-function-name">Department</th>
                        {Array.from({ length: OUTLOOK_WEEKS }, (_, week) => (
                          <th scope="col" key={week} title={weekLabel(week)}>{weekLabelShort(week)}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {functionMatrixRows.map((department) => (
                        <tr key={department.id}>
                          <th scope="row" className="home-function-name"><Link to={`/departments/${department.id}`} title={department.label}>{department.label}</Link></th>
                          {department.weeks.map((gap, week) => (
                            <td key={week} className={gap < 0 ? 'home-function-deficit' : gap > 0 ? 'home-function-surplus' : 'home-function-balanced'} title={`${weekLabel(week)}: ${Math.round(gap)} h capacity gap`}>
                              {gap > 0 ? '+' : ''}{Math.round(gap)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="home-empty-state">No departments in your function.</p>
            ) : activeOutlookView.id === 'work'
              ? <CapacityChart key={`${myDepartments.length}-${myProjects.length}`} weeks={OUTLOOK_WEEKS} height={120} fillHeight demand={personalOutlook.committed} availability={personalOutlook.availability} />
              : <CapacityGapChart weeks={OUTLOOK_WEEKS} series={departmentGapSeries} />}
          </section>
          {(myDepartments.length > 0 || myProjects.length > 0) && <section className="home-teams" aria-labelledby="home-teams-title">
            <h2 id="home-teams-title">My Teams</h2>
            <div className="home-lower-grid">
              {myDepartments.length > 0 && <section className="home-team-card home-team-card-departments">
                <h3>Departments <span>{myDepartments.length}</span></h3>
                <div className="home-team-list">
                  {myDepartments.map((department) => {
                    const isDelegate = ownershipRole(department, personId) === 'delegate';
                    const overdue = reviewAge(department.lastCheckIn) > 30;
                    const conflicted = conflictedDepartmentIds.has(department.id);
                    const action = [overdue && 'Review overdue', conflicted && 'Allocation risk'].filter(Boolean).join(', ');
                    return (
                      <Link className={`home-team-chip${isDelegate ? ' is-delegate' : ''}`} to={`/departments/${department.id}`} key={department.id}>
                        <span className="home-team-chip-copy">
                          <span className="home-team-name">{department.name}</span>
                          <span className="home-team-meta"><span className="home-team-chip-role">{isDelegate ? 'Delegate' : 'Lead'}</span></span>
                        </span>
                        <span className={`home-team-status${action ? ' is-risk' : ' is-ok'}`} role="img" aria-label={action ? `At risk: ${action}` : 'OK'} title={action || 'OK'}>{action ? '!' : '✓'}</span>
                      </Link>
                    );
                  })}
                </div>
              </section>}
              {myProjects.length > 0 && <section className="home-team-card home-team-card-projects">
                <h3>Projects <span>{myProjects.length}</span></h3>
                <div className="home-team-list">
                  {myProjects.map((project) => {
                    const isDelegate = ownershipRole(project, personId) === 'delegate';
                    const overdue = reviewAge(project.lastCheckIn) > 30;
                    const status = scheduleHealthByProject.get(project.id)?.status;
                    const risk = ['late', 'at-risk', 'needs-dates'].includes(status ?? '');
                    const action = [overdue && 'Review overdue', risk && 'Schedule risk'].filter(Boolean).join(', ');
                    const rating = [0, 1, 5, 10, 15].indexOf(project.priorityScore ?? -1);
                    return (
                      <Link className={`home-team-chip${isDelegate ? ' is-delegate' : ''}`} to={`/projects/${project.id}`} key={project.id} title={project.name}>
                        <span className="home-team-chip-copy">
                          <span className="home-team-name">{project.name}</span>
                          <span className="home-team-meta">
                            {project.spotId?.trim() && <span className="home-team-spot" title={project.spotId.trim()}>{project.spotId.trim()}</span>}
                            <span className="home-team-chip-rating" aria-label={rating >= 0 ? `Score ${project.priorityScore} of 15` : 'Not rated'} title={rating >= 0 ? `Score ${project.priorityScore} of 15` : 'Not rated'}>
                              {[1, 2, 3, 4].map((position) => <span key={position} className={position <= rating ? 'is-filled' : ''} aria-hidden="true">★</span>)}
                            </span>
                            <span className="home-team-chip-role">{isDelegate ? 'Delegate' : 'PM'}</span>
                          </span>
                        </span>
                        <span className={`home-team-status${action ? ' is-risk' : ' is-ok'}`} role="img" aria-label={action ? `At risk: ${action}` : 'OK'} title={action || 'OK'}>{action ? '!' : '✓'}</span>
                      </Link>
                    );
                  })}
                </div>
              </section>}
            </div>
          </section>}

        </div>

        <div className="home-dashboard-side">
          {personId && (
            <section className="home-skills-section">
              <SkillsCard personId={personId} canEdit title="My skillset" compact />
            </section>
          )}
          <aside className="home-attention" aria-label="Things needing my attention">
            <div className="home-attention-heading">
              <div><span className="home-section-kicker">Your queue</span><h2>Needs attention</h2></div>
              <strong aria-label={`${attentionCount} items needing attention`}>{attentionCount}</strong>
            </div>

            <div className="home-attention-summary">
              {attentionGroups.map((group) => (
                  <section className={`home-attention-group ${group.accent}`} key={group.key}>
                    <div className="home-attention-tile">
                      <span className="home-attention-tile-count">{group.items.length}</span>
                      <span className="home-attention-tile-copy"><strong>{group.label}</strong></span>
                      <Link className="home-attention-more" to={group.to} aria-label={`View all ${group.label.toLowerCase()}`}>View all</Link>
                    </div>
                    <div className="home-attention-items">
                      {group.items.slice(0, 3).map((item) => (
                        <Link to={item.to} className="home-attention-item" key={item.id} title={item.label}>{item.label}</Link>
                      ))}
                      {group.items.length === 0 && <p className="home-empty-state">{group.emptyHint}</p>}
                    </div>
                  </section>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}