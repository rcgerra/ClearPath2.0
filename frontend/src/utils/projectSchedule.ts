import type { DemandRow, Project } from '../types';
import { currentWeekStart } from './arrayParser';

export type ScheduleHealthStatus = 'late' | 'at-risk' | 'watch' | 'on-track' | 'not-started' | 'needs-dates';

export interface ProjectScheduleHealth {
  status: ScheduleHealthStatus;
  label: string;
  reasons: string[];
  timelineElapsedFraction: number | null;
  expectedDemandToDate: number;
  expectedRemainingDemand: number;
  backLoadedDemand: number;
  totalPlannedDemand: number;
  remainingDemand: number;
  demandAfterEnd: number;
  daysToEnd: number | null;
  daysOverdue: number;
  reviewAgeDays: number | null;
}

const STATUS_LABELS: Record<ScheduleHealthStatus, string> = {
  late: 'Late',
  'at-risk': 'At risk',
  watch: 'Watch',
  'on-track': 'On track',
  'not-started': 'Not started',
  'needs-dates': 'Dates needed',
};

function utcDay(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

export function calculateProjectScheduleHealth(
  project: Project,
  demandRows: DemandRow[],
  conflictSummary: { people: number; hours: number } = { people: 0, hours: 0 },
  now = new Date(),
): ProjectScheduleHealth {
  const nowTime = now.getTime();
  const start = utcDay(project.startDate);
  const end = utcDay(project.endDate);
  const lastReview = utcDay(project.lastCheckIn);
  const reviewAgeDays = lastReview === null ? null : Math.max(0, Math.floor((nowTime - lastReview) / 86_400_000));
  const totalPlannedDemand = demandRows.reduce(
    (total, row) => total + Object.keys(row.weeks).reduce((sum, key) => sum + (Number(row.weeks[Number(key)]) || 0), 0),
    0,
  );
  const remainingDemand = demandRows.reduce(
    (total, row) => total + row.weeks.reduce((sum, value) => sum + (value || 0), 0),
    0,
  );

  let timelineElapsedFraction: number | null = null;
  let daysToEnd: number | null = null;
  let daysOverdue = 0;
  let demandAfterEnd = 0;
  if (start !== null && end !== null && end > start) {
    timelineElapsedFraction = Math.max(0, Math.min(1, (nowTime - start) / (end - start)));
    daysToEnd = Math.ceil((end - nowTime) / 86_400_000);
    daysOverdue = Math.max(0, -daysToEnd);
    const epoch = currentWeekStart().getTime();
    for (const row of demandRows) {
      for (let week = 0; week < row.weeks.length; week += 1) {
        const weekStart = epoch + week * 7 * 86_400_000;
        if (weekStart > end) demandAfterEnd += row.weeks[week] ?? 0;
      }
    }
  }

  const expectedDemandToDate = timelineElapsedFraction === null ? 0 : totalPlannedDemand * timelineElapsedFraction;
  const expectedRemainingDemand = Math.max(0, totalPlannedDemand - expectedDemandToDate);
  const backLoadedDemand = Math.max(0, remainingDemand - expectedRemainingDemand);
  const reasons: string[] = [];
  let status: ScheduleHealthStatus;
  if (start === null || end === null || end <= start) {
    status = 'needs-dates';
    reasons.push('Add valid project start and end dates.');
  } else if (daysOverdue > 0 && project.isActive !== false) {
    status = 'late';
    reasons.push(`${daysOverdue} day${daysOverdue === 1 ? '' : 's'} past the planned end date.`);
  } else if (demandAfterEnd > 0 || conflictSummary.people > 0 || backLoadedDemand > Math.max(8, totalPlannedDemand * 0.1)) {
    status = 'at-risk';
    if (demandAfterEnd > 0) reasons.push(`${Math.round(demandAfterEnd).toLocaleString('en-US')} planned hours extend beyond the end date.`);
    if (conflictSummary.people > 0) {
      reasons.push(`${conflictSummary.people} team member${conflictSummary.people === 1 ? ' has' : 's have'} allocation conflicts totaling ${Math.round(conflictSummary.hours).toLocaleString('en-US')} excess hours.`);
    }
    if (backLoadedDemand > Math.max(8, totalPlannedDemand * 0.1)) {
      reasons.push(`${Math.round(backLoadedDemand).toLocaleString('en-US')} more hours remain scheduled than expected at this point in the timeline.`);
    }
  } else if (project.started === false || (start !== null && nowTime < start)) {
    status = 'not-started';
    reasons.push('The project has not started.');
  } else if (reviewAgeDays === null || reviewAgeDays > 30 || totalPlannedDemand === 0) {
    status = 'watch';
    if (reviewAgeDays === null) reasons.push('The project plan has not been reviewed.');
    else if (reviewAgeDays > 30) reasons.push(`The project plan was last reviewed ${reviewAgeDays} days ago.`);
    if (totalPlannedDemand === 0) reasons.push('No planned team demand is recorded.');
  } else {
    status = 'on-track';
    reasons.push('Dates, staffing, and review cadence are within the current plan.');
  }

  return {
    status,
    label: STATUS_LABELS[status],
    reasons,
    timelineElapsedFraction,
    expectedDemandToDate,
    expectedRemainingDemand,
    backLoadedDemand,
    totalPlannedDemand,
    remainingDemand,
    demandAfterEnd,
    daysToEnd,
    daysOverdue,
    reviewAgeDays,
  };
}