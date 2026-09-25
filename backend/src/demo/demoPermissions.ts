import type { AuthUser } from '../middleware/auth';

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