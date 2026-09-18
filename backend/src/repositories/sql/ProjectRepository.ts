import { BaseRepository } from '../../database/BaseRepository';
import { Project, ProjectInput, ProjectRepository as ProjectRepositoryContract } from '../interfaces';

export interface ProjectView extends Project {
  ProjectApiId: string;
  ManagerPersonApiId: string | null;
  ManagerName: string | null;
  SponsorPersonApiId: string | null;
  SponsorName: string | null;
  DelegatePersonApiId: string | null;
  DelegateName: string | null;
  ProgramApiId: string | null;
  ProgramName: string | null;
  DepartmentApiId: string | null;
  DepartmentName: string | null;
  RequestApiId: string | null;
}

export interface ProjectListFilters {
  includeInactive?: boolean;
  managerPersonId?: string;
  departmentId?: string;
  search?: string;
}

export class ProjectRepository extends BaseRepository<Project> implements ProjectRepositoryContract {
  public constructor() {
    super('Projects');
  }

  public async list(includeInactive = false): Promise<ProjectView[]> {
    return this.listFiltered({ includeInactive });
  }

  public async listFiltered(filters: ProjectListFilters = {}): Promise<ProjectView[]> {
    const predicates = ['(@includeInactive = 1 OR p.[IsActive] = 1)'];
    const parameters: Record<string, unknown> = { includeInactive: filters.includeInactive ?? false };

    if (filters.managerPersonId) {
      predicates.push('(managerPerson.[LegacyDataverseId] = @managerPersonId OR managerPerson.[PersonId] = TRY_CONVERT(int, @managerPersonId))');
      parameters.managerPersonId = filters.managerPersonId;
    }
    if (filters.departmentId) {
      predicates.push('(d.[LegacyDataverseId] = @departmentId OR d.[DepartmentId] = TRY_CONVERT(int, @departmentId))');
      parameters.departmentId = filters.departmentId;
    }
    if (filters.search) {
      predicates.push('p.[Name] LIKE @search');
      parameters.search = `%${filters.search}%`;
    }

    return this.query<ProjectView>(
      `${this.projectionSql()}
       WHERE ${predicates.join(' AND ')}
       ORDER BY p.[PriorityScore] DESC, p.[Name] ASC`,
      parameters,
    );
  }

  public async listByRequest(requestId: number, includeInactive = false): Promise<ProjectView[]> {
    return this.listWithParentFilter('RequestId', requestId, includeInactive);
  }

  public async listBySite(siteId: number, includeInactive = false): Promise<ProjectView[]> {
    return this.listWithParentFilter('SiteId', siteId, includeInactive);
  }

  public async findById(projectId: number): Promise<ProjectView | null> {
    const rows = await this.query<ProjectView>(
      `${this.projectionSql()} WHERE p.[ProjectId] = @projectId`,
      { projectId },
    );
    return rows[0] ?? null;
  }

  public async findByIdentifier(identifier: string): Promise<ProjectView | null> {
    const numericId = /^\d+$/.test(identifier) ? Number(identifier) : null;
    const predicate = numericId === null
      ? 'p.[LegacyDataverseId] = @legacyDataverseId'
      : 'p.[ProjectId] = @projectId';
    const rows = await this.query<ProjectView>(
      `${this.projectionSql()} WHERE ${predicate}`,
      numericId === null ? { legacyDataverseId: identifier } : { projectId: numericId },
    );
    return rows[0] ?? null;
  }

