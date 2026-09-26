import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { capacityApi, demandApi, departmentsApi, nonProjectDemandApi, peopleApi, prioritizationApi, projectsApi, requestsApi } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { isMine } from '../utils/ownership';
import { buildAllocationConflicts } from '../utils/allocationRisk';
import { calculateProjectScheduleHealth } from '../utils/projectSchedule';
import CapacityChart from '../components/CapacityChart';
import SkillsCard from '../components/SkillsCard';

function reviewAge(lastCheckIn: string | undefined): number {
  if (!lastCheckIn) return Number.POSITIVE_INFINITY;
  const reviewed = new Date(lastCheckIn).getTime();
  return Number.isNaN(reviewed) ? Number.POSITIVE_INFINITY : Math.floor((Date.now() - reviewed) / 86_400_000);
}

function reviewLabel(lastCheckIn: string | undefined): string {
  const age = reviewAge(lastCheckIn);
  if (!Number.isFinite(age)) return 'Not reviewed';
  if (age === 0) return 'Reviewed today';
  return `Reviewed ${age} day${age === 1 ? '' : 's'} ago`;
}

export default function HomePage() {
  const user = useAuthStore((state) => state.user);
  const projects = useQuery({ queryKey: ['projects'], queryFn: () => projectsApi.list() });
  const departments = useQuery({ queryKey: ['departments'], queryFn: departmentsApi.list });
  const people = useQuery({ queryKey: ['people'], queryFn: () => peopleApi.list() });
  const capacity = useQuery({ queryKey: ['capacity', 'all'], queryFn: () => capacityApi.list() });
  const demand = useQuery({ queryKey: ['demand', 'all'], queryFn: () => demandApi.list() });
  const nonProjectDemand = useQuery({ queryKey: ['non-project-demand', 'all'], queryFn: () => nonProjectDemandApi.list() });
  const myRequests = useQuery({ queryKey: ['requests', 'mine'], queryFn: () => requestsApi.list({ mine: true }) });
  const sponsorRequests = useQuery({ queryKey: ['sponsored-requests'], queryFn: prioritizationApi.requests });
  const personId = user?.personId;

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
    () => (projects.data ?? []).filter((project) => project.isActive !== false && isMine(project, personId)),
    [personId, projects.data],
  );
  const myDepartments = useMemo(
    () => (departments.data ?? []).filter((department) => department.isActive !== false && isMine(department, personId)),
    [departments.data, personId],
  );
  const overdueReviews = [
    ...myProjects.map((project) => ({ id: project.id, name: project.name, lastCheckIn: project.lastCheckIn, to: `/projects/${project.id}` })),
    ...myDepartments.map((department) => ({ id: department.id, name: department.name, lastCheckIn: department.lastCheckIn, to: `/departments/${department.id}` })),
  ].filter((record) => reviewAge(record.lastCheckIn) > 30);
  const reviewsDue = overdueReviews.length;
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
  const outlook = useMemo(() => {
    const availability = Array(13).fill(0) as number[];
    const committed = Array(13).fill(0) as number[];
    const capacityByPerson = new Map((capacity.data ?? []).map((row) => [row.personId.toLowerCase(), row]));
    for (const personId of teamPersonIds) {
      const weeks = capacityByPerson.get(personId)?.weeks ?? [];
      for (let week = 0; week < 13; week += 1) availability[week] += weeks[week] ?? 0;
    }
    for (const row of [...(demand.data ?? []), ...(nonProjectDemand.data ?? [])]) {
      if (!row.personId || !teamPersonIds.has(row.personId.toLowerCase())) continue;
      for (let week = 0; week < 13; week += 1) committed[week] += row.weeks[week] ?? 0;
    }
    return {
      availability,
      committed,
      availableHours: availability.reduce((sum, hours) => sum + hours, 0),
      committedHours: committed.reduce((sum, hours) => sum + hours, 0),
    };
  }, [capacity.data, demand.data, nonProjectDemand.data, teamPersonIds]);

  function mylinkForConflict(
    conflict: ReturnType<typeof buildAllocationConflicts>[number],
    peopleLookup: Map<string, any>,
    demandRows: typeof demand.data,
    projectIds: Set<string>,
    departments: typeof myDepartments,
  ) {
    const person = peopleLookup.get(conflict.personId);
    const department = departments.find((entry) => entry.id === person?.departmentId);
    const projectAssignment = (demandRows ?? []).find(
      (row) => row.personId?.toLowerCase() === conflict.personId && projectIds.has(row.projectId),
    );
    if (department) return `/departments/${department.id}`;
    if (projectAssignment) return `/projects/${projectAssignment.projectId}`;
    return '/projects';
  }
  const peopleById = new Map((people.data ?? []).map((person) => [person.id.toLowerCase(), person]));
  const managedProjectIds = new Set(myProjects.map((project) => project.id));
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
  const scheduleRiskCount = [...scheduleHealthByProject.values()].filter((health) =>
    ['late', 'at-risk', 'needs-dates'].includes(health.status),
  ).length;
  const healthCounts = [...scheduleHealthByProject.values()].reduce((counts, health) => {
    if (health.status === 'on-track') counts.onTrack += 1;
    else if (health.status === 'watch' || health.status === 'not-started') counts.watch += 1;
    else counts.atRisk += 1;
    return counts;
  }, { onTrack: 0, watch: 0, atRisk: 0 });
  const scheduleRank = { late: 6, 'at-risk': 5, 'needs-dates': 4, watch: 3, 'not-started': 2, 'on-track': 1 };
  const orderedProjects = [...myProjects].sort((first, second) =>
    scheduleRank[scheduleHealthByProject.get(second.id)?.status ?? 'watch'] - scheduleRank[scheduleHealthByProject.get(first.id)?.status ?? 'watch'],
  );
  const attentionCount = needsPrioritization.length + overdueReviews.length + relevantConflicts.length;

  return (
    <section className="operational-home">
      <header className="operational-home-header">
        <div className="operational-home-header-top">
          <div className="operational-home-header-copy">
            <h1 className="page-title">Good morning, {user?.name?.split(' ')[0] ?? 'planner'}</h1>
            <p>Here is the current state of your portfolio and the decisions that need attention this week.</p>
          </div>

          <div className="operational-home-kpis">
            <div className="home-mini-stat">
              <strong>{myProjects.length}</strong>
              <span>Portfolio projects</span>
            </div>
            <div className="home-mini-stat">
              <strong>{myDepartments.length}</strong>
              <span>Departments</span>
            </div>
            <div className="home-mini-stat">
              <strong>{reviewsDue}</strong>
              <span>Reviews due</span>
            </div>
            <div className="home-mini-stat">
              <strong>{scheduleRiskCount}</strong>
              <span>Schedule risk</span>
            </div>
          </div>
        </div>
      </header>

      <div className="home-dashboard-layout">
        <div className="home-dashboard-main">
          <section className="home-outlook">
            <div className="home-focus-heading">
              <div>
                <span className="home-section-kicker">Workload outlook</span>
                <h2>Demand and capacity</h2>
                <p>Next 13 weeks across people in your projects and departments.</p>
              </div>
              <Link to="/people">Explore people</Link>
            </div>
            <div className="home-outlook-totals">
              <div><strong>{Math.round(outlook.committedHours).toLocaleString()} h</strong><span>Committed demand</span></div>
              <div><strong>{Math.round(outlook.availableHours).toLocaleString()} h</strong><span>Available capacity</span></div>
              <div className={outlook.committedHours > outlook.availableHours ? 'home-outlook-over' : ''}>
                <strong>{outlook.availableHours > 0 ? `${Math.round(outlook.committedHours / outlook.availableHours * 100)}%` : '—'}</strong>
                <span>Utilization</span>
              </div>
            </div>
            <CapacityChart weeks={13} demand={outlook.committed} availability={outlook.availability} />
          </section>
          <div className="home-lower-grid">
            <section className="home-focus-section home-health-section">
              <div className="home-focus-heading">
                <div><span className="home-section-kicker">Portfolio</span><h2>Project health</h2></div>
                <Link to="/projects">All projects</Link>
              </div>
              <div className="home-health-count"><strong>{myProjects.length}</strong><span>active projects in your lane</span></div>
              <div className="home-health-track" role="img" aria-label={`${healthCounts.onTrack} on track, ${healthCounts.watch} on watch, ${healthCounts.atRisk} requiring attention`}>
                {myProjects.length === 0 ? <span className="home-health-empty" /> : (
                  <>
                    <span className="home-health-good" style={{ width: `${healthCounts.onTrack / myProjects.length * 100}%` }} />
                    <span className="home-health-watch" style={{ width: `${healthCounts.watch / myProjects.length * 100}%` }} />
                    <span className="home-health-risk" style={{ width: `${healthCounts.atRisk / myProjects.length * 100}%` }} />
                  </>
                )}
              </div>
              <div className="home-health-legend">
                <span><i className="home-health-good" />{healthCounts.onTrack} on track</span>
                <span><i className="home-health-watch" />{healthCounts.watch} watch</span>
                <span><i className="home-health-risk" />{healthCounts.atRisk} attention</span>
              </div>
              <div className="home-health-highlights">
                {orderedProjects.slice(0, 2).map((project) => {
                  const health = scheduleHealthByProject.get(project.id);
                  return (
                    <Link className="home-record-row" to={`/projects/${project.id}`} key={project.id}>
                      <span><strong>{project.name}</strong><small>{reviewLabel(project.lastCheckIn)}</small></span>
                      <span className={`home-project-status home-project-status-${health?.status ?? 'watch'}`}>{health?.label ?? 'Watch'}</span>
                      <span className="home-row-arrow" aria-hidden="true">›</span>
                    </Link>
                  );
                })}
                {orderedProjects.length === 0 && <p className="home-empty-state">No active projects assigned.</p>}
              </div>
              <div className="home-team-areas">
                <div className="home-team-areas-heading"><strong>Team areas</strong><Link to="/departments">View all</Link></div>
                {myDepartments.length > 0 ? (
                  <div className="home-department-links">
                    {myDepartments.slice(0, 2).map((department) => <Link to={`/departments/${department.id}`} key={department.id}>{department.name}<span aria-hidden="true">›</span></Link>)}
                  </div>
                ) : <p className="home-empty-state">No departments currently assigned.</p>}
              </div>
            </section>

            <section className="home-focus-section home-intake-section">
              <div className="home-focus-heading">
                <div><span className="home-section-kicker">Intake</span><h2>Open requests</h2></div>
                <Link to="/requests">All requests</Link>
              </div>
              <div className="home-intake-count"><strong>{openRequests.length}</strong><span>requests in progress</span></div>
              <div className="home-intake-feature">
                <span>Latest in your queue</span>
                {openRequests.length > 0 ? (
                  <Link to="/requests">
                    <strong>{openRequests[0].shortTitle ?? openRequests[0].title ?? openRequests[0].name}</strong>
                    <small>{openRequests[0].phase ?? 'Draft'} <span aria-hidden="true">›</span></small>
                  </Link>
                ) : <p className="home-empty-state">No active requests in flight.</p>}
              </div>
            </section>
          </div>

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

          <section className="home-attention-group home-attention-priority">
            <div className="home-attention-group-heading"><h3>Prioritization</h3><Link to="/prioritization">View queue</Link></div>
            {needsPrioritization.slice(0, 3).map((request) => (
              <Link className="home-attention-item" to={`/prioritization?requestId=${request.id}`} key={request.id}>
                <small>Assessment due</small><strong>{request.shortTitle ?? request.title ?? request.name}</strong>
              </Link>
            ))}
            {needsPrioritization.length === 0 && <p className="home-attention-empty">No assessments due.</p>}
          </section>

          <section className="home-attention-group home-attention-reviews">
            <div className="home-attention-group-heading"><h3>Reviews due</h3><span>{overdueReviews.length}</span></div>
            {overdueReviews.slice(0, 3).map((record) => (
              <Link className="home-attention-item" to={record.to} key={record.id}>
                <small>{reviewLabel(record.lastCheckIn)}</small><strong>{record.name}</strong>
              </Link>
            ))}
            {overdueReviews.length === 0 && <p className="home-attention-empty">All plans recently reviewed.</p>}
          </section>

          <section className="home-attention-group home-attention-capacity">
            <div className="home-attention-group-heading"><h3>Allocation risk</h3><span>{relevantConflicts.length}</span></div>
            {relevantConflicts.slice(0, 3).map((conflict) => (
              <Link className="home-attention-item" to={mylinkForConflict(conflict, peopleById, demand.data ?? [], managedProjectIds, myDepartments)} key={conflict.personId}>
                <small>{conflict.totalOver} h over · {conflict.overWeeks.length} weeks</small><strong>{conflict.personName}</strong>
              </Link>
            ))}
            {relevantConflicts.length === 0 && <p className="home-attention-empty">No allocation conflicts in the next 26 weeks.</p>}
          </section>

          <section className="home-attention-group home-attention-governance">
            <div className="home-attention-group-heading"><h3>Governance</h3><span>Coming soon</span></div>
            <p className="home-attention-empty">Policy, approvals, and operating standards.</p>
          </section>
          </aside>
        </div>
      </div>
    </section>
  );
}