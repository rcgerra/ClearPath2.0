import type { CapacityRow, DemandRow, NonProjectDemandRow, Person } from '../types';

export type RiskSeverity = 'critical' | 'high' | 'moderate';

export interface ConflictAssignment {
  id: string;
  label: string;
  type: 'project' | 'other';
  hours: number;
}

export interface AllocationConflict {
  personId: string;
  personName: string;
  departmentName?: string;
  severity: RiskSeverity;
  totalOver: number;
  maxWeeklyOver: number;
  overWeeks: number[];
  assignments: ConflictAssignment[];
}

function severityFor(maxWeeklyOver: number, overWeekCount: number): RiskSeverity {
  if (maxWeeklyOver > 16 || overWeekCount >= 6) return 'critical';
  if (maxWeeklyOver > 8 || overWeekCount >= 3) return 'high';
  return 'moderate';
}

export function buildAllocationConflicts({
  capacity,
  demand,
  nonProjectDemand,
  people,
  horizon,
  personIds,
}: {
  capacity: CapacityRow[];
  demand: DemandRow[];
  nonProjectDemand: NonProjectDemandRow[];
  people: Person[];
  horizon: number;
  personIds?: Set<string>;
}): AllocationConflict[] {
  const peopleById = new Map(people.map((person) => [person.id.toLowerCase(), person]));
  const capacityByPerson = new Map(capacity.map((row) => [row.personId.toLowerCase(), row]));
  const assignmentsByPerson = new Map<string, Array<{ id: string; label: string; type: 'project' | 'other'; weeks: number[] }>>();

  for (const row of demand) {
    if (!row.personId) continue;
    const key = row.personId.toLowerCase();
    const assignments = assignmentsByPerson.get(key) ?? [];
    assignments.push({ id: row.id, label: row.projectName ?? row.name ?? 'Unnamed project', type: 'project', weeks: row.weeks });
    assignmentsByPerson.set(key, assignments);
  }
  for (const row of nonProjectDemand) {
    const key = row.personId.toLowerCase();
    const assignments = assignmentsByPerson.get(key) ?? [];
    assignments.push({
      id: row.id,
      label: `${row.categoryName ?? 'Other work'}: ${row.subcategoryName ?? row.description ?? 'General'}`,
      type: 'other',
      weeks: row.weeks,
    });
    assignmentsByPerson.set(key, assignments);
  }

  const candidateIds = personIds ?? new Set([...assignmentsByPerson.keys(), ...capacityByPerson.keys()]);
  const conflicts: AllocationConflict[] = [];
  for (const key of candidateIds) {
    const assignments = assignmentsByPerson.get(key) ?? [];
    const capacityRow = capacityByPerson.get(key);
    const overWeeks: number[] = [];
    let totalOver = 0;
    let maxWeeklyOver = 0;
    for (let week = 0; week < horizon; week += 1) {
      const committed = assignments.reduce((sum, assignment) => sum + (assignment.weeks[week] ?? 0), 0);
      const available = capacityRow?.weeks[week] ?? 0;
      const over = committed - available;
      if (over > 0) {
        overWeeks.push(week);
        totalOver += over;
        maxWeeklyOver = Math.max(maxWeeklyOver, over);
      }
    }
    if (!overWeeks.length) continue;

    const person = peopleById.get(key);
    const conflictAssignments = assignments
      .map((assignment) => ({
        id: assignment.id,
        label: assignment.label,
        type: assignment.type,
        hours: overWeeks.reduce((sum, week) => sum + (assignment.weeks[week] ?? 0), 0),
      }))
      .filter((assignment) => assignment.hours > 0)
      .sort((first, second) => second.hours - first.hours);

    conflicts.push({
      personId: key,
      personName: person?.name ?? capacityRow?.personName ?? 'Unassigned',
      departmentName: person?.departmentName ?? capacityRow?.departmentName,
      severity: severityFor(maxWeeklyOver, overWeeks.length),
      totalOver,
      maxWeeklyOver,
      overWeeks,
      assignments: conflictAssignments,
    });
  }

  const severityRank: Record<RiskSeverity, number> = { critical: 3, high: 2, moderate: 1 };
  return conflicts.sort(
    (first, second) => severityRank[second.severity] - severityRank[first.severity] || second.totalOver - first.totalOver,
  );
}

export function applyWeekOverrides(weeks: number[], overrides: Record<number, number> | undefined, horizon: number): number[] {
  if (!overrides || !Object.keys(overrides).length) return weeks;
  return weeks.map((value, week) => week < horizon && Object.prototype.hasOwnProperty.call(overrides, week) ? overrides[week] : value);
}