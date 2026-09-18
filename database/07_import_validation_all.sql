USE ClearPath;
GO

DECLARE @ImportRunId UNIQUEIDENTIFIER = NULL;

/* Import run summary and errors. */
SELECT ImportRunId, StartedDate, CompletedDate, Status,
       RowsRead, RowsImported, RowsFailed, ErrorMessage
FROM dbo.ImportRuns
WHERE @ImportRunId IS NULL OR ImportRunId = @ImportRunId
ORDER BY StartedDate DESC;

SELECT SourceFile, TargetTable, COUNT(*) AS ErrorCount
FROM dbo.ImportErrors
WHERE @ImportRunId IS NULL OR ImportRunId = @ImportRunId
GROUP BY SourceFile, TargetTable
ORDER BY ErrorCount DESC;

/* Expected source-to-target coverage. */
SELECT v.SourceFile, v.TargetTable, v.LegacyIdColumn, v.TargetCount
FROM
(
    SELECT 'functions.csv' AS SourceFile, 'Functions' AS TargetTable, 'LegacyDataverseId' AS LegacyIdColumn, COUNT(*) AS TargetCount FROM dbo.Functions
    UNION ALL SELECT 'sites.csv', 'Sites', 'LegacyDataverseId', COUNT(*) FROM dbo.Sites
    UNION ALL SELECT 'locations.csv', 'Locations', 'LegacyDataverseId', COUNT(*) FROM dbo.Locations
    UNION ALL SELECT 'programs.csv', 'Programs', 'LegacyDataverseId', COUNT(*) FROM dbo.Programs
    UNION ALL SELECT 'skillsets.csv', 'Skillsets', 'LegacyDataverseId', COUNT(*) FROM dbo.Skillsets
    UNION ALL SELECT 'categories.csv', 'ScoringCategories', 'LegacyDataverseId', COUNT(*) FROM dbo.ScoringCategories
    UNION ALL SELECT 'people.csv', 'People', 'LegacyDataverseId', COUNT(*) FROM dbo.People
    UNION ALL SELECT 'departments.csv', 'Departments', 'LegacyDataverseId', COUNT(*) FROM dbo.Departments
    UNION ALL SELECT 'questions.csv', 'ScoringQuestions', 'LegacyDataverseId', COUNT(*) FROM dbo.ScoringQuestions
    UNION ALL SELECT 'requests.csv', 'Requests', 'LegacyDataverseId', COUNT(*) FROM dbo.Requests
    UNION ALL SELECT 'projects.csv', 'Projects', 'LegacyDataverseId', COUNT(*) FROM dbo.Projects
    UNION ALL SELECT 'answers.csv', 'ScoringAnswers', 'LegacyDataverseId', COUNT(*) FROM dbo.ScoringAnswers
    UNION ALL SELECT 'capacities.csv', 'Capacity', 'LegacyDataverseId', COUNT(*) FROM dbo.Capacity
    UNION ALL SELECT 'demands.csv', 'DemandAllocations', 'LegacyDataverseId', COUNT(*) FROM dbo.DemandAllocations
) v
ORDER BY v.SourceFile;

