# CSV Import Scripts

## Source coverage

`backend/src/jobs/importDataverseCsv.ts` imports every attached CSV entity:

- `functions.csv` -> `Functions`
- `sites.csv` -> `Sites`
- `locations.csv` -> `Locations`
- `programs.csv` -> `Programs`
- `skillsets.csv` -> `Skillsets`
- `categories.csv` -> `ScoringCategories`
- `people.csv` -> `DirectoryUsers` temporary identities and `People`
- `departments.csv` -> `Departments`
- `questions.csv` -> `ScoringQuestions` and `QuestionOptions`
- `requests.csv` -> `Requests` and `RequestLocations`
- `projects.csv` -> `Projects`
- `answers.csv` -> `ScoringAnswers`
- `capacities.csv` -> `Capacity` and `CapacityWeeks`
- `demands.csv` -> `DemandAllocations` and `DemandWeeks`

There is no separate Active Directory CSV import. `people.csv` is the temporary identity source.

## Import order

1. Functions, Sites, Locations, Programs, Skillsets, ScoringCategories
2. Temporary DirectoryUsers from People.csv
3. Departments
4. People and PersonSkillsets
5. Requests and RequestLocations
6. Projects
7. ScoringQuestions and QuestionOptions
8. ScoringAnswers
9. Capacity and CapacityWeeks
10. DemandAllocations and DemandWeeks

This order satisfies parent-before-child foreign keys and allows every child lookup to resolve through the target integer key or `LegacyDataverseId`.

## Duplicate protection

- Entity rows use `LegacyDataverseId` as an idempotency key.
- Weekly rows use `(parent ID, WeekStartDate)` as an idempotency key.
- Bridge rows use their composite primary keys.
- Re-running the importer does not create a second row for the same source GUID.
- Existing rows are reused; the current importer does not overwrite existing scalar entity values.

## Logging

Apply `database/04_import_support.sql` before importing. Each run records:

- Run ID and source directory
- Rows read/imported/failed
- Source file and target table
- Source row number
- Error message and raw row JSON

A row failure is logged and the importer continues with later rows. A run is marked `CompletedWithErrors` when any row fails.

## Commands

```powershell
# Apply database/04_import_support.sql first.
npm run import:csv --prefix backend -- "C:\path\to\Clearpath export"
```

Set these environment variables before running:

- `SQL_SERVER`
- `SQL_DATABASE`
- `SQL_USER`
- `SQL_PASSWORD`
- `SQL_ENCRYPT`
- `SQL_TRUST_CERT`
- `IMPORT_WEEK_START` for the first week represented by the exported arrays

## Validation

Run `database/07_import_validation_all.sql` after the import. It reports:

- Import runs and errors
- Target coverage for every CSV file
- Duplicate legacy GUIDs for every entity
- Orphaned foreign keys
- Duplicate weekly rows
- Missing project, person, category, question, and request relationships
