# Safest Dataverse Migration Order

This order is based on [DATAVERSE-DIRECT-INVENTORY.md](DATAVERSE-DIRECT-INVENTORY.md). Each batch has its own import, repository/API scope, validation queries, and rollback point.

The order prioritizes lookup/reference tables, then transactions, then user-related data, and finally business-critical runtime behavior. A small staging exception is intentional: Requests and basic Projects can be loaded before People because their user relationships are nullable in the target schema. Capacity and Demand must wait until People and Departments are available.

## Batch 0: Target foundation

**Purpose:** Establish the SQL target without changing application behavior.

**Scope:**

- Normalized SQL schema with integer identity keys
- `LegacyDataverseId` filtered unique indexes
- Foreign keys and soft-delete fields
- `ImportRuns` and `ImportErrors`
- SQL connection pool and repository base
- CSV import utility in dry-run or isolated database mode

**Independent tests:**

- Apply schema to an empty database
- Insert and retrieve a department through `DepartmentRepository`
- Verify every imported source GUID maps to at most one target row
- Verify foreign keys reject invalid parent IDs
- Run `05_import_validation.sql` with no orphan rows

**Gate:** Do not begin application cutover until the schema can be created from scratch and the import support tables are available.

## Batch 1: Lookup and reference tables

**Priority:** Lowest risk and first production-ready batch.

**Entities:**

- Functions
- Sites
- Locations
- Programs
- Skillsets
- Scoring Categories
- Scoring Questions
- Question Options
- Optional `_ADM` reference data

**Files:**

- `backend/src/routes/lookups.ts`
- `backend/src/jobs/seedReferenceData.ts`
- `backend/src/routes/metadata.ts`, which can be retired after SQL schema metadata is trusted
- `backend/src/dataverse/fields.ts`
- `backend/src/dataverse/tables.ts`

**Migration work:**

- Import reference rows from CSV using `LegacyDataverseId`
- Replace generic Dataverse lookup CRUD with explicit SQL repositories
- Normalize question labels into `QuestionOptions`
- Preserve category/question weights and ordering

**Independent tests:**

- Row counts by reference entity
- Name/code uniqueness
- Category-to-question relationships
- Program/site/location lookup results
- Reference CRUD authorization for administrators
- Comparison of lookup API payloads before and after migration

**Rollback:** Keep Dataverse lookup routes active while SQL lookup endpoints are validated independently.

## Batch 2: Transaction tables, part A

**Priority:** Transactional data that does not require canonical user rows.

**Entities:**

- Requests
- Basic Projects
- RequestLocations
- Project-to-Request relationship

**Files:**

- `backend/src/routes/requests.ts`
- `backend/src/routes/projects.ts`
- `backend/src/routes/admin.ts` portfolio counts, after query parity is confirmed
- `backend/src/database/repositories/RequestRepository.ts`
- `backend/src/database/repositories/ProjectRepository.ts`

**Migration work:**

- Import Requests before Projects
- Resolve Program, Site, Category, and Request relationships through internal integer IDs
- Preserve request workflow/status values exactly before introducing enum cleanup
- Load nullable manager/sponsor/delegate references as unresolved staging values if necessary
- Do not enable user-owned edit authorization yet

**Independent tests:**

- Request and Project row counts
- Every Project business-case/request relationship resolves correctly
- Every Request program/category relationship resolves correctly
- Dates, statuses, workflow steps, narratives, and boolean flags compare to CSV exports
- Project creation from a Request is transactionally consistent
- Soft delete does not physically remove rows

**Gate:** Do not enable project/request writes until request/project reconciliation passes and unresolved identity references are reported explicitly.

## Batch 2: Transaction tables, part B

**Priority:** Scoring transactions independent of People.

**Entities:**

- Scoring Answers
- Question Options
- Request scoring and priority updates

**Files:**

- `backend/src/routes/prioritization.ts`
- `backend/src/database/repositories/PrioritizationRepository.ts`

**Migration work:**

- Import Answers after Requests and Questions
- Resolve RequestId, QuestionId, and SelectedOptionId using internal keys
- Recalculate priority scores and compare to exported values

**Independent tests:**

- One answer per Request/Question where required
- Required question coverage
- Score and weight calculations
- Updating an answer changes the expected request score only
- No answer references an inactive or missing question

## Batch 3: User-related and organizational tables

**Priority:** Identity and ownership data, without importing Active Directory.

**Entities:**

