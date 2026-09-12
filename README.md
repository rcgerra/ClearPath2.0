# ClearPath 2.0

Resource management platform for the MBO staffing model. React frontend, Express API, and
Microsoft Dataverse as the system of record, with an optional SQL Server star-schema mirror
for reporting.

## Data source

All application data lives in the Dataverse environment **MBO-Staffing-Model**:

| Key | Display name | Logical name | Access |
| --- | --- | --- | --- |
| `adm` | _ADM | `new_adm` | read/write |
| `answers` | _Answers | `cr714_answers` | read/write |
| `capacity` | _Capacity | `new_capacity` | read/write |
| `categories` | _Categories | `cr714_categories` | read/write |
| `demand` | _Demand | `new_demand` | read/write |
| `departments` | _Departments | `new_department` | read/write |
| `feedback` | _feedback | `cr714_feedback` | read/write |
| `functions` | _Functions | `new_functions` | read/write |
| `locations` | _Locations | `cr714_locations` | read/write |
| `people` | _People | `new_people` | read/write |
| `programs` | _Programs | `cr714_programs` | read/write |
| `projects` | _Projects | `new_projects` | read/write |
| `questions` | _Questions | `cr714_questions` | read/write |
| `requests` | _Requests | `cr714_requests` | read/write |
| `sites` | _Sites | `new_sites` | read/write |
| `skillsets` | _Skillsets | `new_skillsets` | read/write |
| `users` | User | `systemuser` | **read-only** |

The registry in [backend/src/dataverse/tables.ts](backend/src/dataverse/tables.ts) enforces the
read-only rule: any create/update/delete against `systemuser` is rejected before it reaches the API.

## Setup

```powershell
npm run install:all

Copy-Item backend\.env.example backend\.env
Copy-Item frontend\.env.example frontend\.env
```

Fill in `backend/.env`:

- `DATAVERSE_URL` — environment URL, e.g. `https://orgXXXXXXXX.crm.dynamics.com`
- `DATAVERSE_TENANT_ID`, `DATAVERSE_CLIENT_ID`, `DATAVERSE_CLIENT_SECRET` — Entra ID app
  registration that is registered as an application user in the environment
- `JWT_SECRET` — 32+ random characters

Then run the two dev servers:

```powershell
npm run dev:backend    # http://localhost:3001
npm run dev:frontend   # http://localhost:5173
```

## Column mapping

Logical column names are centralized in [backend/src/dataverse/fields.ts](backend/src/dataverse/fields.ts).
Verify them against the real environment before first use:

```
GET /api/metadata/tables        # linked tables and access mode
GET /api/metadata/people        # actual attributes (admin only)
```

Entity set (plural) names and primary key attributes are resolved from Dataverse metadata at
runtime, so no pluralization is hard-coded.

## Weekly array format

Demand and availability are stored as fixed-width **2-digit positions**: position *N* holds the
hours (0-99) planned for week *N*. 1333 positions = 2666 characters, which fits a 4000-character
text column.

- TypeScript codec: [backend/src/utils/arrayParser.ts](backend/src/utils/arrayParser.ts) and
  [frontend/src/utils/arrayParser.ts](frontend/src/utils/arrayParser.ts)
- T-SQL codec: [database/02_functions.sql](database/02_functions.sql)
  (`fnGetWeekValue`, `fnSetWeekValue`, `fnExpandWeeks`, `fnSumWeeks`)

## Roles

Roles come from the `role` column on the person's _People record (semicolon separated).

| Role | Area |
| --- | --- |
| `admin` | projects, departments, reference data, security roles, user sync |
| `availability_moderator` | team roster, availability baselines |
| `demand_moderator` | project team building, demand allocation |
| `user` | own assignments, own availability, request intake |

## Jobs

```powershell
cd backend
npm run sync:users        # copy active systemuser rows into _People (add --dry-run to preview)
npm run seed:dataverse    # seed categories, functions and prioritization questions
```

The user sync is one-way and never writes to `systemuser`. Department, function and role
assignments on _People are owned locally and are not overwritten.

## SQL Server mirror (optional)

```powershell
$env:SQLCMDPASSWORD = '<password>'
node scripts/init-db.mjs --server localhost --user sa
```

Creates the star schema (`DimPerson`, `DimDepartment`, `DimFunction`, `DimProject`, `DimWeek`,
`FactRequest`, `FactAvailability`, `FactDemand`, `FactAnswer`), the array helper functions and
sample data. Set `SQL_ENABLED=true` in `backend/.env` to let the API open a pool against it.

## Security notes

- `.env` files are gitignored; never commit credentials.
- Set `AUTH_MODE=entra` and a strong `JWT_SECRET` before deploying — the app refuses to start in
  production otherwise. Directory-email sign-in is a local development convenience only.
- All Dataverse queries use OData literals escaped through `odataString`/`encodeGuid`, and SQL
  Server access uses parameterized `mssql` requests.
