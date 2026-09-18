# Dataverse Cleanup Report

## Scope

This report inventories Dataverse-specific code, packages, environment variables, configuration, generated output, and likely unused entity models. No files were removed or modified.

The scan distinguishes:

- **Active runtime dependency**: imported or called by current backend source.
- **Migration-only dependency**: used to import CSV exports or preserve legacy IDs.
- **Generated/stale output**: compiled artifacts under `dist`; regenerate after cleanup.
- **Documentation/configuration**: does not execute Dataverse but controls or describes it.

## Summary

- Dataverse is implemented through a custom Axios/OData client, not a dedicated Dataverse SDK package.
- Active source still has Dataverse runtime dependencies in authentication, People, authorization, admin reporting, metadata, remaining Project team Demand reads, prioritization Questions/Answers, and reference-data seeding.
- Departments, Programs lookup CRUD, Requests, Capacity, Demand, and several reference lookups have SQL-backed implementations, but some cross-entity and admin paths still use Dataverse.
- `LegacyDataverseId` fields are migration traceability and should not be removed.
- `backend/dist` and `frontend/dist` contain stale compiled Dataverse strings/code and should be treated as build output, not source inventory.

## 1. Dataverse SDK and runtime references

### Custom SDK-equivalent layer

| Path | Role | Status |
|---|---|---|
| `backend/src/dataverse/client.ts` | Custom Axios client for OData list, retrieve, create, update, delete, lookup binding, metadata, and `WhoAmI` | Active runtime dependency for remaining routes |
| `backend/src/dataverse/auth.ts` | OAuth client-credentials token acquisition for Dataverse Web API | Active runtime dependency |
| `backend/src/dataverse/fields.ts` | Logical column names, navigation properties, formatted-value helper | Active for remaining Dataverse callers; partially stale for migrated entities |
| `backend/src/dataverse/tables.ts` | Table registry, entity logical names, writable/read-only rules | Active for metadata and remaining generic lookups |

### Direct source callers still using Dataverse

| Path | Current use |
|---|---|
| `backend/src/routes/auth.ts` | Dataverse `systemuser` and People lookup during session/login |
| `backend/src/routes/admin.ts` | `WhoAmI`, remaining Capacity/Demand/Projects/Requests portfolio reads, user-sync trigger |
| `backend/src/routes/people.ts` | People CRUD and lookup binding to Department, Function, Site, Skillset, system user |
| `backend/src/routes/prioritization.ts` | Questions, Answers, and Request priority update; category read is SQL-backed |
| `backend/src/routes/projects.ts` | Project team Demand read; remaining Demand-specific Dataverse fields |
| `backend/src/routes/lookups.ts` | Programs and `_ADM`; migrated lookup entities use SQL |
| `backend/src/routes/metadata.ts` | Dataverse EntityDefinitions and metadata identity |
| `backend/src/middleware/recordAccess.ts` | Remaining Project, Demand, People, and Capacity authorization lookups |
| `backend/src/jobs/seedReferenceData.ts` | Dataverse Categories, Functions, Questions seeding |
| `backend/src/jobs/syncUsers.ts` | Dataverse systemuser-to-People synchronization |

No frontend source directly calls Dataverse. It calls backend routes.

## 2. Dataverse packages

There is no dedicated Dataverse SDK package in `backend/package.json` or the lockfile.

| Package | Relevant use | Cleanup status |
|---|---|---|
| `axios` | Custom Dataverse HTTP/OData client in `dataverse/client.ts`; may also support unrelated HTTP use | Remove only after checking all Axios callers; do not assume it is Dataverse-only |
| `mssql` | SQL repositories and import tools | Retain |
| `dotenv` | Environment loading, including Dataverse and SQL variables | Retain for remaining configuration unless replaced globally |
| `zod` | Request validation | Retain |

The package scripts still expose Dataverse-specific commands:

- `backend/package.json`: `seed:dataverse`
- `backend/package.json`: `sync:users`
- `backend/package.json`: `import:csv` is migration tooling but is CSV/Dataverse-export named

## 3. Dataverse environment variables

### Runtime variables

Defined in `backend/src/config/env.ts` and documented in `backend/.env.example`:

- `DATAVERSE_URL`
- `DATAVERSE_TENANT_ID`
- `DATAVERSE_CLIENT_ID`
- `DATAVERSE_CLIENT_SECRET`
- `DATAVERSE_API_VERSION`
- `DATAVERSE_PREFIX_PRIMARY`
- `DATAVERSE_PREFIX_SECONDARY`

`DATAVERSE_PREFIX_PRIMARY` and `DATAVERSE_PREFIX_SECONDARY` are present in `.env.example` but are not read by `env.ts`; they are candidates for removal after confirming no external tooling depends on them.

### Files containing environment values or references

