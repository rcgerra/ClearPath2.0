import { BaseRepository } from '../../database/BaseRepository';
import { decodeArray, encodeArray, MAX_POSITIONS, setWeekRange } from '../../utils/arrayParser';
import { DemandAllocation, DemandAllocationInput } from '../interfaces';

export interface DemandView extends DemandAllocation {
  DemandApiId: string;
  ProjectApiId: string;
  ProjectName: string | null;
  PersonApiId: string | null;
  PersonName: string | null;
  FunctionApiId: string | null;
  FunctionName: string | null;
  DemandHours: string;
  Weeks: number[];
  PastWeeks: number[];
  StartWeek: number | null;
  EndWeek: number | null;
}

const WEEK_MS = 7 * 86_400_000;

function currentWeekStart(): Date {
  const monday = new Date();
  monday.setUTCHours(0, 0, 0, 0);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  return monday;
}

function weekStartForOffset(offset: number): string {
  const monday = currentWeekStart();
  monday.setUTCDate(monday.getUTCDate() + offset * 7);
  return monday.toISOString().slice(0, 10);
}

function weekOffsetForDate(dateValue: Date): number {
  const date = new Date(dateValue);
  date.setUTCHours(0, 0, 0, 0);
  return Math.round((date.getTime() - currentWeekStart().getTime()) / WEEK_MS);
}

export interface DemandFilters {
  includeInactive?: boolean;
  projectId?: string;
  personId?: string;
}

export class DemandRepository extends BaseRepository<DemandAllocation> {
  public constructor() {
    super('DemandAllocations');
  }

  public async list(filters: DemandFilters = {}): Promise<DemandView[]> {
    const predicates = ['(@includeInactive = 1 OR da.[IsActive] = 1)'];
    const parameters: Record<string, unknown> = { includeInactive: filters.includeInactive ?? false };
    if (filters.projectId) { predicates.push('(p.[LegacyDataverseId] = @projectId OR p.[ProjectId] = TRY_CONVERT(int, @projectId))'); parameters.projectId = filters.projectId; }
    if (filters.personId) { predicates.push('(person.[LegacyDataverseId] = @personId OR person.[PersonId] = TRY_CONVERT(int, @personId))'); parameters.personId = filters.personId; }
    const rows = await this.query<DemandRow>(`${this.demandSql()} WHERE ${predicates.join(' AND ')} ORDER BY da.[Name] ASC, dw.[WeekStartDate] ASC`, parameters);
    return this.group(rows);
  }

  public async findByIdentifier(identifier: string): Promise<DemandView | null> {
    const numeric = /^\d+$/.test(identifier);
    const rows = await this.query<DemandRow>(`${this.demandSql()} WHERE ${numeric ? 'da.[DemandAllocationId] = @identifier' : 'da.[LegacyDataverseId] = @identifier'}`, { identifier: numeric ? Number(identifier) : identifier });
    return this.group(rows)[0] ?? null;
  }

  public async findByProjectAndPerson(projectIdentifier: string, personIdentifier: string): Promise<DemandView | null> {
    const rows = await this.list({ projectId: projectIdentifier, personId: personIdentifier });
    return rows[0] ?? null;
  }

  public async resolveId(table: string, idColumn: string, identifier?: string): Promise<number | null> {
    if (!identifier) return null;
    const numeric = /^\d+$/.test(identifier);
    const rows = await this.query<Record<string, number>>(`SELECT [${idColumn}] FROM dbo.[${table}] WHERE ${numeric ? `[${idColumn}] = @identifier` : '[LegacyDataverseId] = @identifier'}`, { identifier: numeric ? Number(identifier) : identifier });
    return rows[0]?.[idColumn] ?? null;
  }

