/* Governance workflow support: project type reference data and per-request stage records. */

IF OBJECT_ID(N'dbo.ProjectTypes', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ProjectTypes (
        ProjectTypeId     INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        LegacyDataverseId UNIQUEIDENTIFIER NULL,
        Name              NVARCHAR(200) NOT NULL,
        Description       NVARCHAR(1000) NULL,
        SortOrder         INT NOT NULL DEFAULT 0,
        IsActive          BIT NOT NULL DEFAULT 1,
        CreatedDate       DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
        ModifiedDate      DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME()
    );
END;

MERGE dbo.ProjectTypes AS target
USING (VALUES
    (N'Non-Project', 1),
    (N'Just Do It', 2),
    (N'Functional Project', 3),
    (N'SPOT Light Project', 4),
    (N'SPOT Standard Project', 5)
) AS source (Name, SortOrder)
    ON target.Name = source.Name
WHEN NOT MATCHED BY TARGET THEN
    INSERT (Name, SortOrder) VALUES (source.Name, source.SortOrder);

IF OBJECT_ID(N'dbo.RequestGovernance', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.RequestGovernance (
        RequestId         NVARCHAR(36) NOT NULL PRIMARY KEY,
        ProgramId         NVARCHAR(36) NULL,
        ProjectType       NVARCHAR(200) NULL,
        DqComment         NVARCHAR(MAX) NULL,
        PirtComment       NVARCHAR(MAX) NULL,
        Sg1Comment        NVARCHAR(MAX) NULL,
        CreationComment   NVARCHAR(MAX) NULL,
        FileshareReady    BIT NOT NULL DEFAULT 0,
        SpotRecordCreated BIT NOT NULL DEFAULT 0,
        Cancelled         BIT NOT NULL DEFAULT 0,
        ModifiedDate      DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME()
    );
END;
