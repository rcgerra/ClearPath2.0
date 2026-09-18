import fs from 'node:fs/promises';
import { z } from 'zod';
import {
  TemporaryUser,
  TemporaryUserInput,
  temporaryUserRepository,
} from '../repositories/sql/TemporaryUserRepository';

const userSchema = z.object({
  LegacyDataverseId: z.string().uuid().nullable().optional(),
  DisplayName: z.string().trim().min(1).max(200),
  Email: z.string().email().max(320).nullable().optional(),
  Title: z.string().max(200).nullable().optional(),
  Department: z.string().max(200).nullable().optional(),
  Manager: z.string().max(200).nullable().optional(),
  Location: z.string().max(200).nullable().optional(),
});

export interface PeopleCsvImportResult {
  scanned: number;
  created: number;
  updated: number;
  skipped: number;
}

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      row.push(field);
      field = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(field);
      field = '';
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
    } else {
      field += character;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }

  const headers = (rows.shift() ?? []).map((header) => header.replace(/^\uFEFF/, '').trim());
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? ''])));
}

const nullable = (value: string | undefined) => value?.trim() || null;

function peopleCsvRowToUser(row: Record<string, string>): TemporaryUserInput {
  return userSchema.parse({
    LegacyDataverseId: nullable(row.new_peopleid),
    DisplayName: row.new_name,
    // People.csv does not currently export all identity attributes. They remain
    // nullable until the future Microsoft Entra ID synchronization supplies them.
    Email: nullable(row.new_email),
    Title: nullable(row.new_title),
    Department: nullable(row.new_departmentsid),
    Manager: nullable(row.new_manager),
    Location: nullable(row.new_siteid ?? row.new_site),
  });
}

export class UserService {
  public async list(search?: string, includeInactive = false, limit = 200): Promise<TemporaryUser[]> {
    return temporaryUserRepository.list(search, includeInactive, limit);
  }

  public async get(identifier: string): Promise<TemporaryUser | null> {
    return temporaryUserRepository.findByIdentifier(identifier);
  }

  public async create(input: TemporaryUserInput): Promise<number> {
    return temporaryUserRepository.create(userSchema.parse(input));
  }

  public async update(userId: number, input: Partial<TemporaryUserInput>): Promise<boolean> {
    return temporaryUserRepository.update(userId, userSchema.partial().parse(input));
  }

  public async deactivate(userId: number): Promise<boolean> {
    return temporaryUserRepository.deactivate(userId);
  }

  /**
   * Temporary migration path from People.csv.
   * Future migration: source identity attributes from Microsoft Entra ID rather
   * than relying on the Dataverse export or manually maintained CSV values.
   */
  public async importPeopleCsv(filePath: string): Promise<PeopleCsvImportResult> {
    const rows = parseCsv(await fs.readFile(filePath, 'utf8'));
    const result: PeopleCsvImportResult = { scanned: 0, created: 0, updated: 0, skipped: 0 };

    for (const row of rows) {
      result.scanned += 1;
      const input = peopleCsvRowToUser(row);
      if (!input.LegacyDataverseId || !input.DisplayName) {
        result.skipped += 1;
        continue;
      }
      const existing = await temporaryUserRepository.findByLegacyDataverseId(input.LegacyDataverseId);
      await temporaryUserRepository.upsertFromPeopleCsv(input);
      if (existing) result.updated += 1;
      else result.created += 1;
    }
    return result;
  }
}

export const userService = new UserService();