/* Duplicate source-key checks across every imported entity. */
SELECT 'Functions' AS TargetTable, LegacyDataverseId, COUNT(*) AS DuplicateCount FROM dbo.Functions WHERE LegacyDataverseId IS NOT NULL GROUP BY LegacyDataverseId HAVING COUNT(*) > 1
UNION ALL SELECT 'Sites', LegacyDataverseId, COUNT(*) FROM dbo.Sites WHERE LegacyDataverseId IS NOT NULL GROUP BY LegacyDataverseId HAVING COUNT(*) > 1
UNION ALL SELECT 'Locations', LegacyDataverseId, COUNT(*) FROM dbo.Locations WHERE LegacyDataverseId IS NOT NULL GROUP BY LegacyDataverseId HAVING COUNT(*) > 1
UNION ALL SELECT 'Programs', LegacyDataverseId, COUNT(*) FROM dbo.Programs WHERE LegacyDataverseId IS NOT NULL GROUP BY LegacyDataverseId HAVING COUNT(*) > 1
UNION ALL SELECT 'Skillsets', LegacyDataverseId, COUNT(*) FROM dbo.Skillsets WHERE LegacyDataverseId IS NOT NULL GROUP BY LegacyDataverseId HAVING COUNT(*) > 1
UNION ALL SELECT 'ScoringCategories', LegacyDataverseId, COUNT(*) FROM dbo.ScoringCategories WHERE LegacyDataverseId IS NOT NULL GROUP BY LegacyDataverseId HAVING COUNT(*) > 1
UNION ALL SELECT 'People', LegacyDataverseId, COUNT(*) FROM dbo.People WHERE LegacyDataverseId IS NOT NULL GROUP BY LegacyDataverseId HAVING COUNT(*) > 1
UNION ALL SELECT 'Departments', LegacyDataverseId, COUNT(*) FROM dbo.Departments WHERE LegacyDataverseId IS NOT NULL GROUP BY LegacyDataverseId HAVING COUNT(*) > 1
UNION ALL SELECT 'ScoringQuestions', LegacyDataverseId, COUNT(*) FROM dbo.ScoringQuestions WHERE LegacyDataverseId IS NOT NULL GROUP BY LegacyDataverseId HAVING COUNT(*) > 1
UNION ALL SELECT 'Requests', LegacyDataverseId, COUNT(*) FROM dbo.Requests WHERE LegacyDataverseId IS NOT NULL GROUP BY LegacyDataverseId HAVING COUNT(*) > 1
UNION ALL SELECT 'Projects', LegacyDataverseId, COUNT(*) FROM dbo.Projects WHERE LegacyDataverseId IS NOT NULL GROUP BY LegacyDataverseId HAVING COUNT(*) > 1
UNION ALL SELECT 'ScoringAnswers', LegacyDataverseId, COUNT(*) FROM dbo.ScoringAnswers WHERE LegacyDataverseId IS NOT NULL GROUP BY LegacyDataverseId HAVING COUNT(*) > 1
UNION ALL SELECT 'Capacity', LegacyDataverseId, COUNT(*) FROM dbo.Capacity WHERE LegacyDataverseId IS NOT NULL GROUP BY LegacyDataverseId HAVING COUNT(*) > 1
UNION ALL SELECT 'DemandAllocations', LegacyDataverseId, COUNT(*) FROM dbo.DemandAllocations WHERE LegacyDataverseId IS NOT NULL GROUP BY LegacyDataverseId HAVING COUNT(*) > 1;

/* Relationship/orphan checks. */
SELECT 'DemandAllocations without Projects' AS CheckName, COUNT(*) AS FailureCount
FROM dbo.DemandAllocations d LEFT JOIN dbo.Projects p ON p.ProjectId = d.ProjectId WHERE p.ProjectId IS NULL
UNION ALL SELECT 'DemandAllocations with missing People', COUNT(*) FROM dbo.DemandAllocations d WHERE d.PersonId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.People p WHERE p.PersonId = d.PersonId)
UNION ALL SELECT 'Capacity without People', COUNT(*) FROM dbo.Capacity c LEFT JOIN dbo.People p ON p.PersonId = c.PersonId WHERE p.PersonId IS NULL
UNION ALL SELECT 'ScoringQuestions without Categories', COUNT(*) FROM dbo.ScoringQuestions q LEFT JOIN dbo.ScoringCategories c ON c.CategoryId = q.CategoryId WHERE c.CategoryId IS NULL
UNION ALL SELECT 'ScoringAnswers without Requests', COUNT(*) FROM dbo.ScoringAnswers a LEFT JOIN dbo.Requests r ON r.RequestId = a.RequestId WHERE r.RequestId IS NULL
UNION ALL SELECT 'ScoringAnswers without Questions', COUNT(*) FROM dbo.ScoringAnswers a LEFT JOIN dbo.ScoringQuestions q ON q.QuestionId = a.QuestionId WHERE q.QuestionId IS NULL
UNION ALL SELECT 'Projects without Requests where expected', COUNT(*) FROM dbo.Projects p WHERE p.RequestId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.Requests r WHERE r.RequestId = p.RequestId);

/* Weekly child uniqueness and encoded-array coverage. */
SELECT 'Duplicate CapacityWeeks' AS CheckName, COUNT(*) AS FailureCount
FROM (SELECT CapacityId, WeekStartDate FROM dbo.CapacityWeeks GROUP BY CapacityId, WeekStartDate HAVING COUNT(*) > 1) x
UNION ALL SELECT 'Duplicate DemandWeeks', COUNT(*)
FROM (SELECT DemandAllocationId, WeekStartDate FROM dbo.DemandWeeks GROUP BY DemandAllocationId, WeekStartDate HAVING COUNT(*) > 1);
GO
