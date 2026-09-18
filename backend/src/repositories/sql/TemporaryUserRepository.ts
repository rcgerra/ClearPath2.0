import { BaseRepository } from '../../database/BaseRepository';

export interface TemporaryUser {
  UserId: number;
  LegacyDataverseId: string | null;
  DisplayName: string;
  Email: string | null;
  Title: string | null;
  Department: string | null;
  Manager: string | null;
  Location: string | null;
  IsActive: boolean;
  CreatedDate: Date;
  ModifiedDate: Date;
}

export interface TemporaryUserInput {
  LegacyDataverseId?: string | null;
  DisplayName: string;
  Email?: string | null;
  Title?: string | null;
  Department?: string | null;
  Manager?: string | null;
  Location?: string | null;
}

export class TemporaryUserRepository extends BaseRepository<TemporaryUser> {
  public constructor() {
    super('Users');
  }

  public async list(search?: string, includeInactive = false, limit = 200): Promise<TemporaryUser[]> {
    return this.query<TemporaryUser>(
      `SELECT TOP (@limit) *
         FROM ${this.table}
        WHERE (@includeInactive = 1 OR [IsActive] = 1)
          AND (@search IS NULL OR [DisplayName] LIKE @search OR [Email] LIKE @search)
        ORDER BY [DisplayName] ASC`,
      {
        limit: Math.min(Math.max(limit, 1), 2000),
        includeInactive,
        search: search ? `%${search}%` : null,
      },
    );
  }

  public async findById(userId: number): Promise<TemporaryUser | null> {
    const rows = await this.query<TemporaryUser>(
      `SELECT * FROM ${this.table} WHERE [UserId] = @userId`,
      { userId },
    );
    return rows[0] ?? null;
  }

  public async findByIdentifier(identifier: string): Promise<TemporaryUser | null> {
    if (/^\d+$/.test(identifier)) return this.findById(Number(identifier));
    return this.findByLegacyDataverseId(identifier);
  }

  public async findByLegacyDataverseId(legacyId: string): Promise<TemporaryUser | null> {
    const rows = await this.query<TemporaryUser>(
      `SELECT * FROM ${this.table} WHERE [LegacyDataverseId] = @legacyId`,
      { legacyId },
    );
    return rows[0] ?? null;
  }

  public async create(input: TemporaryUserInput): Promise<number> {
    const rows = await this.query<{ UserId: number }>(
      `INSERT INTO ${this.table}
       ([LegacyDataverseId], [DisplayName], [Email], [Title], [Department], [Manager], [Location])
       OUTPUT INSERTED.[UserId]
       VALUES (@legacyDataverseId, @displayName, @email, @title, @department, @manager, @location)`,
      {
        legacyDataverseId: input.LegacyDataverseId ?? null,
        displayName: input.DisplayName,
        email: input.Email ?? null,
        title: input.Title ?? null,
        department: input.Department ?? null,
        manager: input.Manager ?? null,
        location: input.Location ?? null,
      },
    );
    return rows[0].UserId;
  }

  public async update(userId: number, input: Partial<TemporaryUserInput>): Promise<boolean> {
    const fields: Array<[keyof TemporaryUserInput, string]> = [
      ['LegacyDataverseId', 'LegacyDataverseId'],
      ['DisplayName', 'DisplayName'],
      ['Email', 'Email'],
      ['Title', 'Title'],
      ['Department', 'Department'],
      ['Manager', 'Manager'],
      ['Location', 'Location'],
    ];
    const parameters: Record<string, unknown> = { userId };
    const assignments = fields.flatMap(([property, column]) => {
      if (input[property] === undefined) return [];
      const parameter = String(property).replace(/^[A-Z]/, (character) => character.toLowerCase());
      parameters[parameter] = input[property];
      return [`[${column}] = @${parameter}`];
    });
    if (!assignments.length) return false;
    assignments.push('[ModifiedDate] = SYSUTCDATETIME()');
    const result = await this.execute(
      `UPDATE ${this.table} SET ${assignments.join(', ')} WHERE [UserId] = @userId`,
      parameters,
    );
    return (result.rowsAffected[0] ?? 0) > 0;
  }

  public async deactivate(userId: number): Promise<boolean> {
    const result = await this.execute(
      `UPDATE ${this.table}
          SET [IsActive] = 0, [ModifiedDate] = SYSUTCDATETIME()
        WHERE [UserId] = @userId AND [IsActive] = 1`,
      { userId },
    );
    return (result.rowsAffected[0] ?? 0) > 0;
  }

  public async upsertFromPeopleCsv(input: TemporaryUserInput): Promise<{ userId: number; created: boolean }> {
    if (!input.LegacyDataverseId) {
      const userId = await this.create(input);
      return { userId, created: true };
    }
    const existing = await this.findByLegacyDataverseId(input.LegacyDataverseId);
    if (!existing) {
      const userId = await this.create(input);
      return { userId, created: true };
    }
    await this.update(existing.UserId, input);
    return { userId: existing.UserId, created: false };
  }
}

export const temporaryUserRepository = new TemporaryUserRepository();
