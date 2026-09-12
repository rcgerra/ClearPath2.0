/* =============================================================================
   ClearPath 2.0 - T-SQL helpers for the 2-digit weekly array format
   Run with:  sqlcmd -S <server> -d ClearPath -i 02_functions.sql
   ============================================================================= */

USE ClearPath;
GO

IF OBJECT_ID('dbo.fnGetWeekValue', 'FN') IS NOT NULL DROP FUNCTION dbo.fnGetWeekValue;
GO
CREATE FUNCTION dbo.fnGetWeekValue (@Encoded VARCHAR(2666), @WeekIndex SMALLINT)
RETURNS TINYINT
AS
BEGIN
    IF @Encoded IS NULL OR @WeekIndex < 0 OR (@WeekIndex * 2) + 2 > LEN(@Encoded)
        RETURN 0;
    RETURN CAST(SUBSTRING(@Encoded, (@WeekIndex * 2) + 1, 2) AS TINYINT);
END;
GO

IF OBJECT_ID('dbo.fnSetWeekValue', 'FN') IS NOT NULL DROP FUNCTION dbo.fnSetWeekValue;
GO
CREATE FUNCTION dbo.fnSetWeekValue (@Encoded VARCHAR(2666), @WeekIndex SMALLINT, @Value TINYINT)
RETURNS VARCHAR(2666)
AS
BEGIN
    DECLARE @Required INT = (@WeekIndex * 2) + 2;
    DECLARE @Work VARCHAR(2666) = ISNULL(@Encoded, '');

    IF LEN(@Work) < @Required
        SET @Work = @Work + REPLICATE('0', @Required - LEN(@Work));

    RETURN STUFF(@Work, (@WeekIndex * 2) + 1, 2, RIGHT('0' + CAST(@Value AS VARCHAR(2)), 2));
END;
GO

IF OBJECT_ID('dbo.fnExpandWeeks', 'IF') IS NOT NULL DROP FUNCTION dbo.fnExpandWeeks;
GO
/* Expands an encoded array into one row per week. */
CREATE FUNCTION dbo.fnExpandWeeks (@Encoded VARCHAR(2666), @MaxWeeks SMALLINT)
RETURNS TABLE
AS
RETURN
(
    WITH Numbers AS (
        SELECT TOP (@MaxWeeks) ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) - 1 AS WeekIndex
        FROM sys.all_objects a CROSS JOIN sys.all_objects b
    )
    SELECT WeekIndex,
           dbo.fnGetWeekValue(@Encoded, WeekIndex) AS Hours
    FROM Numbers
);
GO

IF OBJECT_ID('dbo.fnSumWeeks', 'FN') IS NOT NULL DROP FUNCTION dbo.fnSumWeeks;
GO
CREATE FUNCTION dbo.fnSumWeeks (@Encoded VARCHAR(2666), @StartWeek SMALLINT, @EndWeek SMALLINT)
RETURNS INT
AS
BEGIN
    DECLARE @Total INT = 0;
    SELECT @Total = SUM(Hours)
    FROM dbo.fnExpandWeeks(@Encoded, @EndWeek + 1)
    WHERE WeekIndex BETWEEN @StartWeek AND @EndWeek;
    RETURN ISNULL(@Total, 0);
END;
GO

/* ---------- Reporting views ---------- */

IF OBJECT_ID('dbo.vwPersonWeeklyDemand', 'V') IS NOT NULL DROP VIEW dbo.vwPersonWeeklyDemand;
GO
CREATE VIEW dbo.vwPersonWeeklyDemand
AS
SELECT d.PersonId,
       d.ProjectId,
       w.WeekIndex,
       w.Hours
FROM dbo.FactDemand d
CROSS APPLY dbo.fnExpandWeeks(d.DemandHours, 104) w
WHERE w.Hours > 0;
GO

IF OBJECT_ID('dbo.vwPersonWeeklyAvailability', 'V') IS NOT NULL DROP VIEW dbo.vwPersonWeeklyAvailability;
GO
CREATE VIEW dbo.vwPersonWeeklyAvailability
AS
SELECT a.PersonId,
       a.DepartmentId,
       w.WeekIndex,
       w.Hours
FROM dbo.FactAvailability a
CROSS APPLY dbo.fnExpandWeeks(a.AvailabilityHours, 104) w;
GO

IF OBJECT_ID('dbo.vwPersonWeeklyNet', 'V') IS NOT NULL DROP VIEW dbo.vwPersonWeeklyNet;
GO
CREATE VIEW dbo.vwPersonWeeklyNet
AS
SELECT p.PersonId,
       p.Name,
       p.DepartmentId,
       av.WeekIndex,
       av.Hours AS AvailableHours,
       ISNULL(dm.Hours, 0) AS DemandHours,
       av.Hours - ISNULL(dm.Hours, 0) AS NetHours
FROM dbo.DimPerson p
JOIN dbo.vwPersonWeeklyAvailability av ON av.PersonId = p.PersonId
OUTER APPLY (
    SELECT SUM(d.Hours) AS Hours
    FROM dbo.vwPersonWeeklyDemand d
    WHERE d.PersonId = p.PersonId AND d.WeekIndex = av.WeekIndex
) dm;
GO

IF OBJECT_ID('dbo.vwProjectDemandSummary', 'V') IS NOT NULL DROP VIEW dbo.vwProjectDemandSummary;
GO
CREATE VIEW dbo.vwProjectDemandSummary
AS
SELECT pr.ProjectId,
       pr.Name,
       pr.Status,
       pr.PriorityScore,
       COUNT(DISTINCT d.PersonId) AS TeamSize,
       SUM(dbo.fnSumWeeks(d.DemandHours, 0, 51)) AS DemandHoursNext52Weeks
FROM dbo.DimProject pr
LEFT JOIN dbo.FactDemand d ON d.ProjectId = pr.ProjectId
GROUP BY pr.ProjectId, pr.Name, pr.Status, pr.PriorityScore;
GO
