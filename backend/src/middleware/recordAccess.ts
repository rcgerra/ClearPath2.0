import * as dv from '../dataverse/client';
import { COLUMNS } from '../dataverse/fields';
import { projectRepository } from '../repositories/sql';
import { departmentRepository } from '../repositories/sql/DepartmentRepository';
import { AuthUser } from './auth';
import { HttpError } from './errorHandler';

/**
 * Record-level authorization. Admins grant assignments; project managers,
 * department leads and their record delegates control the assigned record.
 */
const same = (a: unknown, b?: string) => Boolean(a && b && String(a).toLowerCase() === b.toLowerCase());

function requireUser(user?: AuthUser): AuthUser {
  if (!user) throw new HttpError(401, 'Authentication required.');
  return user;
}

const isAdmin = (user: AuthUser) => user.roles.includes('admin');
const isDemandModerator = (user: AuthUser) => user.roles.includes('demand_moderator');
const isAvailabilityModerator = (user: AuthUser) => user.roles.includes('availability_moderator');

/** Project manager or delegate on the project record. */
export async function assertProjectEditable(user: AuthUser | undefined, projectId: string): Promise<void> {
  const current = requireUser(user);
  if (isAdmin(current)) return;

  if (current.personId && await projectRepository.canPersonEdit(projectId, current.personId)) {
    return;
  }
  throw new HttpError(403, 'Only the project manager, their delegate or an admin can change this project.');
}

/** Department lead or delegate on the department record. */
export async function assertDepartmentEditable(user: AuthUser | undefined, departmentId: string): Promise<void> {
  const current = requireUser(user);
  if (isAdmin(current)) return;

  if (current.personId && await departmentRepository.canPersonEdit(departmentId, current.personId)) {
    return;
  }
  throw new HttpError(403, 'Only the department lead, their delegate or an admin can change this department.');
}

/** Project demand is controlled by the project's manager, demand delegate or an admin. */
export async function assertDemandEditable(user: AuthUser | undefined, projectId: string): Promise<void> {
  const current = requireUser(user);
  if (isAdmin(current) || isDemandModerator(current)) return;
  await assertProjectEditable(current, projectId);
}

/** Project owners can edit any week; assignees retain self-service for their own weekly hours. */
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

/** Availability is controlled by the owner, assigned department lead/delegate or an admin. */
export async function assertAvailabilityEditable(
  user: AuthUser | undefined,
  target: { personId?: string; departmentId?: string },
): Promise<void> {
  const current = requireUser(user);
  if (isAdmin(current) || isAvailabilityModerator(current)) return;
  if (same(target.personId, current.personId)) return;

  if (target.departmentId) {
    if (current.personId && await departmentRepository.canPersonEdit(target.departmentId, current.personId)) {
      return;
    }
  }
  throw new HttpError(403, 'Only the person, their department lead, department delegate or an admin can change this.');
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
