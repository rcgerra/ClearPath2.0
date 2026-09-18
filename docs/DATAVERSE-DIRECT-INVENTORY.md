# Direct Dataverse Migration Inventory

## Scope

This report covers source files that directly call the Dataverse client/authentication APIs or directly configure the Dataverse Web API. Generated `backend/dist` files are excluded because they mirror `backend/src`. Frontend files do not call Dataverse; they call the backend API. Files that only mention Dataverse in comments or UI copy are listed separately as non-direct references.

Complexity reflects migration blast radius, not file length:

- **Low**: isolated configuration, metadata, read-only lookup, or seed behavior
- **Medium**: focused CRUD or synchronization behavior with limited authorization coupling
- **High**: shared infrastructure, authentication, authorization, cross-entity writes, or critical workload calculations

## Direct runtime inventory

| File path | Dependency type | Tables/entities used | Complexity |
|---|---|---|---|
| `backend/src/config/env.ts` | Configuration | Dataverse environment URL, tenant, client, secret, API version | High |
| `backend/src/dataverse/auth.ts` | Authentication | Dataverse Web API application identity; no business table | Medium |
| `backend/src/dataverse/client.ts` | Query, Create, Update, Delete, Lookup, Authentication | All registered tables: `_ADM`, `_Answers`, `_Capacity`, `_Categories`, `_Demand`, `_Departments`, `_feedback`, `_Functions`, `_Locations`, `_People`, `_Programs`, `_Projects`, `_Questions`, `_Requests`, `_Sites`, `_Skillsets`, and `systemuser` | High |
| `backend/src/dataverse/fields.ts` | Configuration, Lookup | Column and lookup mappings for People, Departments, Functions, Projects, Requests, Demand, Capacity, Questions, Answers, Categories, Programs, Locations, Sites, Skillsets, Users | Medium |
| `backend/src/dataverse/tables.ts` | Configuration | Registry for all linked Dataverse tables; `systemuser` is read-only | Medium |
| `backend/src/jobs/seedReferenceData.ts` | Query, Create, Lookup | Categories, Functions, Questions; Questions lookup Categories | Low |
| `backend/src/jobs/syncUsers.ts` | Query, Create, Update, Lookup | `systemuser` and People; People lookup to `systemuser` | Medium |
| `backend/src/middleware/recordAccess.ts` | Query | Projects, Departments, Demand, People, Capacity | High |
| `backend/src/routes/admin.ts` | Query, Authentication | `WhoAmI`; Capacity, Demand, Projects, Requests; triggers user synchronization | High |
| `backend/src/routes/auth.ts` | Query | `systemuser` and People | High |
| `backend/src/routes/capacity.ts` | Query, Create, Update, Delete, Lookup | Capacity, Demand, People, Departments | High |
| `backend/src/routes/demand.ts` | Query, Create, Update, Delete, Lookup | Demand, Projects, People, Functions | High |
| `backend/src/routes/departments.ts` | Query, Create, Update, Delete, Lookup | Departments, People, Capacity, Functions | Medium |
| `backend/src/routes/lookups.ts` | Query, Create, Update, Delete, Lookup | Functions, Sites, Skillsets, Programs, Locations, `_ADM`, Categories | Medium |
| `backend/src/routes/metadata.ts` | Query, Authentication, Configuration | Dataverse `EntityDefinitions`, all registered table metadata, entity-set names, primary-key attributes | Low |
| `backend/src/routes/people.ts` | Query, Create, Update, Delete, Lookup | People, Departments, Functions, Sites, Skillsets, `systemuser` | High |
| `backend/src/routes/prioritization.ts` | Query, Create, Update, Lookup | Categories, Questions, Answers, Requests; Answers lookup Questions and Requests | High |
| `backend/src/routes/projects.ts` | Query, Create, Update, Delete, Lookup | Projects, People, Programs, Departments, Requests, Demand | High |
| `backend/src/routes/requests.ts` | Query, Create, Update, Delete, Lookup | Requests, People, Departments, Categories, Projects | High |
| `backend/src/routes/users.ts` | Query | Read-only `systemuser` | Low |
| `backend/src/server.ts` | Configuration | Dataverse configuration status and startup checks; mounts all Dataverse-backed routers | High |

## Configuration and migration-adjacent files

These files do not make Dataverse API calls, but they directly control or document Dataverse behavior and must be handled during cutover.

| File path | Dependency type | Tables/entities used | Complexity |
|---|---|---|---|
| `backend/.env` | Configuration | Dataverse URL and credentials | High; rotate/remove secrets during cutover |
| `backend/.env.example` | Configuration | Dataverse environment variables | Low |
| `backend/src/jobs/importDataverseCsv.ts` | Migration input, not live Dataverse | CSV exports of People, Departments, Functions, Sites, Locations, Programs, Skillsets, Categories, Questions, Requests, Projects, Capacity, Demand, Answers | Medium; one-time data correctness risk |
| `backend/src/database/connection.ts` | Configuration/documentation only | Existing SQL mirror; comment identifies Dataverse as system of record | Low |
| `backend/src/database/database.ts` | SQL configuration only | Normalized SQL schema; no Dataverse call | Low |
| `backend/src/database/repositories/DepartmentRepository.ts` | SQL repository; legacy traceability only | Departments; `LegacyDataverseId` is retained but not queried from Dataverse | Low |
| `database/01_schema.sql` | Documentation/schema comment | Existing SQL mirror of Dataverse identifiers | Medium; must not be mistaken for the normalized target schema |
| `database/04_import_support.sql` | Migration support | `LegacyDataverseId`, import runs, import errors | Low |
| `database/05_import_validation.sql` | Migration validation | Imported normalized entities | Low |
| `database/IMPORT-STRATEGY.md` | Migration documentation | All CSV-exported entities | Low |
| `README.md` | Configuration/documentation | Dataverse environment, table registry, SQL mirror | Medium |

## Indirect or non-direct references

These files do not directly call the Dataverse client and therefore are not included in the direct runtime count:

- `backend/src/routes/nonProjectDemand.ts`: uses `recordAccess.ts`, which currently queries People/Demand through Dataverse.
- `backend/src/middleware/errorHandler.ts`: translates Dataverse-shaped HTTP errors but does not call Dataverse.
- `backend/src/demo/demoRoutes.ts`: in-memory substitute that imitates Dataverse-shaped data; it is not a live dependency.
- `frontend/src/pages/admin/AdminDashboard.tsx`: UI text mentioning Dataverse synchronization; it calls backend APIs only.
- `package.json` and `backend/package.json`: package descriptions/scripts mention Dataverse but do not access it.

## Migration priorities

1. **Low risk**: `users.ts`, `metadata.ts`, `seedReferenceData.ts`, lookup/reference repositories, `fields.ts`, and `tables.ts`.
2. **Medium risk**: `departments.ts`, `syncUsers.ts`, `dataverse/auth.ts`, `dataverse/fields.ts`, `dataverse/tables.ts`, and CSV import validation.
3. **High risk**: `dataverse/client.ts`, `config/env.ts`, `server.ts`, `auth.ts`, `recordAccess.ts`, `people.ts`, `capacity.ts`, `demand.ts`, `projects.ts`, `requests.ts`, `prioritization.ts`, and `admin.ts`.

The high-risk group should be migrated only after the normalized SQL schema, repositories, identity mapping, and authorization projections are tested. `recordAccess.ts` and `auth.ts` are the most sensitive files because a successful data migration can still produce an authorization regression if their Dataverse lookups are replaced incorrectly.
