import sql from 'mssql';
import { env } from '../config/env';

export type SqlParameters = Record<string, unknown>;

let poolPromise: Promise<sql.ConnectionPool> | undefined;

function createPool(): Promise<sql.ConnectionPool> {
  const pool = new sql.ConnectionPool({
    server: env.sql.server,
    port: env.sql.port,
    database: env.sql.database,
    user: env.sql.user,
    password: env.sql.password,
    options: {
      encrypt: env.sql.encrypt,
      trustServerCertificate: env.sql.trustServerCertificate,
    },
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30_000,
    },
  });

  return pool.connect().catch((error) => {
    poolPromise = undefined;
    throw error;
  });
}

export async function getDatabase(): Promise<sql.ConnectionPool> {
  if (!env.sql.enabled) {
    throw Object.assign(new Error('SQL Server is disabled (set SQL_ENABLED=true).'), { status: 503 });
  }

  if (!poolPromise) poolPromise = createPool();
  return poolPromise;
}

export async function query<T = Record<string, unknown>>(
  statement: string,
  parameters: SqlParameters = {},
): Promise<T[]> {
  const request = (await getDatabase()).request();
  for (const [name, value] of Object.entries(parameters)) request.input(name, value as never);
  return (await request.query<T>(statement)).recordset;
}

export async function execute(
  statement: string,
  parameters: SqlParameters = {},
): Promise<sql.IResult<unknown>> {
  const request = (await getDatabase()).request();
  for (const [name, value] of Object.entries(parameters)) request.input(name, value as never);
  return request.query(statement);
}

export async function withTransaction<T>(work: (transaction: sql.Transaction) => Promise<T>): Promise<T> {
  const transaction = new sql.Transaction(await getDatabase());
  await transaction.begin();

  try {
    const result = await work(transaction);
    await transaction.commit();
    return result;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function closeDatabase(): Promise<void> {
  const current = poolPromise;
  poolPromise = undefined;
  if (current) await (await current).close();
}