# ClearPath 2.0

Resource management platform for the MBO staffing model. React frontend, Express API, and
Microsoft Dataverse as the system of record, with an optional SQL Server star-schema mirror
for reporting.

## Data source

Application master data and project demand live in the Dataverse environment **MBO-Staffing-Model**.
Non-project demand and its categories are stored in SQL Server:

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

### Entra ID sign-in

The frontend uses MSAL with the tenant-specific authority and `ENTRA_CLIENT_ID`; the backend validates
the returned ID token against that client ID, tenant issuer, and Microsoft signing keys. For an Entra
deployment, set `AUTH_MODE=entra`, `ENTRA_TENANT_ID`, and `ENTRA_CLIENT_ID` in `backend/.env` or the
deployment environment. No client secret is used by the browser app.

The New Person form searches Microsoft Graph server-side. Set `GRAPH_CLIENT_ID` (defaults to
`ENTRA_CLIENT_ID`) and `GRAPH_CLIENT_SECRET` in the backend environment; use a rotated secret and never
put it in frontend configuration. Grant that app registration the Microsoft Graph **Application**
permission `User.Read.All` and grant tenant admin consent. Graph search results are matched to the
read-only Dataverse `systemuser` table by Entra object ID when possible, so a People record can retain
its directory lookup. If there is no matching `systemuser`, name, email, and job title are still saved,
but the lookup remains unlinked.

Register the deployed frontend origin as an Entra **Single-page application** redirect URI. Local
development uses `http://localhost:5173`. To allow sign-in by all users in the tenant, the Enterprise
Application must not require user assignment. ClearPath does not enforce group membership; it does
require the signed-in email to match an active user record. ClearPath roles continue to come from
`ADMIN_EMAILS`, `PORTFOLIO_MANAGER_EMAILS`, and the person's `_People.role` value.

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
| `admin` | configuration, record assignments, reference data, security roles, user sync |
| `portfolio_manager` | read-only portfolio supply, demand and planning context |
| `intake_moderator` | edit opportunities at any stage; manage intake phases and assignments |
| `user` | own profile and workload; edits assigned records when named below |

Operational planning responsibilities are record assignments managed by administrators, not organization-wide roles:

- Project manager and project demand delegate manage demand for their assigned project.
- Department lead and department delegate manage roster and availability for their assigned department.
- Opportunity owner, sponsor and delegate can edit intake content through Prioritization; after that only admins and intake moderators can edit. The owner can assign a delegate during early intake.
- Site leads and assistant site leads may create people, departments and projects in their assigned site. Every new person inherits the creator's saved People-site assignment, including when created by an admin; users without a People record and saved site cannot add people. New opportunities inherit the creator's site; only admins may reassign a record's site later.

## Jobs

```powershell
cd backend
npm run sync:users        # copy active systemuser rows into _People (add --dry-run to preview)
npm run seed:dataverse    # seed categories, functions and prioritization questions
npm run backfill:person-sites         # preview missing _People site lookups
npm run backfill:person-sites -- --apply  # assign inferable missing site lookups
```

The user sync is one-way and never writes to `systemuser`. Department, function and role
assignments on _People are owned locally and are not overwritten.

## SQL Server mirror (optional)

```powershell
$env:SQLCMDPASSWORD = '<password>'
node scripts/init-db.mjs --server localhost --user sa
```

Creates the star schema (`DimPerson`, `DimDepartment`, `DimFunction`, `DimProject`, `DimWeek`,
`FactRequest`, `FactAvailability`, `FactDemand`, `FactAnswer`), plus the operational
`DimNonProjectDemandCategory`, `DimNonProjectDemandSubcategory` and `FactNonProjectDemand` tables.
The schema seeds the standard category/subcategory hierarchy used by the department workload table.
Set `SQL_ENABLED=true` in `backend/.env` to enable non-project demand and let the API open a pool
against SQL Server.

Workflow completion dates are recorded only on future stage transitions. Existing records without audit history
show "Date not recorded" for completed stages. The SQL setup script creates `RequestWorkflowCompletions`;
for an existing SQL installation, apply `database/08_request_workflow_completions.sql` before using opportunity details.
Demo mode writes new completion dates to `backend/demo-data/request_workflow_completions.csv`.

Reference-table leads, assistant leads, program mission statements, and site links are stored separately from
the imported lookup columns. Apply `database/09_reference_metadata.sql` to existing SQL installations before
using reference editing or Site-linked departments, projects, and opportunities. Demo mode stores these fields
in `backend/demo-data/reference-metadata.json` when edited.

Before using site-scoped intake, assign each site lead in Admin > Reference > Sites and associate locations
with their site in Admin > Reference > Locations. A site lead may appoint assistants already assigned to
that site from the People page. The admin-only site selector in the shared header scopes planning, intake,
prioritization, governance and People views across both portals; site leads and assistants stay on their
assigned site. Admins can change an existing person's site in the admin People editor. The backfill
uses department site assignments or site-lead assignments; review the unresolved count and assign those
people manually. It never runs in demo mode, where legacy people inherit their department's site.

## Security notes

- `.env` files are gitignored; never commit credentials.
- Set `AUTH_MODE=entra` and a strong `JWT_SECRET` before deploying — the app refuses to start in
  production otherwise. Directory-email sign-in is a local development convenience only.
- All Dataverse queries use OData literals escaped through `odataString`/`encodeGuid`, and SQL
  Server access uses parameterized `mssql` requests.
