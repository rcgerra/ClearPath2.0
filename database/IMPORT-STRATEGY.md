# Dataverse CSV Import Strategy

The importer targets the normalized integer-key schema. It does not import Active Directory or query Microsoft Graph. `people.csv` is the temporary source for `DirectoryUsers`; its exported Azure AD object identifier is stored as an external identity value, and the internal `DirectoryUserId` is used for all database relationships.

## Insert order

1. `Functions`, `Sites`, `Locations`, `Programs`, `Skillsets`, and `ScoringCategories`
2. `DirectoryUsers`, built only from `people.csv`
3. `Departments`
4. `People` and `PersonSkillsets`
5. `Requests` and `RequestLocations`
6. `Projects` and `ProjectDelegates`
7. `ScoringQuestions` and `QuestionOptions`
8. `ScoringAnswers`
9. `Capacity` and `CapacityWeeks`
10. `DemandAllocations` and `DemandWeeks`

Each source row is idempotent by `LegacyDataverseId`. Existing records are reused rather than duplicated. Weekly semicolon-delimited arrays are expanded using `IMPORT_WEEK_START`, defaulting to `2026-01-05`.

## Dependency map

```text
Functions -> Departments -> People -> Capacity -> CapacityWeeks
                         \\-> PersonSkillsets -> Skillsets
DirectoryUsers ----------> Departments, People, Requests, Projects, delegates
Programs ----------------> Requests -> RequestLocations -> Locations
Requests ----------------> Projects -> DemandAllocations -> DemandWeeks
ScoringCategories -------> ScoringQuestions -> QuestionOptions
Requests + Questions ----> ScoringAnswers
Sites -------------------> Projects
```

## Run prerequisites

1. Apply the normalized schema and then `04_import_support.sql`.
2. Set `SQL_SERVER`, `SQL_DATABASE`, `SQL_USER`, `SQL_PASSWORD`, and optionally `SQL_TRUST_CERT`.
3. Set `IMPORT_WEEK_START` to the first week represented by the exported arrays.
4. Run `npm run import:csv --prefix backend -- "C:\\path\\to\\Clearpath export"`.
5. Run `05_import_validation.sql` and inspect `ImportErrors`.

Invalid GUIDs and foreign-key failures are logged per row. Delegate email fields are not converted into user relationships when the People export does not contain matching email addresses; this is intentional because Active Directory import is prohibited. The importer continues processing other rows and marks the run `CompletedWithErrors` when necessary.