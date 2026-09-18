import { BaseRepository } from '../BaseRepository';

export interface Department {
  DepartmentId: number;
  LegacyDataverseId: string | null;
  FunctionId: number | null;
  DepartmentLeadUserId: number | null;
  Name: string;
  Code: string | null;
  SiteName: string | null;
  IsActive: boolean;
  CreatedDate: Date;
  ModifiedDate: Date;
}

export interface DepartmentInput {
  LegacyDataverseId?: string | null;
  FunctionId?: number | null;
  DepartmentLeadUserId?: number | null;
  Name: string;
  Code?: string | null;
  SiteName?: string | null;
}

export class DepartmentRepository extends BaseRepository<Department> {
  public constructor() {
    super('Departments');
  }

  public async list(includeInactive = false): Promise<Department[]> {
    return this.query<Department>(
      `SELECT * FROM ${this.table}
       WHERE @includeInactive = 1 OR [IsActive] = 1
       ORDER BY [Name] ASC`,
      { includeInactive },
    );
  }

  public async findById(departmentId: number): Promise<Department | null> {
    return this.findEntityById<Department>('DepartmentId', departmentId);
  }

  public async create(input: DepartmentInput): Promise<number> {
    const rows = await this.query<{ DepartmentId: number }>(
      `INSERT INTO ${this.table}
       ([LegacyDataverseId], [FunctionId], [DepartmentLeadUserId], [Name], [Code], [SiteName])
       OUTPUT INSERTED.[DepartmentId]
       VALUES (@legacyDataverseId, @functionId, @departmentLeadUserId, @name, @code, @siteName)`,
      {
        legacyDataverseId: input.LegacyDataverseId ?? null,
        functionId: input.FunctionId ?? null,
        departmentLeadUserId: input.DepartmentLeadUserId ?? null,
        name: input.Name,
        code: input.Code ?? null,
        siteName: input.SiteName ?? null,
      },
    );
    return rows[0].DepartmentId;
  }

  public async update(departmentId: number, input: Partial<DepartmentInput>): Promise<boolean> {
    const assignments: string[] = [];
    const parameters: Record<string, unknown> = { departmentId };
    const fields: Array<[keyof DepartmentInput, string]> = [
      ['LegacyDataverseId', 'LegacyDataverseId'],
      ['FunctionId', 'FunctionId'],
      ['DepartmentLeadUserId', 'DepartmentLeadUserId'],
      ['Name', 'Name'],
      ['Code', 'Code'],
      ['SiteName', 'SiteName'],
    ];

    for (const [property, column] of fields) {
      if (input[property] !== undefined) {
        const parameter = property.toLowerCase();
        assignments.push(`[${column}] = @${parameter}`);
        parameters[parameter] = input[property];
      }
    }

    if (assignments.length === 0) return false;
    assignments.push('[ModifiedDate] = SYSUTCDATETIME()');
    const result = await this.execute(
      `UPDATE ${this.table}
       SET ${assignments.join(', ')}
       WHERE [DepartmentId] = @departmentId AND [IsActive] = 1`,
      parameters,
    );
    return (result.rowsAffected[0] ?? 0) > 0;
  }

  public async deactivate(departmentId: number): Promise<boolean> {
    const result = await this.execute(
      `UPDATE ${this.table}
       SET [IsActive] = 0, [ModifiedDate] = SYSUTCDATETIME()
       WHERE [DepartmentId] = @departmentId AND [IsActive] = 1`,
      { departmentId },
    );
    return (result.rowsAffected[0] ?? 0) > 0;
  }
}

export const departmentRepository = new DepartmentRepository();