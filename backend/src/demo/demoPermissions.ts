import type { AuthUser } from '../middleware/auth';
import { requestStageIndex } from '../services/requestWorkflow';

const samePerson = (first?: string, second?: string) =>
  Boolean(first && second && first.toLowerCase() === second.toLowerCase());

export function canEditAssignedRecord(user: AuthUser | undefined, ownerId?: string, delegateId?: string): boolean {
  return Boolean(user?.roles.includes('admin') || samePerson(user?.personId, ownerId) || samePerson(user?.personId, delegateId));
}

export function canEditAvailability(
  user: AuthUser | undefined,
  personId?: string,
  department?: { leadPersonId?: string; delegatePersonId?: string },
): boolean {
  return Boolean(user?.roles.includes('admin') || user?.roles.includes('availability_moderator')
    || samePerson(user?.personId, personId)
    || (department && canEditAssignedRecord(user, department.leadPersonId, department.delegatePersonId)));
}

export function canEditDemand(
  user: AuthUser | undefined,
  project: { managerPersonId?: string; delegatePersonId?: string },
): boolean {
  return Boolean(user?.roles.includes('demand_moderator')
    || canEditAssignedRecord(user, project.managerPersonId, project.delegatePersonId));
}

export function canEditRequest(
  user: AuthUser | undefined,
  request: { phase?: string | null; requesterPersonId?: string; sponsorPersonId?: string; delegatePersonId?: string },
): boolean {
  if (user?.roles.includes('admin') || user?.roles.includes('intake_moderator')) return true;
  if (![0, 1].includes(requestStageIndex(request.phase))) return false;
  return samePerson(user?.personId, request.requesterPersonId)
    || samePerson(user?.personId, request.sponsorPersonId)
    || samePerson(user?.personId, request.delegatePersonId);
}

export function canAssignRequestDelegate(
  user: AuthUser | undefined,
  request: { phase?: string | null; requesterPersonId?: string },
): boolean {
  return Boolean(user?.roles.includes('admin') || user?.roles.includes('intake_moderator')
    || (canEditRequest(user, request) && samePerson(user?.personId, request.requesterPersonId)));
}