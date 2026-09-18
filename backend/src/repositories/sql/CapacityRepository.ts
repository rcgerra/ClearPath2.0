import { BaseRepository } from '../../database/BaseRepository';
import { decodeArray, encodeArray, MAX_POSITIONS, setWeekRange, setWeekValue } from '../../utils/arrayParser';
import { Capacity, CapacityInput } from '../interfaces';

export interface CapacityView extends Capacity {
  CapacityApiId: string;
  PersonApiId: string;
  PersonName: string | null;
  DepartmentApiId: string | null;
  DepartmentName: string | null;
  AvailabilityHours: string;
  Weeks: number[];
}

export interface CapacityFilters {
  includeInactive?: boolean;
  personId?: string;
  departmentId?: string;
}

export class CapacityRepository extends BaseRepository<Capacity> {
  public constructor() {
    super('Capacity');
  }

  public async list(filters: CapacityFilters = {}): Promise<CapacityView[]> {
    const predicates = ['(@includeInactive = 1 OR c.[IsActive] = 1)'];
    const parameters: Record<string, unknown> = { includeInactive: filters.includeInactive ?? false };
    if (filters.personId) {
      predicates.push('(p.[LegacyDataverseId] = @personId OR p.[PersonId] = TRY_CONVERT(int, @personId))');
      parameters.personId = filters.personId;
    }
    if (filters.departmentId) {
      predicates.push('(d.[LegacyDataverseId] = @departmentId OR d.[DepartmentId] = TRY_CONVERT(int, @departmentId))');
      parameters.departmentId = filters.departmentId;
    }
    const rows = await this.query<CapacityRow>(
      `${this.capacitySql()} WHERE ${predicates.join(' AND ')} ORDER BY p.[Name] ASC, cw.[WeekStartDate] ASC`,
      parameters,
    );
    return this.group(rows);
  }

  public async findByIdentifier(identifier: string): Promise<CapacityView | null> {
    const numeric = /^\d+$/.test(identifier);
    const rows = await this.query<CapacityRow>(
      `${this.capacitySql()} WHERE ${numeric ? 'c.[CapacityId] = @identifier' : 'c.[LegacyDataverseId] = @identifier'}`,
      { identifier: numeric ? Number(identifier) : identifier },
    );
    return this.group(rows)[0] ?? null;
  }

  public async create(input: CapacityInput, weeks: number[]): Promise<number> {
    const rows = await this.query<{ CapacityId: number }>(
      `INSERT INTO ${this.table} ([LegacyDataverseId], [PersonId], [WeeklyBaseline], [Notes])
       OUTPUT INSERTED.[CapacityId]
       VALUES (@legacyDataverseId, @personId, @weeklyBaseline, @notes)`,
      {
        legacyDataverseId: input.LegacyDataverseId ?? null,
        personId: input.PersonId,
        weeklyBaseline: input.WeeklyBaseline ?? null,
        notes: input.Notes ?? null,
      },
    );
    await this.replaceWeeks(rows[0].CapacityId, weeks);
    return rows[0].CapacityId;
  }

  public async resolvePersonId(identifier: string): Promise<number | null> {
    return this.resolveId('People', 'PersonId', identifier);
  }

  public async resolveDepartmentId(identifier?: string): Promise<number | null> {
    return identifier ? this.resolveId('Departments', 'DepartmentId', identifier) : null;
  }

