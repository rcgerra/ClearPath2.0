import sql from 'mssql';
import { env } from '../config/env';

/**
 * Optional SQL Server mirror used for the star-schema reporting model.
 * Dataverse remains the system of record; this pool is only created when SQL_ENABLED=true.
 */
let pool: sql.ConnectionPool | null = null;

export async function getPool(): Promise<sql.ConnectionPool> {
  if (!env.sql.enabled) {
    throw Object.assign(new Error('SQL Server mirror is disabled (set SQL_ENABLED=true).'), { status: 503 });
  }
  if (pool?.connected) return pool;
  pool = await new sql.ConnectionPool({
    server: env.sql.server,
    port: env.sql.port,
    database: env.sql.database,
    user: env.sql.user,
    password: env.sql.password,
    options: {
      encrypt: env.sql.encrypt,
      trustServerCertificate: env.sql.trustServerCertificate,
    },
    pool: { max: 10, min: 0, idleTimeoutMillis: 30_000 },
  }).connect();
  return pool;
}

/** Parameters are bound by mssql, so values are never concatenated into the statement. */
export async function query<T = Record<string, unknown>>(
  statement: string,
  params: Record<string, unknown> = {},
): Promise<T[]> {
  const request = (await getPool()).request();
  for (const [name, value] of Object.entries(params)) request.input(name, value);
  const result = await request.query<T>(statement);
  return result.recordset;
}

export async function closePool(): Promise<void> {
  await pool?.close();
  pool = null;
}
