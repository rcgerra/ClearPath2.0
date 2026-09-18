import sql from 'mssql';
import { getDatabase, SqlParameters } from './database';

export abstract class BaseRepository<TEntity extends object> {
  protected constructor(private readonly tableName: string) {
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(tableName)) {
      throw new Error(`Invalid SQL table name: ${tableName}`);
    }
  }

  protected get table(): string {
    return `dbo.[${this.tableName}]`;
  }

  protected async query<T = TEntity>(
    statement: string,
    parameters: SqlParameters = {},
  ): Promise<T[]> {
    const request = (await getDatabase()).request();
    for (const [name, value] of Object.entries(parameters)) request.input(name, value as never);
    return (await request.query<T>(statement)).recordset;
  }

  protected async execute(
    statement: string,
    parameters: SqlParameters = {},
  ): Promise<sql.IResult<unknown>> {
    const request = (await getDatabase()).request();
    for (const [name, value] of Object.entries(parameters)) request.input(name, value as never);
    return request.query(statement);
  }

  protected async findEntityById<T = TEntity>(idColumn: string, id: number): Promise<T | null> {
    this.assertIdentifier(idColumn);
    const rows = await this.query<T>(
      `SELECT * FROM ${this.table} WHERE [${idColumn}] = @id AND [IsActive] = 1`,
      { id },
    );
    return rows[0] ?? null;
  }

  protected assertIdentifier(identifier: string): void {
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(identifier)) {
      throw new Error(`Invalid SQL identifier: ${identifier}`);
    }
  }
}