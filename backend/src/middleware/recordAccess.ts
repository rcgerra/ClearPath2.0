import * as dv from '../dataverse/client';
import { COLUMNS } from '../dataverse/fields';
import { AuthUser } from './auth';
import { HttpError } from './errorHandler';

/**
 * Record-level authorization. Roles grant breadth (all projects, all availability);
 * ownership grants depth on a single record (my project, my department).
 */
const same = (a: unknown, b?: string) => Boolean(a && b && String(a).toLowerCase() === b.toLowerCase());

function requireUser(user?: AuthUser): AuthUser {
  if (!user) throw new HttpError(401, 'Authentication required.');
  return user;
}

const isAdmin = (user: AuthUser) => user.roles.includes('admin');

/** Project manager or delegate on the project record. */
export async function assertProjectEditable(user: AuthUser | undefined, projectId: string): Promise<void> {
  const current = requireUser(user);
  if (isAdmin(current)) return;

  const PR = COLUMNS.projects;
  const project = (await dv.retrieve('projects', projectId, {
    select: [PR.id, PR.managerPersonId, PR.delegatePersonId],
    includeFormattedValues: false,
  })) as Record<string, unknown>;

  if (same(project[PR.managerPersonId], current.personId) || same(project[PR.delegatePersonId], current.personId)) {
    return;
  }
  throw new HttpError(403, 'Only the project manager, their delegate or an admin can change this project.');
}

/** Department lead or delegate on the department record. */
export async function assertDepartmentEditable(user: AuthUser | undefined, departmentId: string): Promise<void> {
  const current = requireUser(user);
  if (isAdmin(current)) return;

  const D = COLUMNS.departments;
  const department = (await dv.retrieve('departments', departmentId, {
    select: [D.id, D.leadPersonId, D.delegatePersonId],
    includeFormattedValues: false,
  })) as Record<string, unknown>;

  if (same(department[D.leadPersonId], current.personId) || same(department[D.delegatePersonId], current.personId)) {
    return;
  }
  throw new HttpError(403, 'Only the department lead, their delegate or an admin can change this department.');
}

/** Demand moderators cover every project; otherwise the project manager or delegate. */
export async function assertDemandEditable(user: AuthUser | undefined, projectId: string): Promise<void> {
  const current = requireUser(user);
  if (isAdmin(current) || current.roles.includes('demand_moderator')) return;
  await assertProjectEditable(current, projectId);
}

/** Demand moderators and project owners can edit any week; assignees can edit their own weekly hours. */
export async function assertDemandWeeksEditable(user: AuthUser | undefined, demandId: string): Promise<void> {
  const current = requireUser(user);
  const D = COLUMNS.demand;
  const row = (await dv.retrieve('demand', demandId, {
    select: [D.id, D.projectId, D.personId],
    includeFormattedValues: false,
  })) as Record<string, unknown>;

  if (same(row[D.personId], current.personId)) return;
  const projectId = row[D.projectId];
  if (!projectId) throw new HttpError(404, 'Demand row is not linked to a project.');
  await assertDemandEditable(current, String(projectId));
}

/** Availability moderators cover every department; otherwise the owner, or their lead/delegate. */
export async function assertAvailabilityEditable(
  user: AuthUser | undefined,
  target: { personId?: string; departmentId?: string },
): Promise<void> {
  const current = requireUser(user);
  if (isAdmin(current) || current.roles.includes('availability_moderator')) return;
  if (same(target.personId, current.personId)) return;

  if (target.departmentId) {
    const D = COLUMNS.departments;
    const department = (await dv.retrieve('departments', target.departmentId, {
      select: [D.id, D.leadPersonId, D.delegatePersonId],
      includeFormattedValues: false,
    })) as Record<string, unknown>;

    if (same(department[D.leadPersonId], current.personId) || same(department[D.delegatePersonId], current.personId)) {
      return;
    }
  }
  throw new HttpError(403, 'Only the department lead, their delegate or an availability moderator can change this.');
}

/** Resolves a person's department for authorization and SQL-backed workload records. */
export async function departmentIdForPerson(personId: string): Promise<string | undefined> {
  const P = COLUMNS.people;
  const person = (await dv.retrieve('people', personId, {
    select: [P.id, P.departmentId],
    includeFormattedValues: false,
  })) as Record<string, unknown>;
  return person[P.departmentId] ? String(person[P.departmentId]) : undefined;
}

/** Resolves the project a demand row belongs to. */
export async function projectIdForDemand(demandId: string): Promise<string> {
  const D = COLUMNS.demand;
  const row = (await dv.retrieve('demand', demandId, {
    select: [D.id, D.projectId],
    includeFormattedValues: false,
  })) as Record<string, unknown>;
  const projectId = row[D.projectId];
  if (!projectId) throw new HttpError(404, 'Demand row is not linked to a project.');
  return String(projectId);
}

/** Resolves the person and department an availability row belongs to. */
export async function ownerForCapacity(capacityId: string): Promise<{ personId?: string; departmentId?: string }> {
  const C = COLUMNS.capacity;
  const row = (await dv.retrieve('capacity', capacityId, {
    select: [C.id, C.personId, C.departmentId],
    includeFormattedValues: false,
  })) as Record<string, unknown>;
  return {
    personId: row[C.personId] ? String(row[C.personId]) : undefined,
    departmentId: row[C.departmentId] ? String(row[C.departmentId]) : undefined,
  };
}
