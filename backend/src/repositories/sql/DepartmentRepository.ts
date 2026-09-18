import { Department, DepartmentInput, DepartmentRepository as DepartmentRepositoryContract } from '../interfaces';
import { SqlCrudRepository } from './SqlCrudRepository';
import { encodeArray, MAX_POSITIONS } from '../../utils/arrayParser';

export interface DepartmentView extends Department {
  DepartmentApiId: string;
  LeadPersonApiId: string | null;
  LeadName: string | null;
  DelegatePersonApiId: string | null;
  DelegateName: string | null;
  FunctionApiId: string | null;
  FunctionName: string | null;
}

export interface DepartmentTeamMember {
  id: string;
  name: string;
  email?: string;
  role?: string;
  title?: string;
  weeklyHours?: number;
  functionName?: string;
  isActive?: boolean;
  capacityId: string | null;
  availabilityHours: string | null;
  weeklyBaseline: number | null;
}

interface DepartmentTeamRow {
  PersonApiId: string | null;
  PersonId: number;
  PersonName: string;
  Email: string | null;
  WeeklyHours: number | null;
  IsActive: boolean;
  CapacityApiId: string | null;
  WeeklyBaseline: number | null;
  WeekStartDate: Date | null;
  Hours: number | null;
}

export class DepartmentRepository
  extends SqlCrudRepository<Department, DepartmentInput>
  implements DepartmentRepositoryContract
{
  public constructor() {
    super('Departments', 'DepartmentId', [
      { input: 'LegacyDataverseId', column: 'LegacyDataverseId' },
      { input: 'FunctionId', column: 'FunctionId' },
      { input: 'DepartmentLeadUserId', column: 'DepartmentLeadUserId' },
      { input: 'Name', column: 'Name' },
      { input: 'Code', column: 'Code' },
      { input: 'SiteName', column: 'SiteName' },
    ]);
  }

  public override async list(includeInactive = false): Promise<DepartmentView[]> {
    return this.query<DepartmentView>(this.projectionSql(), { includeInactive });
  }

  public override async findById(departmentId: number): Promise<DepartmentView | null> {
    const rows = await this.query<DepartmentView>(
      `${this.projectionSql('AND d.[DepartmentId] = @departmentId')}`,
      { includeInactive: true, departmentId },
    );
    return rows[0] ?? null;
  }

  public async findByIdentifier(identifier: string): Promise<DepartmentView | null> {
    const numericId = this.numericIdentifier(identifier);
    const rows = numericId === null
      ? await this.query<DepartmentView>(
          `${this.projectionSql('AND d.[LegacyDataverseId] = @legacyDataverseId')}`,
          { includeInactive: true, legacyDataverseId: identifier },
        )
      : await this.query<DepartmentView>(
          `${this.projectionSql('AND d.[DepartmentId] = @departmentId')}`,
          { includeInactive: true, departmentId: numericId },
        );
    return rows[0] ?? null;
  }

  public async resolveFunctionId(identifier: string): Promise<number | null> {
    const numericId = this.numericIdentifier(identifier);
    const rows = numericId === null
      ? await this.query<{ FunctionId: number }>(
          'SELECT FunctionId FROM dbo.[Functions] WHERE LegacyDataverseId = @legacyDataverseId',
          { legacyDataverseId: identifier },
        )
      : await this.query<{ FunctionId: number }>(
          'SELECT FunctionId FROM dbo.[Functions] WHERE FunctionId = @functionId',
          { functionId: numericId },
        );
    return rows[0]?.FunctionId ?? null;
  }

  public async resolveLeadUserId(identifier: string): Promise<number | null> {
    const numericId = this.numericIdentifier(identifier);
    const rows = numericId === null
      ? await this.query<{ DirectoryUserId: number | null }>(
          'SELECT DirectoryUserId FROM dbo.[People] WHERE LegacyDataverseId = @legacyDataverseId',
          { legacyDataverseId: identifier },
        )
      : await this.query<{ DirectoryUserId: number | null }>(
          'SELECT DirectoryUserId FROM dbo.[People] WHERE PersonId = @personId',
          { personId: numericId },
        );
    return rows[0]?.DirectoryUserId ?? null;
  }

  public async canPersonEdit(departmentIdentifier: string, personIdentifier: string): Promise<boolean> {
    const department = await this.findByIdentifier(departmentIdentifier);
    const personId = await this.resolvePersonId(personIdentifier);
    if (!department || personId === null) return false;
    const rows = await this.query<{ Allowed: number }>(
      `SELECT TOP (1) 1 AS Allowed
         FROM dbo.[Departments] d
         LEFT JOIN dbo.[People] leadPerson ON leadPerson.[DirectoryUserId] = d.[DepartmentLeadUserId]
         LEFT JOIN dbo.[DepartmentDelegates] delegateRecord ON delegateRecord.[DepartmentId] = d.[DepartmentId]
         LEFT JOIN dbo.[People] delegatePerson ON delegatePerson.[DirectoryUserId] = delegateRecord.[DirectoryUserId]
        WHERE d.[DepartmentId] = @departmentId
          AND (leadPerson.[PersonId] = @personId OR delegatePerson.[PersonId] = @personId)`,
      { departmentId: department.DepartmentId, personId },
    );
    return rows.length > 0;
  }

  public async listTeam(departmentIdentifier: string): Promise<DepartmentTeamMember[]> {
    const numericId = this.numericIdentifier(departmentIdentifier);
    const rows = numericId === null
      ? await this.query<DepartmentTeamRow>(this.teamSql('d.[LegacyDataverseId] = @legacyDataverseId'), { legacyDataverseId: departmentIdentifier })
      : await this.query<DepartmentTeamRow>(this.teamSql('d.[DepartmentId] = @departmentId'), { departmentId: numericId });
    const grouped = new Map<number, { row: DepartmentTeamRow; weeks: number[] }>();

    for (const row of rows) {
      const current = grouped.get(row.PersonId) ?? { row, weeks: [] };
      if (row.WeekStartDate && row.Hours !== null) current.weeks.push(row.Hours);
      grouped.set(row.PersonId, current);
    }

    return [...grouped.values()].map(({ row, weeks }) => ({
      id: row.PersonApiId ?? String(row.PersonId),
      name: row.PersonName,
      email: row.Email ?? undefined,
      weeklyHours: row.WeeklyHours ?? undefined,
      isActive: row.IsActive,
      capacityId: row.CapacityApiId,
      availabilityHours: row.CapacityApiId ? encodeArray(weeks, MAX_POSITIONS) : null,
      weeklyBaseline: row.WeeklyBaseline,
    }));
  }

  public async resolvePersonId(identifier: string): Promise<number | null> {
    const numericId = this.numericIdentifier(identifier);
    const rows = numericId === null
      ? await this.query<{ PersonId: number }>(
          'SELECT PersonId FROM dbo.[People] WHERE LegacyDataverseId = @legacyDataverseId',
          { legacyDataverseId: identifier },
        )
      : await this.query<{ PersonId: number }>(
          'SELECT PersonId FROM dbo.[People] WHERE PersonId = @personId',
          { personId: numericId },
        );
    return rows[0]?.PersonId ?? null;
  }

  private projectionSql(predicate = ''): string {
    return `SELECT d.*,
                   COALESCE(CONVERT(varchar(36), d.[LegacyDataverseId]), CONVERT(varchar(20), d.[DepartmentId])) AS DepartmentApiId,
                   leadPerson.[LegacyDataverseId] AS LeadPersonApiId,
                   leadPerson.[Name] AS LeadName,
                   delegatePerson.[LegacyDataverseId] AS DelegatePersonApiId,
                   delegatePerson.[Name] AS DelegateName,
                   COALESCE(CONVERT(varchar(36), f.[LegacyDataverseId]), CONVERT(varchar(20), f.[FunctionId])) AS FunctionApiId,
                   f.[Name] AS FunctionName
              FROM dbo.[Departments] d
              LEFT JOIN dbo.[People] leadPerson ON leadPerson.[DirectoryUserId] = d.[DepartmentLeadUserId]
              LEFT JOIN dbo.[Functions] f ON f.[FunctionId] = d.[FunctionId]
              OUTER APPLY (
                SELECT TOP (1) person.[LegacyDataverseId], person.[Name]
                  FROM dbo.[DepartmentDelegates] delegateRecord
                  JOIN dbo.[People] person ON person.[DirectoryUserId] = delegateRecord.[DirectoryUserId]
                 WHERE delegateRecord.[DepartmentId] = d.[DepartmentId]
                 ORDER BY delegateRecord.[DirectoryUserId]
              ) delegatePerson
             WHERE (@includeInactive = 1 OR d.[IsActive] = 1) ${predicate}
             ORDER BY d.[Name] ASC`;
  }

  private teamSql(predicate: string): string {
    return `SELECT p.[PersonId], p.[LegacyDataverseId] AS PersonApiId, p.[Name] AS PersonName,
                   u.[Email], p.[WeeklyHours], p.[IsActive],
                   c.[CapacityId], COALESCE(CONVERT(varchar(36), c.[LegacyDataverseId]), CONVERT(varchar(20), c.[CapacityId])) AS CapacityApiId,
                   c.[WeeklyBaseline], cw.[WeekStartDate], cw.[Hours]
              FROM dbo.[Departments] d
              JOIN dbo.[People] p ON p.[DepartmentId] = d.[DepartmentId]
              LEFT JOIN dbo.[DirectoryUsers] u ON u.[DirectoryUserId] = p.[DirectoryUserId]
              LEFT JOIN dbo.[Capacity] c ON c.[PersonId] = p.[PersonId] AND c.[IsActive] = 1
              LEFT JOIN dbo.[CapacityWeeks] cw ON cw.[CapacityId] = c.[CapacityId] AND cw.[IsActive] = 1
             WHERE ${predicate}
             ORDER BY p.[Name] ASC, cw.[WeekStartDate] ASC`;
  }

  private numericIdentifier(identifier: string): number | null {
    return /^\d+$/.test(identifier) ? Number(identifier) : null;
  }
}

export const departmentRepository = new DepartmentRepository();
