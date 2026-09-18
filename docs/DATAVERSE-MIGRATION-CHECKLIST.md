# Dataverse Migration Checklist

This inventory covers backend runtime files that call Dataverse, files that configure or expose Dataverse, and migration-only utilities. The frontend calls the backend API and has no direct Dataverse dependency.

## Replacement repositories

Recommended repository names below refer to the normalized SQL schema:

- `DirectoryUserRepository`: `DirectoryUsers`, temporary replacement for Dataverse `systemuser`
- `PersonRepository`: `People`
- `DepartmentRepository`: `Departments`
- `FunctionRepository`: `Functions`
- `SiteRepository`: `Sites`
- `LocationRepository`: `Locations`
- `ProgramRepository`: `Programs`
- `SkillsetRepository`: `Skillsets`
- `ProjectRepository`: `Projects`
- `RequestRepository`: `Requests`
- `DemandRepository`: `DemandAllocations` and `DemandWeeks`
- `CapacityRepository`: `Capacity` and `CapacityWeeks`
- `PrioritizationRepository`: `ScoringCategories`, `ScoringQuestions`, `QuestionOptions`, and `ScoringAnswers`
- `AuthorizationRepository`: focused joins/projections for ownership checks; do not make middleware assemble authorization through several HTTP-style repository calls

## File checklist

| File path | Entity used | Dataverse dependency | Replacement repository/action |
|---|---|---|---|
| `backend/src/dataverse/auth.ts` | Dataverse OAuth application user | Gets client-credentials token from Entra ID for Dataverse Web API | Delete after the final Dataverse route is removed. SQL repositories use the application database credentials/pool. |
| `backend/src/dataverse/client.ts` | All registered Dataverse tables | Axios/OData client: list, retrieve, create, update, delete, lookup binding, metadata identity | Delete after all callers migrate. |
| `backend/src/dataverse/fields.ts` | People, Departments, Functions, Projects, Requests, Demand, Capacity, Questions, Answers, Categories, Programs, Locations, Sites, Skillsets, Users | Logical Dataverse column names, lookup bindings, formatted-value annotations | Replace with repository row mappings and SQL column constants. |
| `backend/src/dataverse/tables.ts` | All registered tables, including `systemuser` | Entity-set registry, writable/read-only rules, Dataverse metadata identity | Delete after metadata and generic table routes are removed. |
| `backend/src/config/env.ts` | Dataverse environment and credentials | Reads `DATAVERSE_*`, validates Dataverse production configuration, reports configuration | Remove `dataverse`, `isDataverseConfigured`, and related production checks after cutover. Keep SQL configuration. |
| `backend/src/server.ts` | All API routers; health endpoint | Mount comments, Dataverse health flag, startup warning, demo-mode routing | Remove Dataverse health/configuration output and warning. Mount SQL-backed routers. Keep demo mode only if still needed. |
| `backend/src/middleware/errorHandler.ts` | Cross-cutting API errors | Translates Dataverse HTTP/OData failures into API errors | Replace with SQL error classification, especially connection, timeout, constraint, and deadlock errors. |
| `backend/src/middleware/recordAccess.ts` | Projects, Departments, Demand, People, Capacity | Retrieves Dataverse records to enforce owner/lead/delegate authorization | `AuthorizationRepository`, backed by SQL joins across Projects, Departments, People, DemandAllocations, and Capacity. High-risk because authorization must remain equivalent. |
| `backend/src/routes/auth.ts` | `systemuser` and People | Looks up the signed-in user in Dataverse, then resolves the People record and roles | `DirectoryUserRepository` plus `PersonRepository`. Do not use Active Directory import; use the migrated DirectoryUsers rows. |
| `backend/src/routes/users.ts` | `systemuser` | Read-only user search and user projection | `DirectoryUserRepository`. |
| `backend/src/routes/people.ts` | People, Departments, Functions, Sites, Skillsets, Users | CRUD, OData filtering, lookup binding, formatted lookup values | `PersonRepository` with joins or explicit lookup repositories. |
| `backend/src/routes/departments.ts` | Departments, People, Capacity | Department CRUD, roster lookup, capacity lookup, lookup binding | `DepartmentRepository`, `PersonRepository`, and `CapacityRepository`. An example `DepartmentRepository` already exists. |
| `backend/src/routes/projects.ts` | Projects, People, Programs, Departments, Requests | Project CRUD, filters, owner/delegate lookup binding, formatted values | `ProjectRepository` plus `PersonRepository`, `ProgramRepository`, `DepartmentRepository`, and `RequestRepository`. |
| `backend/src/routes/requests.ts` | Requests, People, Departments, Categories, Projects | Request CRUD, workflow filters, requester/delegate/category/project lookups | `RequestRepository` plus `PersonRepository`, `DepartmentRepository`, `PrioritizationRepository`, and `ProjectRepository`. |
| `backend/src/routes/demand.ts` | Demand, Projects, People, Functions | Demand CRUD, project/person/function relationships, weekly encoded arrays | `DemandRepository`, using `DemandAllocations` and `DemandWeeks`. Preserve permission checks through `AuthorizationRepository`. |
| `backend/src/routes/capacity.ts` | Capacity, Demand, People, Departments | Availability CRUD, weekly arrays, person/department filtering, demand rollups | `CapacityRepository` and `DemandRepository`, using `CapacityWeeks` and `DemandWeeks`. |
| `backend/src/routes/nonProjectDemand.ts` | People indirectly; SQL non-project demand tables directly | No direct Dataverse import, but department/person authorization calls `recordAccess.ts`, which currently retrieves People from Dataverse | Migrate authorization calls to `AuthorizationRepository` before switching this route fully to SQL. |
| `backend/src/routes/prioritization.ts` | Categories, Questions, Answers, Requests | Scoring configuration, request answers, score calculation | `PrioritizationRepository`, with separate methods for categories/questions/options/answers. |
| `backend/src/routes/lookups.ts` | Functions, Categories, Programs, Sites, Locations, Skillsets | Generic Dataverse lookup table reads and writable-table checks | Explicit lookup repositories or a constrained `ReferenceDataRepository`; do not recreate arbitrary table access. |
| `backend/src/routes/metadata.ts` | All registered Dataverse tables | Calls Dataverse EntityDefinitions and entity-set/primary-key metadata endpoints | Remove after migration. Replace, only if needed, with a static SQL schema metadata endpoint. |
| `backend/src/routes/admin.ts` | Users, Capacity, Demand, Projects, Requests | Dataverse `whoAmI`, user sync trigger, portfolio-wide Dataverse aggregations | `DirectoryUserRepository`, `CapacityRepository`, `DemandRepository`, `ProjectRepository`, and `RequestRepository`. Replace `whoAmI` with application/session identity. |
| `backend/src/jobs/syncUsers.ts` | `systemuser` and People | Synchronizes Dataverse users into People | Remove for the SQL cutover. The CSV import process seeds temporary DirectoryUsers from `people.csv`; no Active Directory import. |
| `backend/src/jobs/seedReferenceData.ts` | Categories, Functions, Questions | Creates reference data through Dataverse OData and resolves Dataverse metadata IDs | Replace with SQL seed/reference-data scripts or a `ReferenceDataRepository`; remove once SQL reference data is authoritative. |
| `backend/src/jobs/importDataverseCsv.ts` | Exported CSV representations of all attached entities | Migration-only source compatibility; does not call Dataverse | Keep as a one-time migration utility. It targets normalized SQL tables and retains source IDs in `LegacyDataverseId`. |
| `backend/src/demo/demoRoutes.ts` | In-memory People, Departments, Projects, Requests, Functions, Categories | No live Dataverse call; only documents/imitates the Dataverse API shape | Keep or remove independently. It is not part of the SQL migration dependency. |
| `backend/src/database/connection.ts` | Existing SQL mirror tables | No Dataverse call, but its comment says Dataverse remains system of record | Retire or consolidate with `database.ts` after SQL becomes the system of record. |
| `backend/src/database/database.ts` | Normalized SQL schema | No Dataverse call; SQL pool and query access | Keep as the SQL data-access foundation. |
| `backend/src/database/BaseRepository.ts` | Normalized SQL schema | No Dataverse call | Keep and use as the repository base. |
| `backend/src/database/repositories/DepartmentRepository.ts` | Departments | Only retains `LegacyDataverseId` for traceability; no runtime Dataverse dependency | Keep as the repository pattern example and extend for other entities. |
| `README.md` | Environment/setup documentation | Documents Dataverse credentials, SQL mirror, and migration-era behavior | Update after cutover to describe SQL as the system of record and remove obsolete Dataverse setup. |

