USE ClearPath;
GO

DECLARE @ImportRunId UNIQUEIDENTIFIER = NULL;

SELECT ImportRunId, StartedDate, CompletedDate, Status,
       RowsRead, RowsImported, RowsFailed, ErrorMessage
FROM dbo.ImportRuns
WHERE @ImportRunId IS NULL OR ImportRunId = @ImportRunId;

SELECT SourceFile, TargetTable, COUNT(*) AS ErrorCount
FROM dbo.ImportErrors
WHERE @ImportRunId IS NULL OR ImportRunId = @ImportRunId
GROUP BY SourceFile, TargetTable
ORDER BY ErrorCount DESC;

SELECT TOP (100) *
FROM dbo.ImportErrors
WHERE @ImportRunId IS NULL OR ImportRunId = @ImportRunId
ORDER BY ImportErrorId;

SELECT 'People' AS CheckName, COUNT(*) AS DuplicateCount
FROM (SELECT LegacyDataverseId FROM dbo.People WHERE LegacyDataverseId IS NOT NULL GROUP BY LegacyDataverseId HAVING COUNT(*) > 1) d
UNION ALL
SELECT 'Projects', COUNT(*)
FROM (SELECT LegacyDataverseId FROM dbo.Projects WHERE LegacyDataverseId IS NOT NULL GROUP BY LegacyDataverseId HAVING COUNT(*) > 1) d;

SELECT d.DemandAllocationId
FROM dbo.DemandAllocations d
LEFT JOIN dbo.Projects p ON p.ProjectId = d.ProjectId
WHERE p.ProjectId IS NULL;

SELECT c.CapacityWeekId
FROM dbo.CapacityWeeks c
LEFT JOIN dbo.Capacity p ON p.CapacityId = c.CapacityId
WHERE p.CapacityId IS NULL;

SELECT d.DemandWeekId
FROM dbo.DemandWeeks d
LEFT JOIN dbo.DemandAllocations a ON a.DemandAllocationId = d.DemandAllocationId
WHERE a.DemandAllocationId IS NULL;

SELECT p.PersonId, p.Name
FROM dbo.People p
LEFT JOIN dbo.DirectoryUsers u ON u.DirectoryUserId = p.DirectoryUserId
WHERE p.DirectoryUserId IS NULL;

SELECT a.ProjectId, d.DemandAllocationId, d.WeekStartDate, COUNT(*) AS DuplicateRows
FROM dbo.DemandWeeks d
JOIN dbo.DemandAllocations a ON a.DemandAllocationId = d.DemandAllocationId
GROUP BY a.ProjectId, d.DemandAllocationId, d.WeekStartDate
HAVING COUNT(*) > 1;
GO