  public async create(input: ProjectInput): Promise<number> {
    const columns: Array<keyof ProjectInput> = [
      'LegacyDataverseId', 'RequestId', 'SiteId', 'ProgramId', 'DepartmentId',
      'ProjectManagerUserId', 'SponsorUserId', 'DelegateUserId', 'Name', 'SpotId',
        'Code',
      'Description', 'ProblemStatement', 'StatusCode', 'MustDo', 'Started',
      'PriorityScore', 'StartDate', 'EndDate', 'LastCheckIn', 'LastUpdatedDate',
      'IsActive',
      'IsActive',
    ];
    const parameters: Record<string, unknown> = {};
    const names: string[] = [];
    const values: string[] = [];
    for (const column of columns) {
      const value = input[column];
      if (value === undefined) continue;
      const name = String(column).replace(/^[A-Z]/, (character) => character.toLowerCase());
      names.push(`[${String(column)}]`);
      values.push(`@${name}`);
      parameters[name] = value;
    }
    if (!input.Name) throw new Error('Project name is required.');
    const rows = await this.query<{ ProjectId: number }>(
      `INSERT INTO ${this.table} (${names.join(', ')})
       OUTPUT INSERTED.[ProjectId]
       VALUES (${values.join(', ')})`,
      parameters,
    );
    return rows[0].ProjectId;
  }

  public async update(projectId: number, input: Partial<ProjectInput>): Promise<boolean> {
    const allowed: Array<keyof ProjectInput> = [
      'LegacyDataverseId', 'RequestId', 'SiteId', 'ProgramId', 'DepartmentId',
      'ProjectManagerUserId', 'SponsorUserId', 'DelegateUserId', 'Name', 'SpotId',
        'Code',
      'Description', 'ProblemStatement', 'StatusCode', 'MustDo', 'Started',
      'PriorityScore', 'StartDate', 'EndDate', 'LastCheckIn', 'LastUpdatedDate',
    ];
    const parameters: Record<string, unknown> = { projectId };
    const assignments: string[] = [];
    for (const column of allowed) {
      if (input[column] === undefined) continue;
      const name = String(column).replace(/^[A-Z]/, (character) => character.toLowerCase());
      assignments.push(`[${String(column)}] = @${name}`);
      parameters[name] = input[column];
    }
    if (!assignments.length) return false;
    assignments.push('[ModifiedDate] = SYSUTCDATETIME()');
    const result = await this.execute(
      `UPDATE ${this.table} SET ${assignments.join(', ')} WHERE [ProjectId] = @projectId AND [IsActive] = 1`,
      parameters,
    );
    return (result.rowsAffected[0] ?? 0) > 0;
  }

  public async deactivate(projectId: number): Promise<boolean> {
    const result = await this.execute(
      `UPDATE ${this.table}
       SET [IsActive] = 0, [ModifiedDate] = SYSUTCDATETIME()
       WHERE [ProjectId] = @projectId AND [IsActive] = 1`,
      { projectId },
    );
    return (result.rowsAffected[0] ?? 0) > 0;
  }

  public async resolveInput(input: ProjectApiInput): Promise<ProjectInput> {
    return {
      LegacyDataverseId: input.LegacyDataverseId,
      RequestId: await this.resolveId('Requests', 'RequestId', input.requestId),
      SiteId: await this.resolveId('Sites', 'SiteId', input.siteId),
      ProgramId: await this.resolveId('Programs', 'ProgramId', input.programId),
      DepartmentId: await this.resolveId('Departments', 'DepartmentId', input.departmentId),
      ProjectManagerUserId: await this.resolvePersonUserId(input.managerPersonId),
      SponsorUserId: await this.resolvePersonUserId(input.sponsorPersonId),
      DelegateUserId: await this.resolvePersonUserId(input.delegatePersonId),
      Name: input.name,
      SpotId: input.spotId,
        Code: input.code,
      Description: input.description,
      ProblemStatement: input.problemStatement,
      StatusCode: input.status,
      MustDo: input.mustDo,
      Started: input.started,
      PriorityScore: input.priorityScore,
      StartDate: input.startDate,
      EndDate: input.endDate,
      LastCheckIn: input.lastCheckIn,
      LastUpdatedDate: input.lastUpdatedDate,
      IsActive: input.isActive,
    };
  }

