export type OwnershipScope = 'mine' | 'all';

/** How the signed-in user relates to a record: owning it, delegated on it, or read-only. */
export type OwnershipRole = 'owner' | 'delegate' | 'viewer';

interface OwnableRecord {
  managerPersonId?: string;
  sponsorPersonId?: string;
  leadPersonId?: string;
  requesterPersonId?: string;
  delegatePersonId?: string;
  isActive?: boolean;
}

export function ownershipRole(record: OwnableRecord, personId?: string): OwnershipRole {
  if (!personId) return 'viewer';
  const target = personId.toLowerCase();
  const matches = (value?: string) => value?.toLowerCase() === target;

  if (
    matches(record.managerPersonId) ||
    matches(record.leadPersonId) ||
    matches(record.sponsorPersonId) ||
    matches(record.requesterPersonId)
  ) {
    return 'owner';
  }
  return matches(record.delegatePersonId) ? 'delegate' : 'viewer';
}

/** Row styling hook: ownership plus active state. */
export function rowClassName(record: OwnableRecord, personId?: string): string {
  const classes = [`row-${ownershipRole(record, personId)}`];
  if (record.isActive === false) classes.push('row-inactive');
  return classes.join(' ');
}

export function isMine(record: OwnableRecord, personId?: string): boolean {
  if (!personId) return false;
  const target = personId.toLowerCase();
  return [
    record.managerPersonId,
    record.sponsorPersonId,
    record.leadPersonId,
    record.requesterPersonId,
    record.delegatePersonId,
  ].some((value) => value?.toLowerCase() === target);
}

export function filterByScope<T extends OwnableRecord>(rows: T[], scope: OwnershipScope, personId?: string): T[] {
  return scope === 'all' ? rows : rows.filter((row) => isMine(row, personId));
}
