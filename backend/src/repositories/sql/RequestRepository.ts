import { BaseRepository } from '../../database/BaseRepository';
import { Request, RequestInput, RequestRepository as RequestRepositoryContract } from '../interfaces';

export interface RequestView extends Request {
  RequestApiId: string;
  RequesterPersonApiId: string | null;
  RequesterName: string | null;
  DelegatePersonApiId: string | null;
  DelegateName: string | null;
  DepartmentApiId: string | null;
  DepartmentName: string | null;
  CategoryApiId: string | null;
  CategoryName: string | null;
  ProgramApiId: string | null;
  ProgramName: string | null;
  ProjectApiId: string | null;
}

export interface RequestListFilters {
  includeInactive?: boolean;
  minePersonId?: string;
  departmentId?: string;
  status?: string;
}

export class RequestRepository extends BaseRepository<Request> implements RequestRepositoryContract {
  public constructor() {
    super('Requests');
  }

  public async list(includeInactive = false): Promise<RequestView[]> {
    return this.listFiltered({ includeInactive });
  }

  public async listFiltered(filters: RequestListFilters = {}): Promise<RequestView[]> {
    const predicates = ['(@includeInactive = 1 OR r.[IsActive] = 1)'];
    const parameters: Record<string, unknown> = { includeInactive: filters.includeInactive ?? false };
    if (filters.minePersonId) {
      predicates.push('(requester.[LegacyDataverseId] = @minePersonId OR requester.[PersonId] = TRY_CONVERT(int, @minePersonId))');
      parameters.minePersonId = filters.minePersonId;
    }
    if (filters.departmentId) {
      predicates.push('(d.[LegacyDataverseId] = @departmentId OR d.[DepartmentId] = TRY_CONVERT(int, @departmentId))');
      parameters.departmentId = filters.departmentId;
    }
    if (filters.status) {
      predicates.push('r.[Status] = @status');
      parameters.status = filters.status;
    }
    return this.query<RequestView>(
      `${this.projectionSql()} WHERE ${predicates.join(' AND ')}
       ORDER BY r.[PriorityScore] DESC, r.[SubmittedOn] DESC`,
      parameters,
    );
  }

  public async findById(requestId: number): Promise<RequestView | null> {
    const rows = await this.query<RequestView>(`${this.projectionSql()} WHERE r.[RequestId] = @requestId`, { requestId });
    return rows[0] ?? null;
  }

  public async findByIdentifier(identifier: string): Promise<RequestView | null> {
    const numeric = /^\d+$/.test(identifier);
    const rows = await this.query<RequestView>(
      `${this.projectionSql()} WHERE ${numeric ? 'r.[RequestId] = @identifier' : 'r.[LegacyDataverseId] = @identifier'}`,
      { identifier: numeric ? Number(identifier) : identifier },
    );
    return rows[0] ?? null;
  }

  public async listByProgram(programId: number, includeInactive = false): Promise<RequestView[]> {
    return this.query<RequestView>(
      `${this.projectionSql()} WHERE r.[ProgramId] = @programId AND (@includeInactive = 1 OR r.[IsActive] = 1)
       ORDER BY r.[PriorityScore] DESC, r.[SubmittedOn] DESC`,
      { programId, includeInactive },
    );
  }

  public async findByLegacyDataverseId(legacyId: string): Promise<RequestView | null> {
    return this.findByIdentifier(legacyId);
  }

  public async create(input: RequestInput): Promise<number> {
    const columns: Array<keyof RequestInput> = [
      'LegacyDataverseId', 'ProgramId', 'SponsorUserId', 'RequesterPersonId', 'DelegatePersonId',
      'DepartmentId', 'CategoryId', 'ProjectId', 'Name', 'Title', 'ShortTitle', 'SpotId', 'Phase',
      'CurrentState', 'DesiredFutureState', 'AdditionalInformation', 'Impact', 'HowDiscovered',
      'Disposition', 'Status', 'SubmittedOn', 'PriorityScore', 'ProjectType', 'WorkflowStep',
      'WhenNeeded', 'WhenNeededJustification', 'SponsorNameFlat',
    ];
    const parameters: Record<string, unknown> = {};
    const names: string[] = [];
    const values: string[] = [];
    for (const column of columns) {
      if (input[column] === undefined) continue;
      const name = String(column).replace(/^[A-Z]/, (character) => character.toLowerCase());
      names.push(`[${String(column)}]`);
      values.push(`@${name}`);
      parameters[name] = input[column];
    }
    if (!input.Name) throw new Error('Request name is required.');
    const rows = await this.query<{ RequestId: number }>(
      `INSERT INTO ${this.table} (${names.join(', ')}) OUTPUT INSERTED.[RequestId] VALUES (${values.join(', ')})`,
      parameters,
    );
    return rows[0].RequestId;
  }

