# Reference Entity Migration Testing Checklist

Scope: Functions, Locations, Sites, Categories, and Skillsets.

## Verification summary

- [x] Runtime `/api/lookups/:table` reads for all five entities use SQL repositories.
- [x] Runtime lookup create, update, and soft-delete operations for all five entities use SQL repositories.
- [x] `/api/prioritization/categories` uses `categoryRepository`.
- [x] Lookup response remains `{ id: string, name: string }`.
- [x] Prioritization category response preserves `{ id: string, name: string, weight }`.
- [x] Frontend lookup route names and TypeScript contracts are unchanged.
- [x] Backend typecheck passes.
- [x] Frontend production build passes.
- [ ] Global Dataverse removal is not complete.

## Remaining intentional dependencies

- `backend/src/jobs/seedReferenceData.ts` still uses Dataverse while seeding Questions and binding their categories.
- `backend/src/routes/people.ts`, `demand.ts`, `requests.ts`, and related routes still use Dataverse lookup bindings as part of their un-migrated transactional writes.
- `backend/src/routes/lookups.ts` still uses Dataverse for Programs and `_ADM`; those entities were not included in this migration slice.

These are cross-entity dependencies, not failures in the migrated runtime reference endpoints.

## SQL data checks

- [ ] Apply the normalized SQL schema and import reference CSV data.
- [ ] Verify row counts for Functions, Locations, Sites, ScoringCategories, and Skillsets against the exports.
- [ ] Verify every imported `LegacyDataverseId` is unique.
- [ ] Verify active/inactive flags are preserved.
- [ ] Verify duplicate names and abbreviations follow the intended unique-index rules.
- [ ] Verify Categories retain `CategoryType`, `CategoryWeight`, and `Notes`.
- [ ] Verify Skillsets retain descriptions.

## API checks

- [ ] `GET /api/lookups/functions` returns the same `{ id, name }` shape and alphabetical ordering.
- [ ] `GET /api/lookups/locations` returns the same `{ id, name }` shape and alphabetical ordering.
- [ ] `GET /api/lookups/sites` returns the same `{ id, name }` shape and alphabetical ordering.
- [ ] `GET /api/lookups/categories` returns the same `{ id, name }` shape and alphabetical ordering.
- [ ] `GET /api/lookups/skillsets` returns the same `{ id, name }` shape and alphabetical ordering.
- [ ] `GET /api/prioritization/categories` preserves category `weight` values.
- [ ] POST lookup operations return HTTP 201 and `{ id: string }`.
- [ ] PATCH lookup operations accept legacy GUIDs and internal numeric-string IDs.
- [ ] DELETE lookup operations return HTTP 204 and perform soft deletion.
- [ ] Unknown IDs return HTTP 404.
- [ ] Non-admin write requests remain rejected.

## Frontend checks

- [ ] Department filters populate from `/api/lookups/functions`.
- [ ] People, project, demand, and request forms still populate function/site/skillset/category selectors.
- [ ] Request and project capture pages still populate prioritization categories.
- [ ] Lookup IDs remain strings at the API boundary.
- [ ] Existing React Query keys remain unchanged.
- [ ] No frontend TypeScript errors occur.
- [ ] Production frontend build succeeds.

## Repository checks

- [ ] `FunctionRepository` targets `dbo.Functions`.
- [ ] `LocationRepository` targets `dbo.Locations`.
- [ ] `SiteRepository` targets `dbo.Sites`.
- [ ] `CategoryRepository` targets `dbo.ScoringCategories`.
- [ ] `SkillsetRepository` targets `dbo.Skillsets`.
- [ ] All repository inputs use parameterized SQL.
- [ ] All repositories use the pooled SQL data-access base.
- [ ] `LegacyDataverseId` resolves legacy GUID requests without exposing GUID foreign keys internally.
