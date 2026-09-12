import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const bool = (value: string | undefined, fallback: boolean) =>
  value === undefined ? fallback : /^(1|true|yes)$/i.test(value);

const int = (value: string | undefined, fallback: number) => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const list = (value: string | undefined) =>
  (value ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: int(process.env.PORT, 3001),
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',

  jwtSecret: process.env.JWT_SECRET ?? 'change-me-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '8h',
  /** 'dev' allows directory-only sign-in; 'entra' requires an Entra ID access token. */
  authMode: (process.env.AUTH_MODE ?? 'dev') as 'dev' | 'entra',
  /** Serves in-memory sample data instead of Dataverse so the UI can be reviewed without credentials. */
  demoMode: bool(process.env.DEMO_MODE, false),
  /** Identity used locally when no reverse-proxy identity header is present. */
  devUserEmail: (process.env.DEV_USER_EMAIL ?? '').toLowerCase(),
  /** Always granted the admin role, regardless of their _People record. */
  adminEmails: list(process.env.ADMIN_EMAILS),

  dataverse: {
    url: (process.env.DATAVERSE_URL ?? '').replace(/\/+$/, ''),
    tenantId: process.env.DATAVERSE_TENANT_ID ?? '',
    clientId: process.env.DATAVERSE_CLIENT_ID ?? '',
    clientSecret: process.env.DATAVERSE_CLIENT_SECRET ?? '',
    apiVersion: process.env.DATAVERSE_API_VERSION ?? '9.2',
  },

  sql: {
    enabled: bool(process.env.SQL_ENABLED, false),
    server: process.env.SQL_SERVER ?? 'localhost',
    port: int(process.env.SQL_PORT, 1433),
    database: process.env.SQL_DATABASE ?? 'ClearPath',
    user: process.env.SQL_USER ?? '',
    password: process.env.SQL_PASSWORD ?? '',
    encrypt: bool(process.env.SQL_ENCRYPT, true),
    trustServerCertificate: bool(process.env.SQL_TRUST_SERVER_CERTIFICATE, true),
  },

  planning: {
    arrayPositions: int(process.env.PLANNING_ARRAY_POSITIONS, 1333),
  },
};

export const isDataverseConfigured = () =>
  Boolean(env.dataverse.url && env.dataverse.tenantId && env.dataverse.clientId && env.dataverse.clientSecret);

export function assertProductionSecrets(): void {
  if (env.nodeEnv !== 'production') return;
  if (env.demoMode) {
    throw new Error('DEMO_MODE cannot be enabled in production.');
  }
  if (env.jwtSecret === 'change-me-in-production' || env.jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be set to a strong value (>=32 chars) in production.');
  }
  if (!isDataverseConfigured()) {
    throw new Error('Dataverse connection settings are required in production.');
  }
  if (env.authMode !== 'entra') {
    throw new Error('AUTH_MODE must be "entra" in production; directory-only sign-in is for local development.');
  }
}
