import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { capacityApi, demandApi, nonProjectDemandApi, peopleApi, projectsApi } from '../api/client';
import AccentSection from '../components/admin/AccentSection';
import OtherWorkPage from './OtherWorkPage';
import ScheduleHealthBadge from '../components/ScheduleHealthBadge';
import { buildAllocationConflicts } from '../utils/allocationRisk';
import { calculateProjectScheduleHealth } from '../utils/projectSchedule';
import { formatCount } from '../utils/format';

const ISSUE_STATUSES = new Set(['late', 'at-risk', 'watch', 'needs-dates']);
const HIGH_PRIORITY_SCORE = 10;

type Tab = 'capacity' | 'performance';
type IssueFilter = 'high-priority' | 'all';

export default function PortfolioManagementPage() {
  const [tab, setTab] = useState<Tab>('capacity');
  const [issueFilter, setIssueFilter] = useState<IssueFilter>('high-priority');
  const projects = useQuery({ queryKey: ['projects'], queryFn: () => projectsApi.list() });
  const demand = useQuery({ queryKey: ['demand', 'all'], queryFn: () => demandApi.list() });
  const nonProjectDemand = useQuery({ queryKey: ['non-project-demand', 'all'], queryFn: () => nonProjectDemandApi.list() });
  const capacity = useQuery({ queryKey: ['capacity', 'all'], queryFn: () => capacityApi.list() });
  const people = useQuery({ queryKey: ['people'], queryFn: () => peopleApi.list() });

  const conflicts = useMemo(() => buildAllocationConflicts({
    capacity: capacity.data ?? [],
    demand: demand.data ?? [],
    nonProjectDemand: nonProjectDemand.data ?? [],
    people: people.data ?? [],
    horizon: 26,
  }), [capacity.data, demand.data, nonProjectDemand.data, people.data]);

  const projectIssues = useMemo(() => (projects.data ?? []).map((project) => {
    const projectDemand = (demand.data ?? []).filter((row) => row.projectId === project.id);
    const projectPersonIds = new Set(
      projectDemand.flatMap((row) => row.personId ? [row.personId.toLowerCase()] : []),
    );
    const projectConflicts = conflicts.filter((conflict) => projectPersonIds.has(conflict.personId));
    return {
      project,
      health: calculateProjectScheduleHealth(project, projectDemand, {
        people: projectConflicts.length,
        hours: projectConflicts.reduce((sum, conflict) => sum + conflict.totalOver, 0),
      }),
      conflictCount: projectConflicts.length,
    };
  }).filter(({ health }) => ISSUE_STATUSES.has(health.status))
    .sort((first, second) => {
      const severity: Record<string, number> = { late: 0, 'at-risk': 1, 'needs-dates': 2, watch: 3 };
      return (second.project.priorityScore ?? -1) - (first.project.priorityScore ?? -1)
        || severity[first.health.status] - severity[second.health.status]
        || second.health.reasons.length - first.health.reasons.length
        || first.project.name.localeCompare(second.project.name);
    }), [conflicts, demand.data, projects.data]);

  const issueCount = projectIssues.length;
  const highPriorityIssues = projectIssues.filter(({ project }) => (project.priorityScore ?? -1) >= HIGH_PRIORITY_SCORE);
  const visibleProjectIssues = issueFilter === 'high-priority' ? highPriorityIssues : projectIssues;
  const lateCount = projectIssues.filter(({ health }) => health.status === 'late').length;
  const allocationIssueCount = projectIssues.filter(({ conflictCount }) => conflictCount > 0).length;

  return (
    <section className="portfolio-management">
      <div className="portfolio-management-header">
        <div>
          <h1 className="page-title">Portfolio Management</h1>
          <p className="page-subtitle">Monitor site capacity and project performance across the portfolio.</p>
        </div>
      </div>

      <div className="portfolio-management-tabs" role="tablist" aria-label="Portfolio management views">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'capacity'}
          className={tab === 'capacity' ? 'active' : ''}
          onClick={() => setTab('capacity')}
        >
          Site capacity model
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'performance'}
          className={tab === 'performance' ? 'active' : ''}
          onClick={() => setTab('performance')}
        >
          Project performance
          {issueCount > 0 && <span className="portfolio-tab-count">{issueCount}</span>}
        </button>
      </div>

      {tab === 'capacity' ? (
        <div role="tabpanel" aria-label="Site capacity model">
          <OtherWorkPage />
        </div>
      ) : (
        <div role="tabpanel" aria-label="Project performance">
          <AccentSection
            accent="projects"
            title="Project performance"
            subtitle="Projects requiring attention based on schedule, dates, review cadence or allocation risk."
          >
            <div className="portfolio-performance-summary">
              <div><strong>{formatCount(issueCount)}</strong><span>Projects with issues</span></div>
              <div><strong>{formatCount(highPriorityIssues.length)}</strong><span>High-priority issues</span></div>
              <div><strong>{formatCount(lateCount)}</strong><span>Late projects</span></div>
              <div><strong>{formatCount(allocationIssueCount)}</strong><span>Allocation risk</span></div>
            </div>
            <div className="portfolio-performance-filters" role="group" aria-label="Filter project issues by priority">
              <span>Show</span>
              <button
                type="button"
                aria-pressed={issueFilter === 'high-priority'}
                className={issueFilter === 'high-priority' ? 'active' : ''}
                onClick={() => setIssueFilter('high-priority')}
              >
                High priority (10+)
                <span>{formatCount(highPriorityIssues.length)}</span>
              </button>
              <button
                type="button"
                aria-pressed={issueFilter === 'all'}
                className={issueFilter === 'all' ? 'active' : ''}
                onClick={() => setIssueFilter('all')}
              >
                All issues
                <span>{formatCount(issueCount)}</span>
              </button>
            </div>
            <div className="card table-card">
              <table className="data-table portfolio-performance-table">
                <thead>
                  <tr>
                    <th>Project</th>
                    <th>Priority</th>
                    <th>Status</th>
                    <th>Issues</th>
                    <th>Allocation</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleProjectIssues.map(({ project, health, conflictCount }) => (
                    <tr key={project.id}>
                      <th scope="row">
                        <Link to={`/projects/${project.id}`} className="record-link">{project.name}</Link>
                      </th>
                      <td>
                        <span className={`portfolio-priority-score${(project.priorityScore ?? -1) >= HIGH_PRIORITY_SCORE ? ' is-high' : ''}`}>
                          {project.priorityScore == null ? 'Not scored' : `${project.priorityScore >= HIGH_PRIORITY_SCORE ? 'High · ' : ''}${project.priorityScore}/15`}
                        </span>
                      </td>
                      <td><ScheduleHealthBadge health={health} /></td>
                      <td>
                        <ul className="portfolio-issue-list">
                          {health.reasons.map((reason) => <li key={reason}>{reason}</li>)}
                        </ul>
                      </td>
                      <td>{conflictCount > 0 ? `${conflictCount} conflict${conflictCount === 1 ? '' : 's'}` : '—'}</td>
                      <td><Link to={`/projects/${project.id}`} className="table-action-link">Review</Link></td>
                    </tr>
                  ))}
                  {!projects.isLoading && visibleProjectIssues.length === 0 && (
                    <tr><td colSpan={6}>{issueFilter === 'high-priority' ? 'No high-priority project issues found.' : 'No project issues found.'}</td></tr>
                  )}
                  {projects.isLoading && <tr><td colSpan={6}>Loading project performance…</td></tr>}
                </tbody>
              </table>
            </div>
          </AccentSection>
        </div>
      )}
    </section>
  );
}
