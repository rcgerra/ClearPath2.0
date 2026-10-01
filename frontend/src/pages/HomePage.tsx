import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { capacityApi, demandApi, departmentsApi, governanceApi, lookupsApi, nonProjectDemandApi, peopleApi, prioritizationApi, projectsApi, requestsApi } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { isMine, ownershipRole } from '../utils/ownership';
import { buildAllocationConflicts } from '../utils/allocationRisk';
import { calculateProjectScheduleHealth } from '../utils/projectSchedule';
import CapacityGapChart from '../components/CapacityGapChart';
import { weekLabel, weekLabelShort } from '../utils/arrayParser';
import type { Department } from '../types';

const OUTLOOK_WEEKS = 13;
const DEMAND_PIE_COLORS = ['#2f7ec7', '#63804d', '#bd8124', '#8166a8', '#bd4e58', '#328a80', '#626d78'];

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
  const activeProjectIds = useMemo(() => new Set(
    (projects.data ?? []).filter((project) => project.isActive !== false).map((project) => project.id.toLowerCase()),
  ), [projects.data]);

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
  const projectLeadCount = myProjects.filter((project) => ownershipRole(project, personId) === 'owner').length;
  const projectDelegateCount = myProjects.length - projectLeadCount;
  const departmentLeadCount = myDepartments.filter((department) => ownershipRole(department, personId) === 'owner').length;
  const departmentDelegateCount = myDepartments.length - departmentLeadCount;
  const teamPersonIds = useMemo(() => {
    const projectIds = new Set(myProjects.map((project) => project.id));
    const departmentIds = new Set(myDepartments.map((department) => department.id));
    const personIds = new Set<string>();
    for (const row of demand.data ?? []) {
      if (row.personId && projectIds.has(row.projectId)) personIds.add(row.personId.toLowerCase());
    }
    for (const person of people.data ?? []) {
      if (person.departmentId && departmentIds.has(person.departmentId)) personIds.add(person.id.toLowerCase());
    }
    return personIds;
  }, [demand.data, myDepartments, myProjects, people.data]);
  const relevantConflicts = useMemo(() => buildAllocationConflicts({
    capacity: capacity.data ?? [],
    demand: demand.data ?? [],
    nonProjectDemand: nonProjectDemand.data ?? [],
    people: people.data ?? [],
    horizon: 26,
    personIds: teamPersonIds,
  }), [capacity.data, demand.data, nonProjectDemand.data, people.data, teamPersonIds]);
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
  const projectsNeedingAttention = myProjects.filter((project) =>
    reviewAge(project.lastCheckIn) > 30
    || ['late', 'at-risk', 'needs-dates'].includes(scheduleHealthByProject.get(project.id)?.status ?? ''),
  );
  const conflictPersonIds = new Set(relevantConflicts.map((conflict) => conflict.personId));
  const conflictedDepartmentIds = new Set(
    (people.data ?? [])
      .filter((person) => conflictPersonIds.has(person.id.toLowerCase()) && person.departmentId)
      .map((person) => person.departmentId as string),
  );
  const departmentsNeedingAttention = myDepartments.filter((department) =>
    reviewAge(department.lastCheckIn) > 30 || conflictedDepartmentIds.has(department.id),
  );
  const ledFunctions = useMemo(() => (functions.data ?? []).filter((item) => personId && (
    item.leadPersonId?.toLowerCase() === personId.toLowerCase()
    || item.assistantLeadPersonIds?.some((id) => id.toLowerCase() === personId.toLowerCase())
  )), [functions.data, personId]);
  const outlookViews = [
    ...ledFunctions.map((item) => ({ id: `function:${item.id}`, label: 'My Function' })),
    ...myDepartments.map((item) => ({ id: `department:${item.id}`, label: 'My Departments' })),
    { id: 'work', label: 'My Work' },
  ];
  const activeOutlookView = outlookViews.find((view) => view.id === outlookView) ?? outlookViews[0];
  const activeFunction = ledFunctions.find((item) => activeOutlookView.id === `function:${item.id}`);
  const activeDepartment = myDepartments.find((item) => activeOutlookView.id === `department:${item.id}`);
  const functionDepartments = useMemo(() => {
    const functionId = activeFunction?.id.toLowerCase();
    return (departments.data ?? []).filter((department) =>
      Boolean(functionId) && department.isActive !== false && department.functionId?.toLowerCase() === functionId,
    );
  }, [departments.data, activeFunction?.id]);
  const departmentGapSeries = useMemo(() => {
    const selected: Department[] = activeFunction ? functionDepartments : activeDepartment ? [activeDepartment] : myDepartments;
    const personDepartment = new Map((people.data ?? []).map((person) => [person.id.toLowerCase(), person.departmentId?.toLowerCase()]));
    return selected.map((department) => {
      const availability = Array(OUTLOOK_WEEKS).fill(0) as number[];
      const committed = Array(OUTLOOK_WEEKS).fill(0) as number[];
      const departmentId = department.id.toLowerCase();
      for (const row of capacity.data ?? []) {
        if (row.isActive !== false && activePersonIds.has(row.personId.toLowerCase()) && (personDepartment.get(row.personId.toLowerCase()) ?? row.departmentId?.toLowerCase()) === departmentId) addWeeks(availability, row.weeks);
      }
      for (const row of demand.data ?? []) {
        if (row.isActive !== false && activeProjectIds.has(row.projectId.toLowerCase()) && row.personId && activePersonIds.has(row.personId.toLowerCase()) && personDepartment.get(row.personId.toLowerCase()) === departmentId) addWeeks(committed, row.weeks);
      }
      return { id: department.id, label: department.name, availability, committed, weeks: availability.map((hours, week) => hours - committed[week]) };
    });
  }, [activeFunction, activeDepartment, functionDepartments, myDepartments, people.data, activePersonIds, activeProjectIds, capacity.data, demand.data]);
  const departmentPersonGapRows = useMemo(() => {
    if (!activeDepartment) return [];
    const departmentId = activeDepartment.id.toLowerCase();
    return (people.data ?? [])
      .filter((person) => person.isActive !== false && person.departmentId?.toLowerCase() === departmentId)
      .map((person) => {
        const personId = person.id.toLowerCase();
        const availability = Array(OUTLOOK_WEEKS).fill(0) as number[];
        const committed = Array(OUTLOOK_WEEKS).fill(0) as number[];
        for (const row of capacity.data ?? []) {
          if (row.isActive !== false && row.personId.toLowerCase() === personId) addWeeks(availability, row.weeks);
        }
        for (const row of demand.data ?? []) {
          if (row.isActive !== false && activeProjectIds.has(row.projectId.toLowerCase()) && row.personId?.toLowerCase() === personId) addWeeks(committed, row.weeks);
        }
        return { id: person.id, name: person.name, weeks: availability.map((hours, week) => hours - committed[week]) };
      });
  }, [activeDepartment, people.data, capacity.data, demand.data, activeProjectIds]);
  const personalOutlook = useMemo(() => {
    const availability = Array(OUTLOOK_WEEKS).fill(0) as number[];
    const committed = Array(OUTLOOK_WEEKS).fill(0) as number[];
    if (personId && activePersonIds.has(personId.toLowerCase())) {
      for (const row of capacity.data ?? []) {
        if (row.isActive !== false && row.personId.toLowerCase() === personId.toLowerCase()) addWeeks(availability, row.weeks);
      }
      for (const row of demand.data ?? []) {
        if (row.isActive !== false && row.personId?.toLowerCase() === personId.toLowerCase()) addWeeks(committed, row.weeks);
      }
    }
    return { availability, committed };
  }, [activePersonIds, capacity.data, demand.data, personId]);
  const personalProjectDemand = useMemo(() => {
    const totals = new Map<string, { id: string; name?: string; weeks: number[] }>();
    const normalizedPersonId = personId?.toLowerCase();
    if (!normalizedPersonId) return [];
    for (const row of demand.data ?? []) {
      if (row.isActive === false || row.personId?.toLowerCase() !== normalizedPersonId || !row.projectId) continue;
      const projectKey = row.projectId.toLowerCase();
      const current = totals.get(projectKey) ?? { id: row.projectId, name: row.projectName, weeks: Array(OUTLOOK_WEEKS).fill(0) };
      for (let week = 0; week < OUTLOOK_WEEKS; week += 1) current.weeks[week] += row.weeks[week] ?? 0;
      totals.set(projectKey, current);
    }
    const projectRecords = new Map((projects.data ?? []).map((project) => [project.id.toLowerCase(), project]));
    return [...totals.entries()]
      .map(([projectId, project]) => ({
        ...project,
        name: projectRecords.get(projectId)?.name ?? project.name ?? 'Unnamed project',
        spotId: projectRecords.get(projectId)?.spotId,
        total: project.weeks.reduce((sum, hours) => sum + hours, 0),
      }))
      .filter((project) => project.total > 0)
      .sort((left, right) => right.total - left.total);
  }, [demand.data, personId, projects.data]);
  const personalOtherWork = useMemo(() => {
    const normalizedPersonId = personId?.toLowerCase();
    return Array.from({ length: OUTLOOK_WEEKS }, (_, week) => (nonProjectDemand.data ?? [])
      .filter((row) => row.isActive !== false && row.personId.toLowerCase() === normalizedPersonId)
      .reduce((total, row) => total + (row.weeks[week] ?? 0), 0));
  }, [nonProjectDemand.data, personId]);
  const personalOtherWorkTotal = personalOtherWork.reduce((total, hours) => total + hours, 0);
  const personalDemandItems = [
    ...personalProjectDemand.map((project, index) => ({
      id: project.id,
      label: project.name,
      spotId: project.spotId,
      hours: project.total,
      color: DEMAND_PIE_COLORS[index % DEMAND_PIE_COLORS.length],
      to: `/projects/${project.id}`,
    })),
    { id: 'other-work', label: 'Other work', spotId: undefined, hours: personalOtherWorkTotal, color: '#63804d', to: undefined },
  ];
  const personalDemandTotal = personalDemandItems.reduce((total, item) => total + item.hours, 0);
  const personalCommittedTotal = personalDemandTotal;
  let demandPieCursor = 0;
  const personalDemandSlices = personalDemandItems.filter((item) => item.hours > 0).map((item) => {
    const start = demandPieCursor;
    demandPieCursor += item.hours / (personalDemandTotal || 1) * 100;
    return { ...item, start, end: demandPieCursor };
  });
  const personalDemandPie = personalDemandSlices.length
    ? `conic-gradient(${personalDemandSlices.map((item) => `${item.color} ${item.start}% ${item.end}%`).join(', ')})`
    : 'conic-gradient(var(--light-grey) 0% 100%)';
  const personalCapacityTotal = personalOutlook.availability.reduce((total, hours) => total + hours, 0);
  const functionMatrixRows = useMemo(() => departmentGapSeries.map((department) => ({
    ...department,
    overWeeks: department.weeks.filter((gap) => gap < 0).length,
    shortageHours: department.weeks.reduce((sum, gap) => sum + Math.max(0, -gap), 0),
  })).sort((left, right) => right.overWeeks - left.overWeeks || right.shortageHours - left.shortageHours || left.label.localeCompare(right.label)), [departmentGapSeries]);
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
  const activeOutlookIndex = outlookViews.indexOf(activeOutlookView);
  const outlookDestination = activeOutlookView.id === 'work'
    ? '/me'
    : activeDepartment
      ? `/departments/${activeDepartment.id}`
      : undefined;
  const outlookDestinationLabel = activeOutlookView.id === 'work'
    ? 'Go to My Work'
    : activeDepartment
      ? `Go to ${activeDepartment.name}`
      : undefined;

  function moveOutlook(direction: -1 | 1) {
    const nextIndex = (activeOutlookIndex + direction + outlookViews.length) % outlookViews.length;
    setOutlookView(outlookViews[nextIndex].id);
  }

  return (
    <section className="operational-home">
      <div className="home-dashboard-layout">
        <div className="home-dashboard-main">
          <header className="operational-home-header">
            <div className="operational-home-header-top">
              <div className="operational-home-header-copy">
                <h1 className="page-title">{greeting}, {user?.name?.split(' ')[0] ?? 'planner'}</h1>
                <p>The next 13 weeks at a glance</p>
              </div>
              <div className="home-header-kpis" aria-label="My workload summary">
                <div className="home-header-kpi">
                  <strong>{personalProjectDemand.length}</strong><span>Assignments</span>
                </div>
                <div className="home-header-kpi">
                  <strong>{Math.round(personalCommittedTotal).toLocaleString()} h</strong><span>Demand</span>
                </div>
                <div className="home-header-kpi">
                  <strong>{Math.round(personalCapacityTotal).toLocaleString()} h</strong><span>Availability</span>
                </div>
                <div className={`home-header-kpi${personalCapacityTotal - personalCommittedTotal < 0 ? ' is-over' : ' is-positive'}`}>
                  <strong>{Math.round(personalCapacityTotal - personalCommittedTotal).toLocaleString()} h</strong><span>Capacity Gap</span>
                </div>
              </div>
            </div>
          </header>
          <section className={`home-outlook${activeDepartment ? ' home-outlook-department' : ''}`}>
            <button className="home-outlook-arrow" type="button" aria-label="Previous view" onClick={() => moveOutlook(-1)} disabled={outlookViews.length === 1}>‹</button>
            <div className="home-outlook-card">
              <div className="home-focus-heading">
                <div className="home-focus-copy">
                  <span className="home-section-kicker">{activeFunction ? 'My Function' : activeDepartment ? 'My Departments' : 'My Workload'}</span>
                  <h2>{activeFunction?.name ?? activeDepartment?.name ?? 'Capacity Gap'}</h2>
                  <p>{activeFunction
                    ? `Capacity gap for the departments within this function over the next ${OUTLOOK_WEEKS} weeks.`
                    : activeDepartment
                      ? `Capacity gap over the next ${OUTLOOK_WEEKS} weeks.`
                      : `Available capacity and hours over capacity across the next ${OUTLOOK_WEEKS} weeks.`}</p>
                </div>
                {outlookDestination && outlookDestinationLabel && (
                  <Link className="home-outlook-go-to" to={outlookDestination}>
                    {outlookDestinationLabel}<span aria-hidden="true">↗</span>
                  </Link>
                )}
              </div>
              <div className="home-outlook-carousel-shell">
                <div className="home-outlook-carousel">
                <div className="home-outlook-carousel-content">
                  {activeFunction ? (
                    functionMatrixRows.length > 0 ? (
                      <div className="home-function-matrix">
                        <table className="home-department-gap-table" aria-label="Weekly capacity gap in hours by department">
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
                                <th scope="row" className="home-function-name">
                                  <Link to={`/departments/${department.id}`} title={department.label}>{department.label}</Link>
                                </th>
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
                    ? <CapacityGapChart weeks={OUTLOOK_WEEKS} ariaLabel="Weekly personal capacity gap" patterned={false} labelEveryWeek valueLabels showLegend={false} fillHeight series={[{ id: 'personal', label: 'My Work', weeks: personalOutlook.availability.map((hours, week) => hours - personalOutlook.committed[week]) }]} />
                    : <CapacityGapChart weeks={OUTLOOK_WEEKS} patterned={false} labelEveryWeek valueLabels labelOutsideWhenTight showLegend={false} series={departmentGapSeries} />}
                  <div className="home-capacity-gap-legend" aria-label="Capacity gap legend">
                    <span><i className="is-underallocated" />Available capacity</span>
                    <span><i className="is-overallocated" />Over capacity</span>
                  </div>
                </div>
                </div>
                {outlookViews.length > 1 && <span className="home-outlook-position" aria-live="polite">{activeOutlookIndex + 1} / {outlookViews.length}</span>}
              </div>
              {activeDepartment && (
                <section className="home-department-gap-section" aria-labelledby="home-department-gap-title">
                  <div className="home-department-gap-heading">
                    <span className="home-section-kicker">My Departments</span>
                    <h3 id="home-department-gap-title">Individual capacity gaps</h3>
                    <p>Capacity gap over the next {OUTLOOK_WEEKS} weeks.</p>
                  </div>
                  <div className="home-department-gap-scroll">
                    <table className="home-department-gap-table">
                      <thead>
                        <tr>
                          <th scope="col">Person</th>
                          {Array.from({ length: OUTLOOK_WEEKS }, (_, week) => (
                            <th scope="col" key={week} title={weekLabel(week)}>{weekLabelShort(week)}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {departmentPersonGapRows.length > 0 ? departmentPersonGapRows.map((person) => (
                          <tr key={person.id}>
                            <th scope="row">
                              <span className="home-department-gap-person">
                                {person.name}
                                {person.weeks.some((gap) => gap < 0) && <span className="home-department-gap-alert" role="img" aria-label="Overallocated" title="Overallocated">!</span>}
                              </span>
                            </th>
                            {person.weeks.map((gap, week) => <td key={week} className={gap < 0 ? 'is-negative' : gap > 0 ? 'is-positive' : undefined}>{Math.round(gap)}</td>)}
                          </tr>
                        )) : (
                          <tr><td colSpan={OUTLOOK_WEEKS + 1}>No active people are assigned to this department.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
              {activeOutlookView.id === 'work' && <section className="home-project-demand" aria-labelledby="home-project-demand-title">
                <div className="home-project-demand-heading">
                  <div>
                    <span className="home-section-kicker">My Workload</span>
                    <h3 id="home-project-demand-title">Assignments</h3>
                  </div>
                </div>
                <div className="home-project-demand-content">
                  <div className="home-project-demand-pie" role="img" aria-label={`Demand distribution totaling ${Math.round(personalDemandTotal)} hours`} style={{ background: personalDemandPie }}>
                    <div className="home-project-demand-pie-center">
                      <span>{Math.round(personalDemandTotal).toLocaleString()} h</span>
                      <small>Total demand</small>
                    </div>
                  </div>
                  <div className="home-project-demand-legend">
                    <table aria-label="Assignment demand by project">
                      <thead>
                        <tr><th scope="col">Project</th><th scope="col">SPOT ID</th><th scope="col">Hours</th><th scope="col">Share</th></tr>
                      </thead>
                      <tbody>
                        {personalDemandItems.map((item) => {
                          const share = personalDemandTotal > 0 ? Math.round(item.hours / personalDemandTotal * 100) : 0;
                          return (
                            <tr key={item.id}>
                              <td>
                                <span className="home-project-demand-name-cell">
                                  <span className="home-project-demand-swatch" style={{ background: item.color }} />
                                  {item.to
                                    ? <Link to={item.to} className="home-project-demand-label" title={item.label}>{item.label}</Link>
                                    : <span className="home-project-demand-label" title={item.label}>{item.label}</span>}
                                </span>
                              </td>
                              <td className="home-project-demand-spot">{item.spotId ?? '—'}</td>
                              <td className="home-project-demand-hours">{Math.round(item.hours).toLocaleString()} h</td>
                              <td className="home-project-demand-share">{share}%</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>}
            </div>
            <button className="home-outlook-arrow" type="button" aria-label="Next view" onClick={() => moveOutlook(1)} disabled={outlookViews.length === 1}>›</button>
          </section>
        </div>

        <div className="home-dashboard-side">
          <section className="home-my-teams" aria-labelledby="home-my-teams-title">
            <div className="home-my-teams-heading">
              <span className="home-section-kicker">MBO Staffing Model</span>
              <h2 id="home-my-teams-title">My Teams</h2>
            </div>
            <div className="home-team-kpi-grid">
              <Link className="home-team-kpi home-team-kpi-projects" to="/projects" aria-label={`Open projects list. ${projectsNeedingAttention.length} projects need attention.`}>
                <span className="home-team-kpi-topline">
                  <strong>{myProjects.length}</strong>
                  <span className="home-team-kpi-actions">
                    {projectsNeedingAttention.length > 0 && <span className="home-team-kpi-alert" role="img" aria-label={`${projectsNeedingAttention.length} projects need attention`} title={`${projectsNeedingAttention.length} projects need attention`}>!</span>}
                    <span className="home-team-kpi-link" aria-hidden="true">↗</span>
                  </span>
                </span>
                <span>Projects</span>
                <small>{projectLeadCount} lead · {projectDelegateCount} delegate</small>
              </Link>
              <Link className="home-team-kpi home-team-kpi-departments" to="/departments" aria-label={`Open departments list. ${departmentsNeedingAttention.length} departments need attention.`}>
                <span className="home-team-kpi-topline">
                  <strong>{myDepartments.length}</strong>
                  <span className="home-team-kpi-actions">
                    {departmentsNeedingAttention.length > 0 && <span className="home-team-kpi-alert" role="img" aria-label={`${departmentsNeedingAttention.length} departments need attention`} title={`${departmentsNeedingAttention.length} departments need attention`}>!</span>}
                    <span className="home-team-kpi-link" aria-hidden="true">↗</span>
                  </span>
                </span>
                <span>Departments</span>
                <small>{departmentLeadCount} lead · {departmentDelegateCount} delegate</small>
              </Link>
            </div>
          </section>
          <aside className="home-attention" aria-label="Open items">
            <div className="home-attention-heading">
              <div><span className="home-section-kicker">Project Selection and Governance</span><h2>Open items</h2></div>
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