- `backend/.env`: local environment file containing a Dataverse URL and credential placeholders/values; treat as sensitive and rotate any real secret before cleanup.
- `backend/.env.example`: template for Dataverse configuration.
- `backend/src/config/env.ts`: parses and validates Dataverse configuration.
- `backend/src/server.ts`: reports Dataverse configuration and startup warnings.
- `README.md`: documents Dataverse as system of record and its environment variables.

## 4. Dataverse configuration and migration files

| Path | Purpose | Recommended action later |
|---|---|---|
| `backend/src/config/env.ts` | Dataverse settings and `isDataverseConfigured` | Remove Dataverse config after final runtime caller is migrated |
| `backend/src/server.ts` | Health output and startup warning | Replace `dataverseConfigured` with SQL health/config status |
| `backend/src/dataverse/*` | Client, auth, fields, tables | Remove only after a source import scan is clean |
| `backend/src/jobs/importDataverseCsv.ts` | One-time CSV export importer | Retain until migration/reconciliation/audit is complete; then archive |
| `backend/src/jobs/syncUsers.ts` | Dataverse user sync | Retire; temporary Users service now uses People.csv and future Entra ID |
| `backend/src/jobs/seedReferenceData.ts` | Dataverse reference/question seed | Replace with SQL seed process before removal |
| `backend/src/routes/metadata.ts` | Dataverse metadata endpoint | Remove or replace with static SQL schema metadata |
| `database/01_schema.sql` | Older SQL mirror whose comments still name Dataverse as source of truth | Review separately; do not treat as the normalized target schema |
| `database/04_import_support.sql` | Import audit tables containing legacy GUIDs | Retain |
| `database/05_import_validation.sql` | Import validation | Retain during cutover |
| `database/06_temporary_users.sql` | Temporary Users table sourced from People.csv | Retain until Entra ID migration |
| `docs/DATAVERSE-*.md` | Migration inventory/order/checklists | Retain as migration records; archive after sign-off |

## 5. Generated output

The following contain compiled copies of Dataverse code and should not be hand-cleaned:

- `backend/dist/config/*`
- `backend/dist/dataverse/*`
- `backend/dist/routes/*`
- `backend/dist/jobs/*`
- `backend/dist/middleware/*`
- `backend/dist/server.*`
- `frontend/dist/assets/*` includes stale UI text mentioning Dataverse

Recommended action: clean build output through the normal build/clean process after source cleanup. Do not use generated output as evidence that a source dependency remains.

## 6. Entity model cleanup candidates

### Likely unused or stale

- `feedback` / `cr714_feedback`: registered in `backend/src/dataverse/tables.ts` and mapped in `fields.ts`, but no current backend route, job, repository, or frontend API usage was found. Candidate for removal after confirming no external integration requires it.
- `_ADM` / `adm`: still exposed through the generic lookup route, so not removable until that route is narrowed or the entity is explicitly retired.
- `DataverseRecord`, `QueryOptions`, entity-set metadata helpers: used by the custom client and metadata route; removable only with the remaining client.
- Dataverse column sections for migrated entities such as Departments, Capacity, Demand, Requests, and Categories: some are stale in the migrated route but remain referenced indirectly by remaining routes/jobs. Remove per section only after import/usage scans pass.
- `DirectoryUser`/`systemuser` Dataverse mappings: still used by `auth.ts`, `syncUsers.ts`, and remaining People flows; not yet removable despite the temporary SQL Users table.

### Still active

- People: People route, auth, authorization, sync job, remaining lookup bindings.
- Questions and Answers: prioritization route.
- Projects: remaining Demand team path and Dataverse fields/import compatibility.
- Requests/Projects/Categories/Functions: some seed, cross-entity, or legacy mapping paths remain even though primary routes are SQL-backed.
- Capacity/Demand: SQL primary routes exist, but admin/authorization/project-team Dataverse reads remain.
- Programs: SQL lookup route exists; legacy field mappings remain for cross-entity compatibility.

## Recommended cleanup order

1. Run an import/reference scan limited to `backend/src` after each migration slice.
2. Migrate remaining cross-entity authorization and admin aggregation paths.
3. Replace `seedReferenceData.ts` with SQL seed/reference data.
4. Retire `syncUsers.ts` in favor of temporary Users/Entra ID strategy.
5. Remove metadata and generic Dataverse-only routes.
6. Remove `DATAVERSE_*` parsing and secrets from runtime configuration.
7. Remove custom client/auth/fields/tables modules.
8. Remove Dataverse-only package usage only after verifying `axios` has no non-Dataverse consumers.
9. Rebuild and verify `backend/dist` and `frontend/dist` are regenerated cleanly.
10. Archive migration documentation and retain `LegacyDataverseId` plus import audit tables.