  public async update(capacityId: number, input: Partial<CapacityInput>, weeks?: number[]): Promise<boolean> {
    const assignments: string[] = [];
    const parameters: Record<string, unknown> = { capacityId };
    const fields: Array<[keyof CapacityInput, string]> = [
      ['LegacyDataverseId', 'LegacyDataverseId'], ['PersonId', 'PersonId'],
      ['WeeklyBaseline', 'WeeklyBaseline'], ['Notes', 'Notes'],
    ];
    for (const [key, column] of fields) {
      if (input[key] !== undefined) {
        const parameter = String(key).replace(/^[A-Z]/, (character) => character.toLowerCase());
        assignments.push(`[${column}] = @${parameter}`);
        parameters[parameter] = input[key];
      }
    }
    if (weeks) await this.replaceWeeks(capacityId, weeks);
    if (!assignments.length) return Boolean(weeks);
    assignments.push('[ModifiedDate] = SYSUTCDATETIME()');
    const result = await this.execute(
      `UPDATE ${this.table} SET ${assignments.join(', ')} WHERE [CapacityId] = @capacityId AND [IsActive] = 1`,
      parameters,
    );
    return (result.rowsAffected[0] ?? 0) > 0 || Boolean(weeks);
  }

  public async setWeek(capacityId: number, week: number, hours: number): Promise<CapacityView | null> {
    const current = await this.findByIdentifier(String(capacityId));
    if (!current) return null;
    const values = setWeekValue(current.AvailabilityHours, week, hours);
    await this.replaceWeeks(capacityId, decodeArray(values));
    return this.findByIdentifier(String(capacityId));
  }

  public async setRange(capacityId: number, startWeek: number, endWeek: number, hours: number): Promise<CapacityView | null> {
    const current = await this.findByIdentifier(String(capacityId));
    if (!current) return null;
    const values = setWeekRange(current.AvailabilityHours, startWeek, endWeek, hours);
    await this.replaceWeeks(capacityId, decodeArray(values));
    return this.findByIdentifier(String(capacityId));
  }

  public async deactivate(capacityId: number): Promise<boolean> {
    const result = await this.execute(
      `UPDATE ${this.table} SET [IsActive] = 0, [ModifiedDate] = SYSUTCDATETIME() WHERE [CapacityId] = @capacityId AND [IsActive] = 1`,
      { capacityId },
    );
    return (result.rowsAffected[0] ?? 0) > 0;
  }

  public async owner(identifier: string): Promise<{ personId?: string; departmentId?: string }> {
    const capacity = await this.findByIdentifier(identifier);
    if (!capacity) return {};
    return { personId: capacity.PersonApiId, departmentId: capacity.DepartmentApiId ?? undefined };
  }

  public async net(personIdentifier: string): Promise<{ personId: string; availability: number[]; demand: number[]; net: number[]; overAllocatedWeeks: Array<{ week: number; over: number }> }> {
    const person = /^\d+$/.test(personIdentifier) ? Number(personIdentifier) : personIdentifier;
    const capacityRows = await this.query<{ Hours: number }>(
      `SELECT cw.[Hours] FROM dbo.[CapacityWeeks] cw JOIN dbo.[Capacity] c ON c.[CapacityId] = cw.[CapacityId]
       JOIN dbo.[People] p ON p.[PersonId] = c.[PersonId]
       WHERE c.[IsActive] = 1 AND (p.[PersonId] = TRY_CONVERT(int, @person) OR p.[LegacyDataverseId] = @person)`,
      { person },
    );
    const demandRows = await this.query<{ Hours: number }>(
      `SELECT dw.[Hours] FROM dbo.[DemandWeeks] dw JOIN dbo.[DemandAllocations] da ON da.[DemandAllocationId] = dw.[DemandAllocationId]
       JOIN dbo.[People] p ON p.[PersonId] = da.[PersonId]
       WHERE da.[IsActive] = 1 AND (p.[PersonId] = TRY_CONVERT(int, @person) OR p.[LegacyDataverseId] = @person)`,
      { person },
    );
    const availability = this.aggregateHours(capacityRows.map((row) => row.Hours));
    const demand = this.aggregateHours(demandRows.map((row) => row.Hours));
    return {
      personId: personIdentifier,
      availability,
      demand,
      net: availability.map((value, index) => value - demand[index]),
      overAllocatedWeeks: availability.map((value, index) => ({ week: index, over: demand[index] - value })).filter((entry) => entry.over > 0),
    };
  }

