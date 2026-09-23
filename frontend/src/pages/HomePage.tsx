import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { capacityApi, demandApi, departmentsApi, nonProjectDemandApi, peopleApi, projectsApi } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { isMine, ownershipRole } from '../utils/ownership';
import { buildAllocationConflicts } from '../utils/allocationRisk';
import { weekLabelShort } from '../utils/arrayParser';
import { calculateProjectScheduleHealth } from '../utils/projectSchedule';
import ScheduleHealthBadge from '../components/ScheduleHealthBadge';
import SkillsCard from '../components/SkillsCard';
import KpiRow from '../components/KpiRow';

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
  const personId = user?.personId;

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
      horizon: 13,
      personIds: relevantPersonIds,
    });
  }, [capacity.data, demand.data, myDepartments, myProjects, nonProjectDemand.data, people.data]);
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
        <div>
          <span className="operational-home-eyebrow">ClearPath planning workspace</span>
          <h1>Welcome, {user?.name?.split(' ')[0] ?? 'planner'}</h1>
          <p>Focus on staffing decisions, current commitments, and plans that need attention.</p>
        </div>
        <Link className="operational-home-primary" to="/me">Open my workload</Link>
      </header>

      <KpiRow
        ariaLabel="Your planning summary"
        variant="grid"
        items={[
          { key: 'projects', value: myProjects.length, label: 'Projects you manage or support' },
          { key: 'departments', value: myDepartments.length, label: 'Departments you lead or support' },
          { key: 'reviews', value: reviewsDue, label: 'Plans due for review', risk: reviewsDue > 0 },
          { key: 'schedule-risk', value: scheduleRiskCount, label: 'Projects with schedule risk' },
          { key: 'conflicts', value: relevantConflicts.length, label: 'Allocation conflicts', risk: relevantConflicts.length > 0 },
        ]}
      />

      <div className="operational-home-columns">
        <section className="home-focus-section accent-projects">
          <div className="home-focus-heading">
            <div>
              <h2>Project planning</h2>
              <p>Build teams, review demand, and resolve allocation risk.</p>
            </div>
            <Link to="/projects">View projects</Link>
          </div>
          <div className="home-record-list">
            {orderedProjects.slice(0, 4).map((project) => (
              <Link key={project.id} to={`/projects/${project.id}`} className="home-record-row">
                <span>
                  <strong>{project.name}</strong>
                  <small>{project.spotId ? `SPOT ${project.spotId}` : 'Project plan'} · {ownershipRole(project, personId) === 'delegate' ? 'Project demand delegate' : 'Project manager / sponsor'}</small>
                </span>
                <span className="home-record-statuses">
                  {scheduleHealthByProject.get(project.id) && <ScheduleHealthBadge health={scheduleHealthByProject.get(project.id)!} />}
                  <span className={reviewAge(project.lastCheckIn) > 30 ? 'home-review-status due' : 'home-review-status'}>
                    {reviewLabel(project.lastCheckIn)}
                  </span>
                </span>
              </Link>
            ))}
            {!projects.isLoading && myProjects.length === 0 && (
              <p className="home-empty-state">You do not currently manage, sponsor, or support an active project.</p>
            )}
          </div>
        </section>

        <section className="home-focus-section accent-departments">
          <div className="home-focus-heading">
            <div>
              <h2>Department planning</h2>
              <p>Manage availability, assignments, and team capacity.</p>
            </div>
            <Link to="/departments">View departments</Link>
          </div>
          <div className="home-record-list">
            {myDepartments.slice(0, 4).map((department) => (
              <Link key={department.id} to={`/departments/${department.id}`} className="home-record-row">
                <span>
                  <strong>{department.name}</strong>
                  <small>{department.functionName ?? 'No function'} · {ownershipRole(department, personId) === 'delegate' ? 'Department delegate' : 'Department lead'}</small>
                </span>
                <span className={reviewAge(department.lastCheckIn) > 30 ? 'home-review-status due' : 'home-review-status'}>
                  {reviewLabel(department.lastCheckIn)}
                </span>
              </Link>
            ))}
            {!departments.isLoading && myDepartments.length === 0 && (
              <p className="home-empty-state">
                No department lead or delegate responsibilities are assigned to you.{' '}
                {user?.departmentId && <Link to={`/departments/${user.departmentId}`}>Open your department</Link>}
              </p>
            )}
          </div>
        </section>
      </div>

      <section className="home-risk-section">
        <div className="home-focus-heading">
          <div>
            <h2>Allocation risks</h2>
            <p>People supporting your projects or departments who exceed availability in the next 13 weeks.</p>
          </div>
        </div>
        <div className="home-risk-list">
          {relevantConflicts.slice(0, 5).map((conflict) => {
            const person = peopleById.get(conflict.personId);
            const department = myDepartments.find((entry) => entry.id === person?.departmentId);
            const projectAssignment = (demand.data ?? []).find(
              (row) => row.personId?.toLowerCase() === conflict.personId && managedProjectIds.has(row.projectId),
            );
            const destination = department ? `/departments/${department.id}` : projectAssignment ? `/projects/${projectAssignment.projectId}` : '/projects';
            const firstWeek = conflict.overWeeks[0];
            const lastWeek = conflict.overWeeks[conflict.overWeeks.length - 1];
            return (
              <Link key={conflict.personId} to={destination} className="home-risk-row">
                <span className={`risk-severity risk-severity-${conflict.severity}`}>{conflict.severity}</span>
                <span><strong>{conflict.personName}</strong><small>{conflict.departmentName ?? 'Department not assigned'}</small></span>
                <span><strong>{Math.round(conflict.totalOver)} h</strong><small>Total over</small></span>
                <span><strong>{conflict.overWeeks.length}</strong><small>Weeks over</small></span>
                <span><strong>{firstWeek === lastWeek ? weekLabelShort(firstWeek) : `${weekLabelShort(firstWeek)}–${weekLabelShort(lastWeek)}`}</strong><small>Conflict window</small></span>
                <span aria-hidden="true">›</span>
              </Link>
            );
          })}
          {!relevantConflicts.length && <p className="home-empty-state">No allocation conflicts affect the work you own in the next 13 weeks.</p>}
        </div>
      </section>

      {personId && (
        <section className="home-skills-section">
          <SkillsCard
            personId={personId}
            canEdit
            title="My Skillset"
            subtitle="Keep your capabilities current so project and department planners can identify suitable support."
          />
        </section>
      )}

      <section className="home-supporting-actions">
        <div>
          <h2>Skills &amp; planning tools</h2>
          <p>Keep your skill profile current or explore broader planning information.</p>
        </div>
        <div className="row-actions">
          <Link to="/projects">All projects</Link>
          <Link to="/departments">All departments</Link>
          <Link to="/people">People directory</Link>
          {user?.roles.includes('admin') && <Link to="/skills">Manage skill repository</Link>}
        </div>
      </section>
    </section>
  );
}