  public async update(requestId: number, input: Partial<RequestInput>): Promise<boolean> {
    const fields = Object.keys(input) as Array<keyof RequestInput>;
    const parameters: Record<string, unknown> = { requestId };
    const assignments = fields.map((column) => {
      const name = String(column).replace(/^[A-Z]/, (character) => character.toLowerCase());
      parameters[name] = input[column];
      return `[${String(column)}] = @${name}`;
    });
    if (!assignments.length) return false;
    assignments.push('[ModifiedDate] = SYSUTCDATETIME()');
    const result = await this.execute(
      `UPDATE ${this.table} SET ${assignments.join(', ')} WHERE [RequestId] = @requestId AND [IsActive] = 1`,
      parameters,
    );
    return (result.rowsAffected[0] ?? 0) > 0;
  }

  public async deactivate(requestId: number): Promise<boolean> {
    const result = await this.execute(
      `UPDATE ${this.table} SET [IsActive] = 0, [ModifiedDate] = SYSUTCDATETIME() WHERE [RequestId] = @requestId AND [IsActive] = 1`,
      { requestId },
    );
    return (result.rowsAffected[0] ?? 0) > 0;
  }

  public async resolveId(table: string, idColumn: string, identifier?: string): Promise<number | null> {
    if (!identifier) return null;
    const numeric = /^\d+$/.test(identifier);
    const rows = await this.query<Record<string, number>>(
      `SELECT [${idColumn}] FROM dbo.[${table}] WHERE ${numeric ? `[${idColumn}] = @identifier` : '[LegacyDataverseId] = @identifier'}`,
      { identifier: numeric ? Number(identifier) : identifier },
    );
    return rows[0]?.[idColumn] ?? null;
  }

  public async resolvePersonId(identifier?: string): Promise<number | null> {
    return this.resolveId('People', 'PersonId', identifier);
  }

  public async resolveUserId(identifier?: string): Promise<number | null> {
    return this.resolveId('People', 'DirectoryUserId', identifier);
  }

  public async promote(requestId: number): Promise<{ request: RequestView; projectInput: Record<string, unknown> }> {
    const request = await this.findById(requestId);
    if (!request) throw new Error('Request not found.');
    return {
      request,
      projectInput: {
        RequestId: request.RequestId,
        DepartmentId: request.DepartmentId,
        Name: request.Title ?? request.Name,
        ProblemStatement: request.ProblemStatement,
        Description: request.BusinessCase,
        StatusCode: 'Planning',
        PriorityScore: request.PriorityScore ?? 0,
      },
    };
  }

  private projectionSql(): string {
    return `SELECT r.*,
                   COALESCE(CONVERT(varchar(36), r.[LegacyDataverseId]), CONVERT(varchar(20), r.[RequestId])) AS RequestApiId,
                   requester.[LegacyDataverseId] AS RequesterPersonApiId, requester.[Name] AS RequesterName,
                   delegatePerson.[LegacyDataverseId] AS DelegatePersonApiId, delegatePerson.[Name] AS DelegateName,
                   COALESCE(CONVERT(varchar(36), d.[LegacyDataverseId]), CONVERT(varchar(20), d.[DepartmentId])) AS DepartmentApiId, d.[Name] AS DepartmentName,
                   COALESCE(CONVERT(varchar(36), c.[LegacyDataverseId]), CONVERT(varchar(20), c.[CategoryId])) AS CategoryApiId, c.[Name] AS CategoryName,
                   COALESCE(CONVERT(varchar(36), program.[LegacyDataverseId]), CONVERT(varchar(20), program.[ProgramId])) AS ProgramApiId, program.[Name] AS ProgramName,
                   COALESCE(CONVERT(varchar(36), project.[LegacyDataverseId]), CONVERT(varchar(20), project.[ProjectId])) AS ProjectApiId
              FROM dbo.[Requests] r
              LEFT JOIN dbo.[People] requester ON requester.[PersonId] = r.[RequesterPersonId]
              LEFT JOIN dbo.[People] delegatePerson ON delegatePerson.[PersonId] = r.[DelegatePersonId]
              LEFT JOIN dbo.[Departments] d ON d.[DepartmentId] = r.[DepartmentId]
              LEFT JOIN dbo.[ScoringCategories] c ON c.[CategoryId] = r.[CategoryId]
              LEFT JOIN dbo.[Programs] program ON program.[ProgramId] = r.[ProgramId]
              LEFT JOIN dbo.[Projects] project ON project.[ProjectId] = r.[ProjectId]`;
  }
}

export const requestRepository = new RequestRepository();
