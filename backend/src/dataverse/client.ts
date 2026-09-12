import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { env } from '../config/env';
import { getAccessToken } from './auth';
import { assertWritable, requireTable, TableDefinition } from './tables';

export interface QueryOptions {
  select?: string[];
  filter?: string;
  orderBy?: string;
  top?: number;
  expand?: string;
  /** Formatted values for choice/lookup columns. */
  includeFormattedValues?: boolean;
}

export type DataverseRecord = Record<string, unknown>;

let http: AxiosInstance | null = null;

function client(): AxiosInstance {
  if (http) return http;
  http = axios.create({
    baseURL: `${env.dataverse.url}/api/data/v${env.dataverse.apiVersion}/`,
    timeout: 30_000,
  });
  http.interceptors.request.use(async (config) => {
    const token = await getAccessToken();
    config.headers.set('Authorization', `Bearer ${token}`);
    config.headers.set('Accept', 'application/json');
    config.headers.set('OData-MaxVersion', '4.0');
    config.headers.set('OData-Version', '4.0');
    if (config.data) config.headers.set('Content-Type', 'application/json; charset=utf-8');
    return config;
  });
  return http;
}

/** Entity set (plural) names are resolved from metadata so we never guess pluralization. */
const entitySetCache = new Map<string, string>();
const primaryKeyCache = new Map<string, string>();

async function loadMetadata(logicalName: string): Promise<{ entitySetName: string; primaryIdAttribute: string }> {
  const cachedSet = entitySetCache.get(logicalName);
  const cachedKey = primaryKeyCache.get(logicalName);
  if (cachedSet && cachedKey) return { entitySetName: cachedSet, primaryIdAttribute: cachedKey };

  const { data } = await client().get(
    `EntityDefinitions(LogicalName='${logicalName}')?$select=EntitySetName,PrimaryIdAttribute,PrimaryNameAttribute`,
  );
  const entitySetName = data.EntitySetName as string;
  const primaryIdAttribute = data.PrimaryIdAttribute as string;
  entitySetCache.set(logicalName, entitySetName);
  primaryKeyCache.set(logicalName, primaryIdAttribute);
  return { entitySetName, primaryIdAttribute };
}

export async function getEntitySetName(logicalName: string): Promise<string> {
  return (await loadMetadata(logicalName)).entitySetName;
}

export async function getPrimaryIdAttribute(logicalName: string): Promise<string> {
  return (await loadMetadata(logicalName)).primaryIdAttribute;
}

function buildQuery(options: QueryOptions = {}): string {
  const params = new URLSearchParams();
  if (options.select?.length) params.set('$select', options.select.join(','));
  if (options.filter) params.set('$filter', options.filter);
  if (options.orderBy) params.set('$orderby', options.orderBy);
  if (options.expand) params.set('$expand', options.expand);
  if (options.top) params.set('$top', String(Math.min(options.top, 5000)));
  const query = params.toString();
  return query ? `?${query}` : '';
}

function requestHeaders(options: QueryOptions): AxiosRequestConfig['headers'] {
  return options.includeFormattedValues === false
    ? undefined
    : { Prefer: 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"' };
}

export async function list<T = DataverseRecord>(
  table: TableDefinition | string,
  options: QueryOptions = {},
): Promise<T[]> {
  const definition = typeof table === 'string' ? requireTable(table) : table;
  const entitySet = await getEntitySetName(definition.logicalName);
  const { data } = await client().get(`${entitySet}${buildQuery(options)}`, { headers: requestHeaders(options) });
  return (data.value ?? []) as T[];
}

export async function retrieve<T = DataverseRecord>(
  table: TableDefinition | string,
  id: string,
  options: QueryOptions = {},
): Promise<T> {
  const definition = typeof table === 'string' ? requireTable(table) : table;
  const entitySet = await getEntitySetName(definition.logicalName);
  const { data } = await client().get(`${entitySet}(${encodeGuid(id)})${buildQuery(options)}`, {
    headers: requestHeaders(options),
  });
  return data as T;
}

export async function create(table: TableDefinition | string, record: DataverseRecord): Promise<string> {
  const definition = typeof table === 'string' ? requireTable(table) : table;
  assertWritable(definition);
  const entitySet = await getEntitySetName(definition.logicalName);
  const response = await client().post(entitySet, record, { headers: { Prefer: 'return=representation' } });
  const primaryId = await getPrimaryIdAttribute(definition.logicalName);
  return (response.data?.[primaryId] as string) ?? parseIdFromEntityId(response.headers['odata-entityid']);
}

export async function update(
  table: TableDefinition | string,
  id: string,
  record: DataverseRecord,
): Promise<DataverseRecord> {
  const definition = typeof table === 'string' ? requireTable(table) : table;
  assertWritable(definition);
  const entitySet = await getEntitySetName(definition.logicalName);
  const { data } = await client().patch(`${entitySet}(${encodeGuid(id)})`, record, {
    headers: { Prefer: 'return=representation', 'If-Match': '*' },
  });
  return data as DataverseRecord;
}

export async function remove(table: TableDefinition | string, id: string): Promise<void> {
  const definition = typeof table === 'string' ? requireTable(table) : table;
  assertWritable(definition);
  const entitySet = await getEntitySetName(definition.logicalName);
  await client().delete(`${entitySet}(${encodeGuid(id)})`);
}

/** Associates a lookup column value: `{ '<nav>@odata.bind': 'entityset(guid)' }`. */
export async function lookupBind(
  navigationProperty: string,
  targetLogicalName: string,
  id: string,
): Promise<Record<string, string>> {
  const entitySet = await getEntitySetName(targetLogicalName);
  return { [`${navigationProperty}@odata.bind`]: `/${entitySet}(${encodeGuid(id)})` };
}

export function encodeGuid(id: string): string {
  const clean = id.replace(/[{}]/g, '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean)) {
    throw Object.assign(new Error('Invalid record id.'), { status: 400 });
  }
  return clean;
}

/** Escapes a value for safe use inside an OData string literal. */
export function odataString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function parseIdFromEntityId(entityId: string | undefined): string {
  const match = entityId?.match(/\(([^)]+)\)\s*$/);
  if (!match) throw new Error('Dataverse did not return a record id.');
  return match[1];
}

export async function whoAmI(): Promise<{ UserId: string; BusinessUnitId: string; OrganizationId: string }> {
  const { data } = await client().get('WhoAmI');
  return data;
}