  private async replaceWeeks(capacityId: number, weeks: number[]): Promise<void> {
    await this.execute('DELETE FROM dbo.[CapacityWeeks] WHERE [CapacityId] = @capacityId', { capacityId });
    const start = new Date(process.env.IMPORT_WEEK_START ?? '2026-01-05T00:00:00Z');
    for (let index = 0; index < Math.min(weeks.length, MAX_POSITIONS); index += 1) {
      const week = new Date(start);
      week.setUTCDate(week.getUTCDate() + index * 7);
      await this.execute(
        'INSERT dbo.[CapacityWeeks] (CapacityId, WeekStartDate, Hours) VALUES (@capacityId, @weekStartDate, @hours)',
        { capacityId, weekStartDate: week.toISOString().slice(0, 10), hours: weeks[index] ?? 0 },
      );
    }
  }

  private async resolveId(table: string, idColumn: string, identifier: string): Promise<number | null> {
    const numeric = /^\d+$/.test(identifier);
    const rows = await this.query<Record<string, number>>(
      `SELECT [${idColumn}] FROM dbo.[${table}] WHERE ${numeric ? `[${idColumn}] = @identifier` : '[LegacyDataverseId] = @identifier'}`,
      { identifier: numeric ? Number(identifier) : identifier },
    );
    return rows[0]?.[idColumn] ?? null;
  }

  private group(rows: CapacityRow[]): CapacityView[] {
    const grouped = new Map<number, { row: CapacityRow; weeks: number[] }>();
    for (const row of rows) {
      const current = grouped.get(row.CapacityId) ?? { row, weeks: [] };
      if (row.WeekStartDate && row.Hours !== null) current.weeks.push(row.Hours);
      grouped.set(row.CapacityId, current);
    }
    return [...grouped.values()].map(({ row, weeks }) => ({
      ...row,
      CapacityApiId: row.CapacityApiId ?? String(row.CapacityId),
      PersonApiId: row.PersonApiId ?? String(row.PersonId),
      DepartmentApiId: row.DepartmentApiId,
      AvailabilityHours: encodeArray(weeks, MAX_POSITIONS),
      Weeks: decodeArray(encodeArray(weeks, MAX_POSITIONS)),
    }));
  }

  private aggregateHours(hours: number[]): number[] {
    const values = new Array(MAX_POSITIONS).fill(0);
    hours.forEach((value, index) => { if (index < MAX_POSITIONS) values[index] += value ?? 0; });
    return values;
  }

  private capacitySql(): string {
    return `SELECT c.*, COALESCE(CONVERT(varchar(36), c.[LegacyDataverseId]), CONVERT(varchar(20), c.[CapacityId])) AS CapacityApiId,
                   COALESCE(CONVERT(varchar(36), p.[LegacyDataverseId]), CONVERT(varchar(20), p.[PersonId])) AS PersonApiId,
                   p.[Name] AS PersonName, COALESCE(CONVERT(varchar(36), d.[LegacyDataverseId]), CONVERT(varchar(20), d.[DepartmentId])) AS DepartmentApiId,
                   d.[Name] AS DepartmentName, cw.[WeekStartDate], cw.[Hours]
              FROM dbo.[Capacity] c JOIN dbo.[People] p ON p.[PersonId] = c.[PersonId]
              LEFT JOIN dbo.[Departments] d ON d.[DepartmentId] = p.[DepartmentId]
              LEFT JOIN dbo.[CapacityWeeks] cw ON cw.[CapacityId] = c.[CapacityId] AND cw.[IsActive] = 1`;
  }
}

interface CapacityRow extends Capacity {
  CapacityApiId: string | null;
  PersonApiId: string | null;
  PersonName: string | null;
  DepartmentApiId: string | null;
  DepartmentName: string | null;
  WeekStartDate: Date | null;
  Hours: number | null;
  AvailabilityHours: string;
  Weeks: number[];
}

export const capacityRepository = new CapacityRepository();
