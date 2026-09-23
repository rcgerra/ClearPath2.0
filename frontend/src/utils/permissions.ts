import type { AuthUser, Department, Project } from '../types';

/**
 * Mirrors the record-level rules enforced by the API. Roles grant breadth;
 * being the manager, lead or delegate on a record grants depth.
 */
const same = (a?: string, b?: string) => Boolean(a && b && a.toLowerCase() === b.toLowerCase());

export const isAdmin = (user?: AuthUser | null) => Boolean(user?.roles.includes('admin'));

/** Project manager or their delegate. */
export function ownsProject(user: AuthUser | null | undefined, project?: Pick<Project, 'managerPersonId' | 'delegatePersonId'>) {
  if (!user?.personId || !project) return false;
  return same(project.managerPersonId, user.personId) || same(project.delegatePersonId, user.personId);
}

/** Department lead or their delegate. */
export function leadsDepartment(
  user: AuthUser | null | undefined,
  department?: Pick<Department, 'leadPersonId' | 'delegatePersonId'>,
) {
  if (!user?.personId || !department) return false;
  return same(department.leadPersonId, user.personId) || same(department.delegatePersonId, user.personId);
}

/** Project metadata: manager, delegate or admin. */
export function canEditProject(user: AuthUser | null | undefined, project?: Project) {
  return isAdmin(user) || ownsProject(user, project);
}

/** Department metadata: lead, delegate or admin. */
export function canEditDepartment(user: AuthUser | null | undefined, department?: Department) {
  return isAdmin(user) || leadsDepartment(user, department);
}

/** Demand: admins everywhere, otherwise the project's assigned manager or demand delegate. */
export function canEditDemand(user: AuthUser | null | undefined, project?: Project) {
  return isAdmin(user) || ownsProject(user, project);
}

/** Availability: admins everywhere, otherwise your own or an assigned lead/delegate's department. */
export function canEditAvailability(
  user: AuthUser | null | undefined,
  target?: { personId?: string; department?: Pick<Department, 'leadPersonId' | 'delegatePersonId'> },
) {
  if (isAdmin(user)) return true;
  if (target?.personId && same(target.personId, user?.personId)) return true;
  return leadsDepartment(user, target?.department);
}