## Migration order: least risky to most risky

### 1. Foundation and reference data

- Confirm the normalized SQL schema and indexes.
- Apply `04_import_support.sql`.
- Finish `database.ts`, `BaseRepository.ts`, and repository tests.
- Import and verify Functions, Sites, Locations, Programs, Skillsets, and scoring Categories.
- Replace `seedReferenceData.ts` with SQL reference-data loading.

### 2. Identity and organizational data

- Import temporary DirectoryUsers from `people.csv`; do not query or import Active Directory.
- Migrate People, Departments, and PersonSkillsets.
- Implement `DirectoryUserRepository`, `PersonRepository`, and `DepartmentRepository`.
- Migrate `auth.ts`, `users.ts`, and read-only lookup endpoints.

### 3. Read-only business views

- Migrate list/detail reads in People, Departments, Projects, Requests, Capacity, Demand, and Prioritization.
- Compare SQL responses with Dataverse exports before enabling writes.
- Remove or replace Metadata and Dataverse connection diagnostics.

### 4. Authorization and middleware

- Implement SQL-backed authorization projections.
- Migrate `recordAccess.ts` only after ownership, lead, delegate, moderator, and self-service cases have tests.
- Replace Dataverse-specific error translation.

### 5. Transactional writes

- Migrate Requests and Projects writes.
- Migrate People and Departments writes.
- Migrate Capacity and Demand writes, including weekly child rows and conflict handling.
- Migrate Prioritization answers and score updates.

### 6. Aggregations and administrative operations

- Replace the admin portfolio summary with SQL aggregation queries.
- Replace user sync with the chosen identity/session strategy.
- Reconcile counts, orphan checks, active flags, weekly totals, and priority scores.

### 7. Cutover and removal

- Switch `server.ts` to SQL-backed routers.
- Remove Dataverse routes, client, auth, fields, tables, metadata, and sync jobs.
- Remove `DATAVERSE_*` configuration and update README.
- Retain `LegacyDataverseId` and the CSV import/error history for traceability.
