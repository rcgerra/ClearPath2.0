/* =============================================================================
   ClearPath 2.0 - sample data for the SQL Server reporting mirror
   Run with:  sqlcmd -S <server> -d ClearPath -i 03_seed-data.sql
   Encoded arrays: each week is 2 digits, so REPLICATE('40', 26) = 40 h/wk for 26 weeks.
   ============================================================================= */

USE ClearPath;
GO

SET NOCOUNT ON;

DECLARE @DeptEng   UNIQUEIDENTIFIER = '11111111-1111-1111-1111-111111111101';
DECLARE @DeptData  UNIQUEIDENTIFIER = '11111111-1111-1111-1111-111111111102';
DECLARE @DeptQA    UNIQUEIDENTIFIER = '11111111-1111-1111-1111-111111111103';

DECLARE @FnDev     UNIQUEIDENTIFIER = '22222222-2222-2222-2222-222222222201';
DECLARE @FnAnalyst UNIQUEIDENTIFIER = '22222222-2222-2222-2222-222222222202';
DECLARE @FnQA      UNIQUEIDENTIFIER = '22222222-2222-2222-2222-222222222203';

DECLARE @P1 UNIQUEIDENTIFIER = '33333333-3333-3333-3333-333333333301';
DECLARE @P2 UNIQUEIDENTIFIER = '33333333-3333-3333-3333-333333333302';
DECLARE @P3 UNIQUEIDENTIFIER = '33333333-3333-3333-3333-333333333303';
DECLARE @P4 UNIQUEIDENTIFIER = '33333333-3333-3333-3333-333333333304';

DECLARE @Proj1 UNIQUEIDENTIFIER = '44444444-4444-4444-4444-444444444401';
DECLARE @Proj2 UNIQUEIDENTIFIER = '44444444-4444-4444-4444-444444444402';

DECLARE @Req1 UNIQUEIDENTIFIER = '55555555-5555-5555-5555-555555555501';
DECLARE @Req2 UNIQUEIDENTIFIER = '55555555-5555-5555-5555-555555555502';

DECLARE @CatValue UNIQUEIDENTIFIER = '66666666-6666-6666-6666-666666666601';
DECLARE @CatRisk  UNIQUEIDENTIFIER = '66666666-6666-6666-6666-666666666602';

/* ---------- Week dimension: 104 weeks from the current ISO week ---------- */
DECLARE @Epoch DATE = DATEADD(DAY, -((DATEPART(WEEKDAY, GETUTCDATE()) + 5) % 7), CAST(GETUTCDATE() AS DATE));

;WITH Weeks AS (
    SELECT TOP (104) ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) - 1 AS WeekIndex
    FROM sys.all_objects a CROSS JOIN sys.all_objects b
)
MERGE dbo.DimWeek AS target
USING (
    SELECT WeekIndex,
           DATEADD(WEEK, WeekIndex, @Epoch) AS WeekStartDate
    FROM Weeks
) AS source
ON target.WeekIndex = source.WeekIndex
WHEN NOT MATCHED THEN
    INSERT (WeekIndex, WeekStartDate, IsoYear, IsoWeek)
    VALUES (source.WeekIndex, source.WeekStartDate, DATEPART(YEAR, source.WeekStartDate),
            DATEPART(ISO_WEEK, source.WeekStartDate));

/* ---------- Departments ---------- */
MERGE dbo.DimDepartment AS t
USING (VALUES
    (@DeptEng,  N'Engineering', N'ENG', @P1),
    (@DeptData, N'Data & Analytics', N'DNA', @P2),
    (@DeptQA,   N'Quality', N'QA', NULL)
) AS s (DepartmentId, Name, Code, LeadPersonId)
ON t.DepartmentId = s.DepartmentId
WHEN NOT MATCHED THEN
    INSERT (DepartmentId, Name, Code, LeadPersonId) VALUES (s.DepartmentId, s.Name, s.Code, s.LeadPersonId);

/* ---------- Functions ---------- */
MERGE dbo.DimFunction AS t
USING (VALUES
    (@FnDev,     N'Software Engineer', N'SWE', @DeptEng),
    (@FnAnalyst, N'Data Analyst',      N'DA',  @DeptData),
    (@FnQA,      N'QA Engineer',       N'QAE', @DeptQA)
) AS s (FunctionId, Name, Code, DepartmentId)
ON t.FunctionId = s.FunctionId
WHEN NOT MATCHED THEN
    INSERT (FunctionId, Name, Code, DepartmentId) VALUES (s.FunctionId, s.Name, s.Code, s.DepartmentId);

