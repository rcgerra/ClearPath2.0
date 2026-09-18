# Department Migration Testing Checklist

## Automated verification

- [x] `backend/src/routes/departments.ts` has no Dataverse imports or client calls.
- [x] `backend/src/routes/departments.ts` uses `departmentRepository` for list, detail, team, create, update, and soft delete.
- [x] `backend/src/middleware/recordAccess.ts` has no department-specific Dataverse list/retrieve calls.
- [x] `backend/src/repositories/sql/DepartmentRepository.ts` uses the pooled SQL repository base.
- [x] Department SQL values are parameterized; table and column identifiers are fixed code constants.
- [x] Backend TypeScript typecheck passes: `npm run typecheck --prefix backend`.
- [x] Frontend TypeScript/build passes: `npm run build --prefix frontend`.
- [x] Existing frontend route paths remain `/departments`, `/departments/:id`, `/departments/:id/team`, and `/departments/:id/edit`.
- [x] Existing frontend response fields remain `id`, `name`, `code`, `leadPersonId`, `leadName`, `delegatePersonId`, `delegateName`, `functionId`, `functionName`, `lastCheckIn`, and `isActive`.

## SQL repository checks

- [ ] Apply the normalized SQL schema and import support tables to a test database.
- [ ] Verify `Departments.LegacyDataverseId` has a filtered unique index.
- [ ] Verify `DepartmentRepository.list(true)` returns active and inactive rows.
- [ ] Verify `DepartmentRepository.findByIdentifier()` accepts both an internal integer ID string and a legacy Dataverse GUID.
- [ ] Verify Functions, lead People, DirectoryUsers, and delegate People are returned through the department projection.
- [ ] Verify a department with no lead, delegate, or function returns null/undefined-compatible values rather than failing.
- [ ] Verify soft delete changes `IsActive` to `0` and does not delete the row.
- [ ] Verify SQL exceptions are returned through the existing API error middleware.

## API contract checks

- [ ] `GET /api/departments` returns an array with the existing Department response shape.
- [ ] Inactive departments remain present in the response for client-side filtering.
- [ ] `GET /api/departments/:id` returns the same field names and string-compatible IDs.
- [ ] `GET /api/departments/:id/team` returns the existing TeamMember shape.
- [ ] Team members retain `id`, `name`, `email`, `role`, `title`, `weeklyHours`, `functionName`, `isActive`, `capacityId`, `availabilityHours`, and `weeklyBaseline`.
- [ ] `POST /api/departments` returns HTTP 201 and `{ id: string }`.
- [ ] `PATCH /api/departments/:id` returns `{ id: string }`.
- [ ] `DELETE /api/departments/:id` returns HTTP 204 and performs a soft delete.
- [ ] Invalid or unknown department identifiers return HTTP 404.
- [ ] Non-admin users cannot create or delete departments.
- [ ] Department leads/delegates retain edit authorization through SQL ownership checks.

## Frontend compatibility checks

- [ ] Departments list renders names, codes, leads, delegates, functions, and last-check-in values.
- [ ] Client-side inactive filtering still works.
- [ ] Function filtering compares the returned `functionId` string to lookup IDs.
- [ ] Department detail/team links work with both legacy GUID and internal numeric-string IDs.
- [ ] Department edit forms continue posting the existing field names.
- [ ] Person, project, request, dashboard, and capture pages can consume `departmentsApi.list()` unchanged.
- [ ] React Query cache keys and route navigation remain unchanged.

## Intentional remaining dependency

The department route no longer calls Dataverse. The authorization middleware still contains Dataverse calls for unrelated Project, Demand, People, and Capacity checks; those are outside the department-specific migration and must be migrated separately before removing the shared Dataverse client.

The department team response is now SQL-backed. Its normalized SQL projection may return null for legacy fields that are not represented in the target schema, such as role, title, or function details, and should be reconciled with the final People schema before production cutover.
