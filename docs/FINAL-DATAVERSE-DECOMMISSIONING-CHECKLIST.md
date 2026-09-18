# Final Dataverse Decommissioning Checklist

No code or configuration was removed automatically. This checklist reflects the current source tree after the SQL migrations.

## Current status

Dataverse is still an active runtime dependency. The remaining dependency clusters are:

- People CRUD and People lookup bindings
- Questions and Answers prioritization
- Shared authorization for Demand, People, and Capacity
- Admin sync, connection diagnostics, and portfolio summary
- Metadata endpoint
- Generic lookup fallback for `_ADM`
- Migration/reference seed jobs
- CSV import/validation traceability

Migrated primary paths include Departments, Programs lookup CRUD, Requests, Projects CRUD, Capacity, Demand, and most reference lookup CRUD. Their cross-entity callers still need final cleanup where noted below.

## 1. Active runtime dependencies

| File | Dependency | Can remove? | Required before removal |
|---|---|---:|---|
| `backend/src/dataverse/auth.ts` | Dataverse OAuth token acquisition | Yes, after all client callers are gone | Remove all `client.ts` consumers and metadata calls |
| `backend/src/dataverse/client.ts` | Custom OData HTTP client | Yes, after all runtime callers are gone | Migrate People, Questions/Answers, admin, metadata, remaining authorization |
| `backend/src/dataverse/fields.ts` | Dataverse logical columns/lookups | Yes, incrementally by entity section | Remove remaining Dataverse route/job consumers |
| `backend/src/dataverse/tables.ts` | Dataverse table registry and metadata/writability | Yes, after metadata and fallback lookup routes are removed | Replace generic metadata and `_ADM` handling |
| `backend/src/config/env.ts` | `DATAVERSE_*` parsing and `isDataverseConfigured` | Yes | Remove server health/startup checks and all auth/client imports |
| `backend/src/server.ts` | Dataverse health output and warning | Yes | Replace health status with SQL readiness; remove `isDataverseConfigured` |
| `backend/src/routes/people.ts` | People CRUD and lookup bindings | Not yet | Complete PeopleRepository CRUD, role storage, relationship resolution |
| `backend/src/routes/prioritization.ts` | Questions, Answers, remaining Request score update | Not yet | Implement Question/Option/Answer repositories and transactional scoring |
| `backend/src/middleware/recordAccess.ts` | Demand, People, Capacity reads | Not yet | Replace `assertDemandWeeksEditable`, `departmentIdForPerson`, `projectIdForDemand`, `ownerForCapacity` with SQL repositories |
| `backend/src/routes/admin.ts` | Dataverse WhoAmI, sync job, portfolio summary | Not yet | Replace with SQL user service, SQL capacity/demand/project/request aggregation |
| `backend/src/routes/metadata.ts` | Dataverse EntityDefinitions | Yes | Remove endpoint or replace with static SQL metadata |
| `backend/src/routes/lookups.ts` | Dataverse fallback for `_ADM`; shared registry imports | Partially | Remove `_ADM` or migrate it to SQL, then remove fallback branch |
| `backend/src/jobs/seedReferenceData.ts` | Dataverse seed for Categories, Functions, Questions | Yes | Create SQL seed script for reference data/questions |
| `backend/src/jobs/syncUsers.ts` | Dataverse systemuser-to-People sync | Yes | Temporary SQL Users is operational; future Entra sync must replace it |

## 2. Migration-only dependencies

| File | Decision | Checklist |
|---|---|---|
| `backend/src/jobs/importDataverseCsv.ts` | Retain temporarily, then archive | Complete CSV reconciliation, retain import audit output, confirm no reruns are required |
| `backend/src/jobs/validateDataverseCsvImport.ts` | Retain for audit window, then archive | Run after final import and store JSON reports |
| `database/04_import_support.sql` | Retain permanently or for audit retention period | `ImportRuns` and `ImportErrors` provide migration traceability |
| `database/05_import_validation.sql` | Retain during cutover | Use for historical/target validation |
| `database/07_import_validation_all.sql` | Retain during cutover | Run against every source CSV/entity |
| `LegacyDataverseId` columns | Retain permanently | They are migration traceability keys, not runtime Dataverse dependencies |