  public async create(input: DemandAllocationInput, weeks: number[], startWeek?: number, endWeek?: number): Promise<number> {
    const rows = await this.query<{ DemandAllocationId: number }>(
      `INSERT ${this.table} ([LegacyDataverseId], [ProjectId], [PersonId], [FunctionId], [Name], [StatusCode])
       OUTPUT INSERTED.[DemandAllocationId]
       VALUES (@legacyDataverseId, @projectId, @personId, @functionId, @name, @statusCode)`,
      { legacyDataverseId: input.LegacyDataverseId ?? null, projectId: input.ProjectId, personId: input.PersonId ?? null, functionId: input.FunctionId ?? null, name: input.Name ?? null, statusCode: input.StatusCode ?? 'Planned' },
    );
    await this.replaceWeeks(rows[0].DemandAllocationId, weeks);
    return rows[0].DemandAllocationId;
  }

  public async update(demandId: number, input: Partial<DemandAllocationInput>, weeks?: number[], startWeek?: number, endWeek?: number): Promise<boolean> {
    const assignments: string[] = [];
    const parameters: Record<string, unknown> = { demandId };
    const fields: Array<[keyof DemandAllocationInput, string]> = [['LegacyDataverseId', 'LegacyDataverseId'], ['ProjectId', 'ProjectId'], ['PersonId', 'PersonId'], ['FunctionId', 'FunctionId'], ['Name', 'Name'], ['StatusCode', 'StatusCode']];
    for (const [key, column] of fields) if (input[key] !== undefined) { const parameter = String(key).replace(/^[A-Z]/, (c) => c.toLowerCase()); assignments.push(`[${column}] = @${parameter}`); parameters[parameter] = input[key]; }
    if (weeks) await this.replaceWeeks(demandId, weeks, startWeek, endWeek);
    if (!assignments.length) return Boolean(weeks);
    assignments.push('[ModifiedDate] = SYSUTCDATETIME()');
    const result = await this.execute(`UPDATE ${this.table} SET ${assignments.join(', ')} WHERE [DemandAllocationId] = @demandId AND [IsActive] = 1`, parameters);
    return (result.rowsAffected[0] ?? 0) > 0 || Boolean(weeks);
  }

  public async setWeek(demandId: number, week: number, hours: number): Promise<DemandView | null> {
    const weekStart = weekStartForOffset(week);
    const existing = await this.query<{ DemandWeekId: number }>(
      'SELECT [DemandWeekId] FROM dbo.[DemandWeeks] WHERE [DemandAllocationId] = @demandId AND [WeekStartDate] = @weekStart',
      { demandId, weekStart },
    );
    if (existing[0]) {
      await this.execute('UPDATE dbo.[DemandWeeks] SET [Hours] = @hours, [IsActive] = 1 WHERE [DemandWeekId] = @id', {
        id: existing[0].DemandWeekId,
        hours,
      });
    } else {
      await this.execute(
        'INSERT dbo.[DemandWeeks] ([DemandAllocationId], [WeekStartDate], [Hours]) VALUES (@demandId, @weekStart, @hours)',
        { demandId, weekStart, hours },
      );
    }
    return this.findByIdentifier(String(demandId));
  }

  public async setRange(demandId: number, startWeek: number, endWeek: number, hours: number): Promise<DemandView | null> {
    const current = await this.findByIdentifier(String(demandId));
    if (!current) return null;
    await this.replaceWeeks(demandId, decodeArray(setWeekRange(current.DemandHours, startWeek, endWeek, hours)));
    return this.findByIdentifier(String(demandId));
  }

  public async deactivate(demandId: number): Promise<boolean> {
    const result = await this.execute(`UPDATE ${this.table} SET [IsActive] = 0, [ModifiedDate] = SYSUTCDATETIME() WHERE [DemandAllocationId] = @demandId AND [IsActive] = 1`, { demandId });
    return (result.rowsAffected[0] ?? 0) > 0;
  }