  public async resolvePartialInput(input: Partial<ProjectApiInput>): Promise<Partial<ProjectInput>> {
    const result: Partial<ProjectInput> = {};
    if (input.name !== undefined) result.Name = input.name;
    if (input.LegacyDataverseId !== undefined) result.LegacyDataverseId = input.LegacyDataverseId;
    if (input.requestId !== undefined) result.RequestId = await this.resolveId('Requests', 'RequestId', input.requestId);
    if (input.siteId !== undefined) result.SiteId = await this.resolveId('Sites', 'SiteId', input.siteId);
    if (input.programId !== undefined) result.ProgramId = await this.resolveId('Programs', 'ProgramId', input.programId);
    if (input.departmentId !== undefined) result.DepartmentId = await this.resolveId('Departments', 'DepartmentId', input.departmentId);
    if (input.managerPersonId !== undefined) result.ProjectManagerUserId = await this.resolvePersonUserId(input.managerPersonId);
    if (input.sponsorPersonId !== undefined) result.SponsorUserId = await this.resolvePersonUserId(input.sponsorPersonId);
    if (input.delegatePersonId !== undefined) result.DelegateUserId = await this.resolvePersonUserId(input.delegatePersonId);
    if (input.spotId !== undefined) result.SpotId = input.spotId;
      if (input.code !== undefined) result.Code = input.code;
    if (input.description !== undefined) result.Description = input.description;
    if (input.problemStatement !== undefined) result.ProblemStatement = input.problemStatement;
    if (input.status !== undefined) result.StatusCode = input.status;
    if (input.mustDo !== undefined) result.MustDo = input.mustDo;
    if (input.started !== undefined) result.Started = input.started;
    if (input.priorityScore !== undefined) result.PriorityScore = input.priorityScore;
    if (input.startDate !== undefined) result.StartDate = input.startDate;
    if (input.endDate !== undefined) result.EndDate = input.endDate;
    if (input.lastCheckIn !== undefined) result.LastCheckIn = input.lastCheckIn;
    if (input.lastUpdatedDate !== undefined) result.LastUpdatedDate = input.lastUpdatedDate;
    if (input.isActive !== undefined) result.IsActive = input.isActive;
    return result;
  }

  public async canPersonEdit(projectIdentifier: string, personIdentifier: string): Promise<boolean> {
    const project = await this.findByIdentifier(projectIdentifier);
    const personId = await this.resolvePersonId(personIdentifier);
    if (!project || personId === null) return false;
    const rows = await this.query<{ Allowed: number }>(
      `SELECT TOP (1) 1 AS Allowed
         FROM dbo.[Projects] p
         LEFT JOIN dbo.[People] managerPerson ON managerPerson.[DirectoryUserId] = p.[ProjectManagerUserId]
         LEFT JOIN dbo.[People] sponsorPerson ON sponsorPerson.[DirectoryUserId] = p.[SponsorUserId]
         LEFT JOIN dbo.[People] delegatePerson ON delegatePerson.[DirectoryUserId] = p.[DelegateUserId]
        WHERE p.[ProjectId] = @projectId
          AND (managerPerson.[PersonId] = @personId OR sponsorPerson.[PersonId] = @personId OR delegatePerson.[PersonId] = @personId)`,
      { projectId: project.ProjectId, personId },
    );
    return rows.length > 0;
  }

  private async resolvePersonId(identifier: string): Promise<number | null> {
    const rows = await this.query<{ PersonId: number }>(
      /^\d+$/.test(identifier)
        ? 'SELECT PersonId FROM dbo.[People] WHERE PersonId = @identifier'
        : 'SELECT PersonId FROM dbo.[People] WHERE LegacyDataverseId = @identifier',
      { identifier: /^\d+$/.test(identifier) ? Number(identifier) : identifier },
    );
    return rows[0]?.PersonId ?? null;
  }

  private async resolvePersonUserId(identifier?: string): Promise<number | null> {
    if (!identifier) return null;
    const rows = await this.query<{ DirectoryUserId: number | null }>(
      /^\d+$/.test(identifier)
        ? 'SELECT DirectoryUserId FROM dbo.[People] WHERE PersonId = @identifier'
        : 'SELECT DirectoryUserId FROM dbo.[People] WHERE LegacyDataverseId = @identifier',
      { identifier: /^\d+$/.test(identifier) ? Number(identifier) : identifier },
    );
    return rows[0]?.DirectoryUserId ?? null;
  }