## 3. Configuration and package cleanup

### Environment variables

Remove after runtime cutover and secret rotation:

- `DATAVERSE_URL`
- `DATAVERSE_TENANT_ID`
- `DATAVERSE_CLIENT_ID`
- `DATAVERSE_CLIENT_SECRET`
- `DATAVERSE_API_VERSION`
- `DATAVERSE_PREFIX_PRIMARY`
- `DATAVERSE_PREFIX_SECONDARY`
- `DATAVERSE_CSV_DIR`, only after import and validation jobs are archived

Before removal:

- Rotate any real client secret from `backend/.env`.
- Remove Dataverse values from deployment secret stores.
- Keep `.env.example` synchronized with SQL and future Entra settings.

### Packages

- No dedicated Dataverse SDK package is installed.
- `axios` is currently used by the custom Dataverse client; remove it only after confirming no non-Dataverse Axios callers remain.
- `dotenv`, `mssql`, `zod`, and authentication/runtime packages remain needed.

### Scripts

Remove or rename after cutover:

- `seed:dataverse`
- `sync:users`
- `import:csv` after migration audit completion
- `validate:csv` after validation reports are archived

## 4. Entity model cleanup

### Candidate for removal after verification

- `feedback` / `cr714_feedback`: registered in Dataverse tables/fields but no active source route or repository usage was found.
- Dataverse `_ADM` model: only removable after the generic lookup fallback is explicitly retired or migrated.
- Unused Dataverse fields sections for fully migrated entities, but only after an import/reference scan confirms no remaining caller.

### Still required

- People and Users/systemuser mappings
- Questions and Answers mappings
- Demand and Capacity mappings used by admin/authorization/project-team paths
- Project/Request mappings used by remaining cross-entity Dataverse reads
- Program/Category/Function mappings used by migration jobs or remaining bindings

## 5. Final pre-removal gates

- [ ] All backend runtime routes use SQL repositories or documented non-Dataverse services.
- [ ] `grep` finds no `../dataverse`, `./dataverse`, `dv.`, `env.dataverse`, or `isDataverseConfigured` in active runtime source.
- [ ] Authentication uses SQL Users temporarily or Microsoft Entra ID permanently.
- [ ] `recordAccess.ts` contains no Dataverse reads.
- [ ] Admin portfolio reporting uses SQL CapacityWeeks/DemandWeeks/Projects/Requests.
- [ ] Prioritization Questions/Answers use SQL repositories and preserve score calculations.
- [ ] People CRUD and role behavior are SQL-backed.
- [ ] `_ADM` and feedback decisions are documented.
- [ ] CSV import has completed successfully with zero unexplained missing records, duplicates, orphaned foreign keys, or integrity failures.
- [ ] API contract tests pass for authentication, lookups, Projects, Requests, Demand, Capacity, and prioritization.
- [ ] Frontend typecheck/build pass.
- [ ] Production deployment configuration no longer requires Dataverse secrets.
- [ ] Rollback procedure has been tested before deleting Dataverse code.

## 6. Removal order

1. Replace remaining authorization reads.
2. Replace People CRUD and role/user synchronization.
3. Replace Questions, Options, Answers, and scoring updates.
4. Replace admin aggregation and connection diagnostics.
5. Replace or remove `_ADM` and metadata routes.
6. Retire Dataverse seed/sync jobs.
7. Remove Dataverse environment variables and rotate secrets.
8. Delete `backend/src/dataverse/*` and unused imports.
9. Remove unused Axios dependency only after a full caller scan.
10. Rebuild backend/frontend and scan generated output.
11. Archive migration utilities and reports; retain `LegacyDataverseId` columns.