/* ---------- People ---------- */
MERGE dbo.DimPerson AS t
USING (VALUES
    (@P1, N'Avery Lane',   N'avery.lane@example.com',   N'availability_moderator;demand_moderator', @DeptEng,  @FnDev,     40),
    (@P2, N'Bilal Ahmed',  N'bilal.ahmed@example.com',  N'availability_moderator',                 @DeptData, @FnAnalyst, 40),
    (@P3, N'Chen Wu',      N'chen.wu@example.com',      N'user',                @DeptEng,  @FnDev,     40),
    (@P4, N'Dana Ortiz',   N'dana.ortiz@example.com',   N'admin;demand_moderator',     @DeptQA,   @FnQA,      32)
) AS s (PersonId, Name, Email, RoleNames, DepartmentId, FunctionId, WeeklyHours)
ON t.PersonId = s.PersonId
WHEN NOT MATCHED THEN
    INSERT (PersonId, Name, Email, RoleNames, DepartmentId, FunctionId, WeeklyHours)
    VALUES (s.PersonId, s.Name, s.Email, s.RoleNames, s.DepartmentId, s.FunctionId, s.WeeklyHours);

/* ---------- Requests ---------- */
MERGE dbo.FactRequest AS t
USING (VALUES
    (@Req1, N'Manual staffing spreadsheets cause rework',
            N'Resource plans live in disconnected spreadsheets, so department leads and project managers work from different numbers and rework every allocation each month.',
            N'Consolidate planning into one model', N'Reduce planning effort by 30%', N'Approved', 78.50, @P1, @DeptEng, @CatValue, @Proj1),
    (@Req2, N'No visibility into over-allocated staff',
            N'Individuals are committed beyond their available hours without anyone seeing it until delivery slips.',
            N'Weekly supply vs demand view', N'Fewer late projects', N'Submitted', 64.00, @P3, @DeptData, @CatRisk, NULL)
) AS s (RequestId, Title, ProblemStatement, BusinessCase, ExpectedBenefit, Status, PriorityScore, RequesterPersonId, DepartmentId, CategoryId, ProjectId)
ON t.RequestId = s.RequestId
WHEN NOT MATCHED THEN
    INSERT (RequestId, Title, ProblemStatement, BusinessCase, ExpectedBenefit, Status, SubmittedOn, PriorityScore, RequesterPersonId, DepartmentId, CategoryId, ProjectId)
    VALUES (s.RequestId, s.Title, s.ProblemStatement, s.BusinessCase, s.ExpectedBenefit, s.Status, SYSUTCDATETIME(), s.PriorityScore, s.RequesterPersonId, s.DepartmentId, s.CategoryId, s.ProjectId);

/* ---------- Projects ---------- */
MERGE dbo.DimProject AS t
USING (VALUES
    (@Proj1, N'ClearPath Rollout', N'CP-001',
        N'Resource plans live in disconnected spreadsheets, so allocations are reworked every month.',
        N'Active', 78.50, @P1, @DeptEng, @Req1),
    (@Proj2, N'Capacity Signal Dashboard', N'CP-002',
        N'Leads cannot see over-allocation until delivery slips.',
        N'Planning', 64.00, @P4, @DeptData, @Req2)
) AS s (ProjectId, Name, Code, ProblemStatement, Status, PriorityScore, ManagerPersonId, DepartmentId, RequestId)
ON t.ProjectId = s.ProjectId
WHEN NOT MATCHED THEN
    INSERT (ProjectId, Name, Code, ProblemStatement, Status, PriorityScore, ManagerPersonId, DepartmentId, RequestId, StartDate, EndDate)
    VALUES (s.ProjectId, s.Name, s.Code, s.ProblemStatement, s.Status, s.PriorityScore, s.ManagerPersonId, s.DepartmentId, s.RequestId,
            @Epoch, DATEADD(WEEK, 26, @Epoch));

/* ---------- Availability: 26 weeks of encoded hours ---------- */
MERGE dbo.FactAvailability AS t
USING (VALUES
    ('77777777-7777-7777-7777-777777777701', @P1, @DeptEng,  REPLICATE('40', 26), 40),
    ('77777777-7777-7777-7777-777777777702', @P2, @DeptData, REPLICATE('40', 26), 40),
    ('77777777-7777-7777-7777-777777777703', @P3, @DeptEng,  REPLICATE('36', 26), 36),
    ('77777777-7777-7777-7777-777777777704', @P4, @DeptQA,   REPLICATE('32', 26), 32)
) AS s (CapacityId, PersonId, DepartmentId, AvailabilityHours, WeeklyBaseline)
ON t.CapacityId = s.CapacityId
WHEN NOT MATCHED THEN
    INSERT (CapacityId, PersonId, DepartmentId, AvailabilityHours, WeeklyBaseline)
    VALUES (s.CapacityId, s.PersonId, s.DepartmentId, s.AvailabilityHours, s.WeeklyBaseline);