  private async resolveId(table: string, idColumn: string, identifier?: string): Promise<number | null> {
    if (!identifier) return null;
    const predicate = /^\d+$/.test(identifier) ? `[${idColumn}] = @identifier` : '[LegacyDataverseId] = @identifier';
    const rows = await this.query<Record<string, number>>(
      `SELECT [${idColumn}] FROM dbo.[${table}] WHERE ${predicate}`,
      { identifier: /^\d+$/.test(identifier) ? Number(identifier) : identifier },
    );
    return rows[0]?.[idColumn] ?? null;
  }

  private async listWithParentFilter(column: 'RequestId' | 'SiteId', id: number, includeInactive: boolean): Promise<ProjectView[]> {
    return this.query<ProjectView>(
      `${this.projectionSql()}
       WHERE p.[${column}] = @id AND (@includeInactive = 1 OR p.[IsActive] = 1)
       ORDER BY p.[PriorityScore] DESC, p.[Name] ASC`,
      { id, includeInactive },
    );
  }

  private projectionSql(): string {
    return `SELECT p.*,
                   COALESCE(CONVERT(varchar(36), p.[LegacyDataverseId]), CONVERT(varchar(20), p.[ProjectId])) AS ProjectApiId,
                   managerPerson.[LegacyDataverseId] AS ManagerPersonApiId,
                   managerPerson.[Name] AS ManagerName,
                   sponsorPerson.[LegacyDataverseId] AS SponsorPersonApiId,
                   sponsorPerson.[Name] AS SponsorName,
                   delegatePerson.[LegacyDataverseId] AS DelegatePersonApiId,
                   delegatePerson.[Name] AS DelegateName,
                   COALESCE(CONVERT(varchar(36), program.[LegacyDataverseId]), CONVERT(varchar(20), program.[ProgramId])) AS ProgramApiId,
                   program.[Name] AS ProgramName,
                   COALESCE(CONVERT(varchar(36), d.[LegacyDataverseId]), CONVERT(varchar(20), d.[DepartmentId])) AS DepartmentApiId,
                   d.[Name] AS DepartmentName,
                   COALESCE(CONVERT(varchar(36), requestRecord.[LegacyDataverseId]), CONVERT(varchar(20), requestRecord.[RequestId])) AS RequestApiId
              FROM dbo.[Projects] p
              LEFT JOIN dbo.[People] managerPerson ON managerPerson.[DirectoryUserId] = p.[ProjectManagerUserId]
              LEFT JOIN dbo.[People] sponsorPerson ON sponsorPerson.[DirectoryUserId] = p.[SponsorUserId]
              LEFT JOIN dbo.[People] delegatePerson ON delegatePerson.[DirectoryUserId] = p.[DelegateUserId]
              LEFT JOIN dbo.[Programs] program ON program.[ProgramId] = p.[ProgramId]
              LEFT JOIN dbo.[Departments] d ON d.[DepartmentId] = p.[DepartmentId]
              LEFT JOIN dbo.[Requests] requestRecord ON requestRecord.[RequestId] = p.[RequestId]`;
  }
}

export interface ProjectApiInput {
  LegacyDataverseId?: string | null;
  requestId?: string;
  siteId?: string;
  programId?: string;
  departmentId?: string;
  managerPersonId?: string;
  sponsorPersonId?: string;
  delegatePersonId?: string;
  name: string;
  code?: string | null;
  spotId?: string | null;
  description?: string | null;
  problemStatement?: string | null;
  status?: string | null;
  mustDo?: boolean | null;
  started?: boolean | null;
  priorityScore?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  lastCheckIn?: string | null;
  lastUpdatedDate?: Date | null;
  isActive?: boolean;
}

export const projectRepository = new ProjectRepository();
