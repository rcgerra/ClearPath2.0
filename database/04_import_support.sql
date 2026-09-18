USE ClearPath;
GO

IF OBJECT_ID('dbo.ImportRuns', 'U') IS NULL
CREATE TABLE dbo.ImportRuns
(
    ImportRunId UNIQUEIDENTIFIER NOT NULL,
    StartedDate DATETIME2(3) NOT NULL,
    CompletedDate DATETIME2(3) NULL,
    SourceDirectory NVARCHAR(1000) NOT NULL,
    Status NVARCHAR(30) NOT NULL,
    RowsRead INT NOT NULL DEFAULT 0,
    RowsImported INT NOT NULL DEFAULT 0,
    RowsFailed INT NOT NULL DEFAULT 0,
    ErrorMessage NVARCHAR(MAX) NULL,
    CONSTRAINT PK_ImportRuns PRIMARY KEY (ImportRunId)
);
GO

IF OBJECT_ID('dbo.ImportErrors', 'U') IS NULL
CREATE TABLE dbo.ImportErrors
(
    ImportErrorId BIGINT IDENTITY(1,1) NOT NULL,
    ImportRunId UNIQUEIDENTIFIER NOT NULL,
    SourceFile NVARCHAR(260) NOT NULL,
    TargetTable NVARCHAR(128) NULL,
    SourceRowNumber INT NULL,
    LegacyDataverseId UNIQUEIDENTIFIER NULL,
    ErrorMessage NVARCHAR(MAX) NOT NULL,
    RawRow NVARCHAR(MAX) NULL,
    CreatedDate DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_ImportErrors PRIMARY KEY (ImportErrorId),
    CONSTRAINT FK_ImportErrors_Run FOREIGN KEY (ImportRunId)
        REFERENCES dbo.ImportRuns(ImportRunId) ON DELETE CASCADE
);
GO

CREATE INDEX IX_ImportErrors_Run ON dbo.ImportErrors(ImportRunId, SourceFile);
GO