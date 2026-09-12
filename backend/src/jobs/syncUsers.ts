import * as dv from '../dataverse/client';
import { COLUMNS } from '../dataverse/fields';

const U = COLUMNS.users;
const P = COLUMNS.people;

export interface SyncResult {
  scanned: number;
  created: number;
  updated: number;
  skipped: number;
}

/**
 * One-way sync from the read-only User (systemuser) table into _People.
 * Department, function and role assignments are owned locally and never overwritten.
 */
export async function syncUsersToPeople(options: { dryRun?: boolean } = {}): Promise<SyncResult> {
  const result: SyncResult = { scanned: 0, created: 0, updated: 0, skipped: 0 };

  const users = await dv.list('users', {
    select: [U.id, U.fullName, U.email, U.jobTitle, U.isDisabled],
    filter: 'isdisabled eq false',
    top: 5000,
    includeFormattedValues: false,
  });

  const people = await dv.list('people', {
    select: [P.id, P.name, P.email, P.userId, P.title, P.isActive],
    top: 5000,
    includeFormattedValues: false,
  });
  const peopleByUserId = new Map(
    people.filter((p) => p[P.userId]).map((p) => [String(p[P.userId]).toLowerCase(), p as Record<string, unknown>]),
  );

  for (const user of users as Array<Record<string, unknown>>) {
    result.scanned += 1;
    const userId = String(user[U.id]);
    const email = user[U.email] ? String(user[U.email]) : null;
    if (!email) {
      result.skipped += 1;
      continue;
    }

    const existing = peopleByUserId.get(userId.toLowerCase());
    if (existing) {
      const needsUpdate =
        existing[P.name] !== user[U.fullName] ||
        existing[P.email] !== email ||
        existing[P.title] !== (user[U.jobTitle] ?? null);
      if (!needsUpdate) {
        result.skipped += 1;
        continue;
      }
      if (!options.dryRun) {
        await dv.update('people', String(existing[P.id]), {
          [P.name]: user[U.fullName],
          [P.email]: email,
          [P.title]: user[U.jobTitle] ?? null,
        });
      }
      result.updated += 1;
      continue;
    }

    if (!options.dryRun) {
      await dv.create('people', {
        [P.name]: user[U.fullName],
        [P.email]: email,
        [P.title]: user[U.jobTitle] ?? null,
        [P.isActive]: true,
        ...(await dv.lookupBind(P.userBind, 'systemuser', userId)),
      });
    }
    result.created += 1;
  }

  return result;
}

if (require.main === module) {
  const dryRun = process.argv.includes('--dry-run');
  syncUsersToPeople({ dryRun })
    .then((result) => {
      console.log(`User sync ${dryRun ? '(dry run) ' : ''}complete:`, result);
      process.exit(0);
    })
    .catch((error) => {
      console.error('User sync failed:', error?.response?.data ?? error);
      process.exit(1);
    });
}