  private async replaceWeeks(demandId: number, weeks: number[], startWeek?: number, endWeek?: number): Promise<void> {
    const current = await this.query<{ WeekStartDate: Date; Hours: number }>('SELECT WeekStartDate, Hours FROM dbo.[DemandWeeks] WHERE DemandAllocationId = @demandId ORDER BY WeekStartDate', { demandId });
    const values = current.length ? current.map((row) => row.Hours) : [];
    if (startWeek !== undefined && endWeek !== undefined) for (let i = startWeek; i <= endWeek; i += 1) values[i] = weeks[i] ?? values[i] ?? 0;
    else for (let i = 0; i < weeks.length; i += 1) values[i] = weeks[i];
    await this.execute('DELETE FROM dbo.[DemandWeeks] WHERE DemandAllocationId = @demandId', { demandId });
    const start = new Date(process.env.IMPORT_WEEK_START ?? '2026-01-05T00:00:00Z');
    for (let i = 0; i < Math.min(values.length, MAX_POSITIONS); i += 1) { const week = new Date(start); week.setUTCDate(week.getUTCDate() + i * 7); await this.execute('INSERT dbo.[DemandWeeks] (DemandAllocationId, WeekStartDate, Hours) VALUES (@demandId, @week, @hours)', { demandId, week: week.toISOString().slice(0, 10), hours: values[i] ?? 0 }); }
  }

  private group(rows: DemandRow[]): DemandView[] {
    const grouped = new Map<number, { row: DemandRow; weeks: number[]; pastWeeks: number[] }>();
    for (const row of rows) {
      const current = grouped.get(row.DemandAllocationId) ?? {
        row,
        weeks: new Array(MAX_POSITIONS).fill(0),
        pastWeeks: new Array(MAX_POSITIONS).fill(0),
      };
      if (row.WeekStartDate && row.Hours !== null) {
        const offset = weekOffsetForDate(row.WeekStartDate);
        if (offset >= 0 && offset < MAX_POSITIONS) current.weeks[offset] = row.Hours;
        else if (offset < 0 && -offset <= MAX_POSITIONS) current.pastWeeks[-offset - 1] = row.Hours;
      }
      grouped.set(row.DemandAllocationId, current);
    }
    return [...grouped.values()].map(({ row, weeks, pastWeeks }) => ({
      ...row,
      DemandApiId: row.DemandApiId ?? String(row.DemandAllocationId),
      ProjectApiId: row.ProjectApiId,
      ProjectName: row.ProjectName,
      PersonApiId: row.PersonApiId,
      PersonName: row.PersonName,
      FunctionApiId: row.FunctionApiId,
      FunctionName: row.FunctionName,
      DemandHours: encodeArray(weeks, MAX_POSITIONS),
      Weeks: weeks,
      PastWeeks: pastWeeks,
    }));
  }

  private demandSql(): string { return `SELECT da.*, COALESCE(CONVERT(varchar(36), da.[LegacyDataverseId]), CONVERT(varchar(20), da.[DemandAllocationId])) AS DemandApiId, COALESCE(CONVERT(varchar(36), p.[LegacyDataverseId]), CONVERT(varchar(20), p.[ProjectId])) AS ProjectApiId, p.[Name] AS ProjectName, person.[LegacyDataverseId] AS PersonApiId, person.[Name] AS PersonName, f.[LegacyDataverseId] AS FunctionApiId, f.[Name] AS FunctionName, dw.[WeekStartDate], dw.[Hours], NULL AS StartWeek, NULL AS EndWeek FROM dbo.[DemandAllocations] da JOIN dbo.[Projects] p ON p.[ProjectId] = da.[ProjectId] LEFT JOIN dbo.[People] person ON person.[PersonId] = da.[PersonId] LEFT JOIN dbo.[Functions] f ON f.[FunctionId] = da.[FunctionId] LEFT JOIN dbo.[DemandWeeks] dw ON dw.[DemandAllocationId] = da.[DemandAllocationId] AND dw.[IsActive] = 1`; }
}

interface DemandRow extends DemandAllocation { DemandApiId: string | null; ProjectApiId: string; ProjectName: string | null; PersonApiId: string | null; PersonName: string | null; FunctionApiId: string | null; FunctionName: string | null; WeekStartDate: Date | null; Hours: number | null; StartWeek: number | null; EndWeek: number | null; DemandHours: string; Weeks: number[]; }

export const demandRepository = new DemandRepository();
