# SQL Readiness Report

Generated: 2026-09-17

## Overall status

**NOT READY: configuration failure.**

The read-only readiness probe loaded `backend/.env` and found SQL server settings, but no SQL username or password. Because credentials were absent, it correctly stopped before opening a SQL connection. No database or data was modified.

## Results

| Check | Status | Result |
|---|---|---|
| SQL connection succeeds | Blocked | Connection was not attempted because required credentials are missing. |
| Connection string is valid | Blocked | Server, database, and port are present, but authentication settings are incomplete. |
| SQL repositories can read data | Not tested | Requires a successful SQL connection and `SQL_ENABLED=true`. |
| Required tables exist | Not tested | Requires a successful SQL connection. |
| Record counts | Not available | Requires a successful SQL connection. |

## Observed configuration

- SQL server: configured, value masked by diagnostic
- SQL database: configured, value masked by diagnostic
- SQL port: configured, value masked by diagnostic
- SQL username: missing
- SQL password: missing

No secrets were printed.

## Required next steps

Set valid SQL credentials in the runtime environment used by the backend:

```env
SQL_ENABLED=true
SQL_SERVER=<server>
SQL_PORT=1433
SQL_DATABASE=<database>
SQL_USER=<user>
SQL_PASSWORD=<password>
SQL_ENCRYPT=true
SQL_TRUST_SERVER_CERTIFICATE=true
```

Then rerun the readiness probe. The next run should verify these normalized tables and return counts:

- `DirectoryUsers`
- `Functions`
- `Sites`
- `Locations`
- `Programs`
- `Skillsets`
- `Departments`
- `People`
- `PersonSkillsets`
- `DepartmentDelegates`
- `Requests`
- `Projects`
- `ProjectDelegates`
- `RequestLocations`
- `ScoringCategories`
- `ScoringQuestions`
- `QuestionOptions`
- `ScoringAnswers`
- `Capacity`
- `CapacityWeeks`
- `DemandAllocations`
- `DemandWeeks`
- `ImportRuns`
- `ImportErrors`

This report reflects a configuration failure, not evidence that SQL Server, the database, or any table is unavailable.