- DirectoryUsers, populated only from `people.csv`
- People
- Departments
- PersonSkillsets
- DepartmentDelegates where the exported identity can be resolved

**Files:**

- `backend/src/routes/auth.ts`
- `backend/src/routes/users.ts`
- `backend/src/routes/people.ts`
- `backend/src/routes/departments.ts`
- `backend/src/jobs/syncUsers.ts`, which should be retired rather than run against Active Directory
- `backend/src/middleware/recordAccess.ts`, migrated in shadow mode first

**Migration work:**

- Create temporary DirectoryUsers from exported People identity values
- Import Departments after Functions
- Import People after Departments
- Resolve People-to-DirectoryUser relationships from exported identifiers
- Preserve roles, employment type, active flags, department, function, and skillset relationships
- Do not create users from delegate email strings when the People export cannot resolve them

**Independent tests:**

- Every active Person has the expected department and optional DirectoryUser
- Every Department lead/delegate relationship resolves or is logged as unresolved
- Role parsing matches the existing authorization behavior
- User search and session resolution return equivalent identities
- No Active Directory or Microsoft Graph call occurs
- Authorization decisions are compared in shadow mode against Dataverse

**Gate:** Do not switch authentication or authorization to SQL until identity counts, role assignments, and ownership mappings reconcile.

## Batch 4: Workload transaction tables

**Priority:** Transactions that require user and organizational foreign keys.

**Entities:**

- Capacity
- CapacityWeeks
- DemandAllocations
- DemandWeeks
- ProjectDelegates

**Files:**

- `backend/src/routes/capacity.ts`
- `backend/src/routes/demand.ts`
- `backend/src/routes/nonProjectDemand.ts` for its indirect authorization dependency
- `backend/src/middleware/recordAccess.ts`
- `backend/src/database/repositories/CapacityRepository.ts`
- `backend/src/database/repositories/DemandRepository.ts`

**Migration work:**

- Import Capacity after People
- Expand encoded weekly arrays into CapacityWeeks
- Import DemandAllocations after Projects and People
- Expand demand arrays into DemandWeeks
- Preserve the configured first week using `IMPORT_WEEK_START`
- Replace Dataverse ownership checks with SQL authorization projections

**Independent tests:**

- Weekly array length and total-hour reconciliation
- No orphan CapacityWeeks or DemandWeeks
- Person/project/department filtering parity
- Capacity minus demand calculations by week
- Self, department-lead, moderator, and project-owner permissions
- Concurrent weekly updates and transaction rollback behavior

## Batch 5: Business-critical runtime cutover

**Priority:** Highest risk. Switch only after all preceding gates pass.

**Files:**

- `backend/src/server.ts`
- `backend/src/config/env.ts`
- `backend/src/dataverse/client.ts`
- `backend/src/dataverse/auth.ts`
- `backend/src/routes/auth.ts`
- `backend/src/middleware/recordAccess.ts`
- `backend/src/routes/admin.ts`
- `backend/src/routes/requests.ts`
- `backend/src/routes/projects.ts`
- `backend/src/routes/people.ts`
- `backend/src/routes/departments.ts`
- `backend/src/routes/capacity.ts`
- `backend/src/routes/demand.ts`
- `backend/src/routes/prioritization.ts`

**Migration work:**

- Switch route repositories from Dataverse to SQL
- Replace Dataverse health/configuration reporting
- Remove Dataverse OAuth and Web API calls
- Retire `syncUsers.ts`
- Replace Dataverse-specific error handling
- Keep `LegacyDataverseId` for traceability and reconciliation
- Keep CSV import/error history until post-cutover audit is complete

**Independent tests:**

- Full API contract tests for all migrated routes
- Authentication and authorization regression suite
- CRUD and soft-delete behavior
- SQL connection failure and retry behavior
- Portfolio aggregation parity
- Load test for list, demand, capacity, and prioritization endpoints
- Dataverse dependency scan showing no runtime imports outside migration documentation/utilities

**Gate:** Cut over only after a rollback rehearsal has restored the previous route configuration and no data loss occurs.

## Final cleanup

After the stabilization period:

- Remove `backend/src/dataverse/client.ts` and `backend/src/dataverse/auth.ts`
- Remove Dataverse field/table registries
- Remove `DATAVERSE_*` environment variables and secrets
- Remove Dataverse-only metadata and synchronization routes/jobs
- Update `README.md` and health output
- Retain `LegacyDataverseId` columns and import audit tables permanently for traceability