/* ---------- Demand ---------- */
MERGE dbo.FactDemand AS t
USING (VALUES
    ('88888888-8888-8888-8888-888888888801', @Proj1, @P1, @FnDev,     REPLICATE('12', 20), 0, 19, N'Committed'),
    ('88888888-8888-8888-8888-888888888802', @Proj1, @P3, @FnDev,     REPLICATE('24', 20), 0, 19, N'Committed'),
    ('88888888-8888-8888-8888-888888888803', @Proj2, @P2, @FnAnalyst, REPLICATE('16', 12), 0, 11, N'Planned'),
    ('88888888-8888-8888-8888-888888888804', @Proj2, @P4, @FnQA,      REPLICATE('20', 12), 0, 11, N'Planned')
) AS s (DemandId, ProjectId, PersonId, FunctionId, DemandHours, StartWeek, EndWeek, Status)
ON t.DemandId = s.DemandId
WHEN NOT MATCHED THEN
    INSERT (DemandId, ProjectId, PersonId, FunctionId, DemandHours, StartWeek, EndWeek, Status)
    VALUES (s.DemandId, s.ProjectId, s.PersonId, s.FunctionId, s.DemandHours, s.StartWeek, s.EndWeek, s.Status);

/* ---------- Prioritization ---------- */
MERGE dbo.DimCategory AS t
USING (VALUES (@CatValue, N'Business value', 2.0), (@CatRisk, N'Risk reduction', 1.5)) AS s (CategoryId, Name, Weight)
ON t.CategoryId = s.CategoryId
WHEN NOT MATCHED THEN INSERT (CategoryId, Name, Weight) VALUES (s.CategoryId, s.Name, s.Weight);

MERGE dbo.DimQuestion AS t
USING (VALUES
    ('99999999-9999-9999-9999-999999999901', N'How many people are affected by the problem today?', @CatValue, 2.0, 1),
    ('99999999-9999-9999-9999-999999999902', N'What is the annual cost of the problem remaining unsolved?', @CatValue, 3.0, 2),
    ('99999999-9999-9999-9999-999999999903', N'What is the compliance or audit exposure?', @CatRisk, 2.5, 3),
    ('99999999-9999-9999-9999-999999999904', N'How confident are we in the proposed approach?', @CatRisk, 1.0, 4)
) AS s (QuestionId, QuestionText, CategoryId, Weight, Sequence)
ON t.QuestionId = s.QuestionId
WHEN NOT MATCHED THEN
    INSERT (QuestionId, QuestionText, CategoryId, Weight, Sequence) VALUES (s.QuestionId, s.QuestionText, s.CategoryId, s.Weight, s.Sequence);

MERGE dbo.FactAnswer AS t
USING (VALUES
    ('aaaaaaa1-0000-0000-0000-00000000a001', '99999999-9999-9999-9999-999999999901', @Req1, N'80', 80),
    ('aaaaaaa1-0000-0000-0000-00000000a002', '99999999-9999-9999-9999-999999999902', @Req1, N'75', 75),
    ('aaaaaaa1-0000-0000-0000-00000000a003', '99999999-9999-9999-9999-999999999903', @Req1, N'85', 85),
    ('aaaaaaa1-0000-0000-0000-00000000a004', '99999999-9999-9999-9999-999999999901', @Req2, N'60', 60)
) AS s (AnswerId, QuestionId, RequestId, AnswerValue, Score)
ON t.AnswerId = s.AnswerId
WHEN NOT MATCHED THEN
    INSERT (AnswerId, QuestionId, RequestId, AnswerValue, Score) VALUES (s.AnswerId, s.QuestionId, s.RequestId, s.AnswerValue, s.Score);

PRINT 'ClearPath sample data loaded.';
GO

SELECT TOP 20 Name, WeekIndex, AvailableHours, DemandHours, NetHours
FROM dbo.vwPersonWeeklyNet
WHERE WeekIndex < 4
ORDER BY Name, WeekIndex;
GO
