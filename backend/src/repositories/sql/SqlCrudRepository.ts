import { BaseRepository } from '../../database/BaseRepository';
import { ListRepository, Repository } from '../interfaces/common';

export interface SqlColumn<TInput extends object> {
  input: keyof TInput;
  column: string;
}

export abstract class SqlCrudRepository<TEntity extends object, TInput extends object>
  extends BaseRepository<TEntity>
  implements Repository<TEntity, TInput, Partial<TInput>, number, number>, ListRepository<TEntity, boolean>
{
  protected constructor(
    tableName: string,
    private readonly idColumn: string,
    private readonly columns: readonly SqlColumn<TInput>[],
  ) {
    super(tableName);
    this.assertIdentifier(idColumn);
    for (const column of columns) this.assertIdentifier(column.column);
  }

  public async list(includeInactive = false): Promise<TEntity[]> {
    return this.query<TEntity>(
      `SELECT * FROM ${this.table}
       WHERE @includeInactive = 1 OR [IsActive] = 1
       ORDER BY [${this.idColumn}] ASC`,
      { includeInactive },
    );
  }

  public async findById(id: number): Promise<TEntity | null> {
    return this.findEntityById<TEntity>(this.idColumn, id);
  }

  public async findByIdentifier(identifier: string): Promise<TEntity | null> {
    if (/^\d+$/.test(identifier)) return this.findById(Number(identifier));
    const rows = await this.query<TEntity>(
      `SELECT * FROM ${this.table} WHERE [LegacyDataverseId] = @legacyDataverseId`,
      { legacyDataverseId: identifier },
    );
    return rows[0] ?? null;
  }

  public async create(input: TInput): Promise<number> {
    const values = this.columns.map((column) => {
      if (input[column.input] === undefined) throw new Error(`Missing required field '${String(column.input)}'.`);
      return column;
    });
    const parameters = values.map((column) => this.parameterName(column.input));
    const rows = await this.query<Record<string, number>>(
      `INSERT INTO ${this.table} (${values.map((column) => `[${column.column}]`).join(', ')})
       OUTPUT INSERTED.[${this.idColumn}]
       VALUES (${parameters.map((parameter) => `@${parameter}`).join(', ')})`,
      Object.fromEntries(values.map((column, index) => [parameters[index], input[column.input]])),
    );
    return rows[0][this.idColumn];
  }

  public async update(id: number, input: Partial<TInput>): Promise<boolean> {
    const changed = this.columns.filter((column) => input[column.input] !== undefined);
    if (changed.length === 0) return false;

    const parameters: Record<string, unknown> = { id };
    const assignments = changed.map((column) => {
      const parameter = this.parameterName(column.input);
      parameters[parameter] = input[column.input];
      return `[${column.column}] = @${parameter}`;
    });
    assignments.push('[ModifiedDate] = SYSUTCDATETIME()');

    const result = await this.execute(
      `UPDATE ${this.table}
       SET ${assignments.join(', ')}
       WHERE [${this.idColumn}] = @id AND [IsActive] = 1`,
      parameters,
    );
    return (result.rowsAffected[0] ?? 0) > 0;
  }

  public async deactivate(id: number): Promise<boolean> {
    const result = await this.execute(
      `UPDATE ${this.table}
       SET [IsActive] = 0, [ModifiedDate] = SYSUTCDATETIME()
       WHERE [${this.idColumn}] = @id AND [IsActive] = 1`,
      { id },
    );
    return (result.rowsAffected[0] ?? 0) > 0;
  }

  private parameterName(input: keyof TInput): string {
    return String(input).replace(/^[A-Z]/, (character) => character.toLowerCase());
  }
}
