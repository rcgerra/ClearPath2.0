import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { capacityApi, demandApi, departmentsApi, nonProjectDemandApi, peopleApi, prioritizationApi, projectsApi, requestsApi } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { isMine } from '../utils/ownership';
import { buildAllocationConflicts } from '../utils/allocationRisk';
import { calculateProjectScheduleHealth } from '../utils/projectSchedule';
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
  const reviewsDue = [...myProjects, ...myDepartments].filter((record) => reviewAge(record.lastCheckIn) > 30).length;
  const relevantConflicts = useMemo(() => {
    const projectIds = new Set(myProjects.map((project) => project.id));
    const departmentIds = new Set(myDepartments.map((department) => department.id));
    const relevantPersonIds = new Set<string>();
    for (const row of demand.data ?? []) {
      if (row.personId && projectIds.has(row.projectId)) relevantPersonIds.add(row.personId.toLowerCase());
    }
    for (const person of people.data ?? []) {
      if (person.departmentId && departmentIds.has(person.departmentId)) relevantPersonIds.add(person.id.toLowerCase());
    }
    return buildAllocationConflicts({
      capacity: capacity.data ?? [],
      demand: demand.data ?? [],
      nonProjectDemand: nonProjectDemand.data ?? [],
      people: people.data ?? [],
      horizon: 26,
      personIds: relevantPersonIds,
    });
  }, [capacity.data, demand.data, myDepartments, myProjects, nonProjectDemand.data, people.data]);

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
  const scheduleRank = { late: 6, 'at-risk': 5, 'needs-dates': 4, watch: 3, 'not-started': 2, 'on-track': 1 };
  const orderedProjects = [...myProjects].sort((first, second) =>
    scheduleRank[scheduleHealthByProject.get(second.id)?.status ?? 'watch'] - scheduleRank[scheduleHealthByProject.get(first.id)?.status ?? 'watch'],
  );

  return (
    <section className="operational-home">
      <header className="operational-home-header">
        <div className="operational-home-header-top">
          <div className="operational-home-header-copy">
            <h1 className="page-title">Good morning, {user?.name?.split(' ')[0] ?? 'planner'}</h1>
            <p>Here is the current state of your portfolio and the decisions that need attention this week.</p>
          </div>

          <div className="operational-home-kpis">
            <div className="home-mini-stat home-mini-stat-projects">
              <span className="home-mini-stat-label">Portfolio</span>
              <strong>{myProjects.length}</strong>
              <small>projects in focus</small>
            </div>
            <div className="home-mini-stat home-mini-stat-departments">
              <span className="home-mini-stat-label">Departments</span>
              <strong>{myDepartments.length}</strong>
              <small>team areas</small>
            </div>
            <div className="home-mini-stat home-mini-stat-governance">
              <span className="home-mini-stat-label">Reviews due</span>
              <strong>{reviewsDue}</strong>
              <small>plans needing review</small>
            </div>
            <div className="home-mini-stat home-mini-stat-availability">
              <span className="home-mini-stat-label">Schedule risk</span>
              <strong>{scheduleRiskCount}</strong>
              <small>at-risk programs</small>
            </div>
          </div>
        </div>
      </header>

      <div className="operational-home-grid">
        <section className="card home-panel home-panel-prioritization">
          <div className="home-panel-header">
            <div>
              <h2>Priority queue</h2>
              <p>Decisions that need a sponsor response or review.</p>
            </div>
            <Link to="/prioritization">Open</Link>
          </div>

          <ul className="home-simple-list">
            {needsPrioritization.slice(0, 3).map((request) => (
              <li key={request.id}>
                <Link to={`/prioritization?requestId=${request.id}`}>
                  <strong>{request.shortTitle ?? request.title ?? request.name}</strong>
                  <span>Assessment due</span>
                </Link>
              </li>
            ))}
            {needsPrioritization.length === 0 && (
              <li className="empty-line">No requests currently require prioritization.</li>
            )}
          </ul>
        </section>

        <section className="card home-panel home-panel-projects">
          <div className="home-panel-header">
            <div>
              <h2>Portfolio watch</h2>
              <p>Projects and departments in your current lane.</p>
            </div>
            <Link to="/projects">View</Link>
          </div>

          <ul className="home-simple-list">
            {orderedProjects.slice(0, 3).map((project) => (
              <li key={project.id}>
                <Link to={`/projects/${project.id}`}>
                  <strong>{project.name}</strong>
                  <span>{reviewLabel(project.lastCheckIn)}</span>
                </Link>
              </li>
            ))}
            {orderedProjects.length === 0 && (
              <li className="empty-line">No active projects are assigned to your current role.</li>
            )}
          </ul>
        </section>

        <section className="card home-panel home-panel-requests">
          <div className="home-panel-header">
            <div>
              <h2>Open requests</h2>
              <p>Ideas and asks still moving through the process.</p>
            </div>
            <Link to="/requests">View</Link>
          </div>

          <ul className="home-simple-list">
            {openRequests.slice(0, 3).map((request) => (
              <li key={request.id}>
                <Link to="/requests">
                  <strong>{request.shortTitle ?? request.title ?? request.name}</strong>
                  <span>{request.phase ?? 'Draft'}</span>
                </Link>
              </li>
            ))}
            {openRequests.length === 0 && (
              <li className="empty-line">No active requests are in flight right now.</li>
            )}
          </ul>
        </section>

        <section className="card home-panel home-panel-availability">
          <div className="home-panel-header">
            <div>
              <h2>Risk watch</h2>
              <p>Where most of the allocation pressure is building.</p>
            </div>
          </div>

          <ul className="home-simple-list risk-list">
            {relevantConflicts.slice(0, 3).map((conflict) => (
              <li key={conflict.personId}>
                <Link to={mylinkForConflict(conflict, peopleById, demand.data ?? [], managedProjectIds, myDepartments)}>
                  <strong>{conflict.personName}</strong>
                  <span>{conflict.totalOver} h over · {conflict.overWeeks.length} weeks</span>
                </Link>
              </li>
            ))}
            {relevantConflicts.length === 0 && (
              <li className="empty-line">No allocation conflicts require attention in the next 26 weeks.</li>
            )}
          </ul>
        </section>
      </div>

      <div className="home-supporting-cards">
        {personId && (
          <section className="home-skills-section">
            <SkillsCard
              personId={personId}
              canEdit
              title="My skillset"
              subtitle="Keep your profile current so project and department planners can match the right support."
              collapsible={false}
            />
          </section>
        )}

        <section className="card home-governance-section">
          <div className="home-panel-header">
            <div>
              <h2>Governance</h2>
              <p>Policy, approvals, and operating standards.</p>
            </div>
            <span className="home-placeholder-badge">Coming soon</span>
          </div>
          <p className="home-placeholder-copy">A future workspace for governance decisions, controls, and review cadence.</p>
        </section>
      </div>
    </section>
  );
}