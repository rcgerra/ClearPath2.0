USE ClearPath;
GO

-- Temporary SQL user source populated from People.csv.
-- Future migration: replace this table with Microsoft Entra ID-backed identity
-- synchronization and store the Entra object ID as the external identity key.
IF OBJECT_ID('dbo.Users', 'U') IS NULL
CREATE TABLE dbo.Users
(
    UserId INT IDENTITY(1,1) NOT NULL,
    LegacyDataverseId UNIQUEIDENTIFIER NULL,
    DisplayName NVARCHAR(200) NOT NULL,
    Email NVARCHAR(320) NULL,
    Title NVARCHAR(200) NULL,
    Department NVARCHAR(200) NULL,
    Manager NVARCHAR(200) NULL,
    Location NVARCHAR(200) NULL,
    IsActive BIT NOT NULL CONSTRAINT DF_Users_IsActive DEFAULT 1,
    CreatedDate DATETIME2(3) NOT NULL CONSTRAINT DF_Users_CreatedDate DEFAULT SYSUTCDATETIME(),
    ModifiedDate DATETIME2(3) NOT NULL CONSTRAINT DF_Users_ModifiedDate DEFAULT SYSUTCDATETIME(),

    CONSTRAINT PK_Users PRIMARY KEY (UserId)
);
GO

CREATE UNIQUE INDEX UX_Users_LegacyDataverseId
    ON dbo.Users(LegacyDataverseId)
    WHERE LegacyDataverseId IS NOT NULL;
GO

CREATE INDEX IX_Users_DisplayName
    ON dbo.Users(DisplayName, IsActive);
GO

CREATE INDEX IX_Users_Email
    ON dbo.Users(Email)
    WHERE Email IS NOT NULL;
GO
