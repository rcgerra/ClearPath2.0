import type { AuthUser, Department, Project, ProjectRequest } from '../types';
import { workflowStageIndex } from '../constants/phases';

/**
 * Mirrors the record-level rules enforced by the API. Roles grant breadth;
 * being the manager, lead or delegate on a record grants depth.
 */
const same = (a?: string, b?: string) => Boolean(a && b && a.toLowerCase() === b.toLowerCase());

export const isAdmin = (user?: AuthUser | null) => Boolean(user?.roles.includes('admin'));
export const isDemandModerator = (user?: AuthUser | null) => Boolean(user?.roles.includes('demand_moderator'));
export const isAvailabilityModerator = (user?: AuthUser | null) => Boolean(user?.roles.includes('availability_moderator'));

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
  return isAdmin(user) || isDemandModerator(user) || ownsProject(user, project);
}

export function canEditRequest(user: AuthUser | null | undefined, request?: ProjectRequest) {
  if (isAdmin(user) || user?.roles.includes('portfolio_manager') || user?.roles.includes('intake_moderator')) return true;
  if (request?.status?.toLowerCase() === 'submitted') return false;
  if (!request || ![0, 1].includes(workflowStageIndex(request.phase))) return false;
  return same(user?.personId, request.requesterPersonId)
    || same(user?.personId, request.sponsorPersonId)
    || same(user?.personId, request.delegatePersonId);
}

/** Availability: admins everywhere, otherwise your own or an assigned lead/delegate's department. */
export function canEditAvailability(
  user: AuthUser | null | undefined,
  target?: { personId?: string; department?: Pick<Department, 'leadPersonId' | 'delegatePersonId'> },
) {
  if (isAdmin(user) || isAvailabilityModerator(user)) return true;
  if (target?.personId && same(target.personId, user?.personId)) return true;
  return leadsDepartment(user, target?.department);
}
