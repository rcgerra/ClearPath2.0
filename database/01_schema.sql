/* =============================================================================
   ClearPath 2.0 - SQL Server reporting mirror (star schema)
   Dataverse (MBO-Staffing-Model) remains the system of record. This database is
   an optional analytics mirror populated from the Dataverse tables.
   Run with:  sqlcmd -S <server> -d master -i 01_schema.sql
   ============================================================================= */

IF DB_ID('ClearPath') IS NULL
    CREATE DATABASE ClearPath;
GO

USE ClearPath;
GO

/* ---------- Dimensions ---------- */

IF OBJECT_ID('dbo.DimUser', 'U') IS NULL
CREATE TABLE dbo.DimUser (
    UserKey            INT IDENTITY(1,1) PRIMARY KEY,
    SystemUserId       UNIQUEIDENTIFIER NOT NULL UNIQUE,   -- systemuser (read-only source)
    FullName           NVARCHAR(200) NOT NULL,
    Email              NVARCHAR(320) NULL,
    JobTitle           NVARCHAR(200) NULL,
    IsDisabled         BIT NOT NULL DEFAULT 0,
    SyncedOn           DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF OBJECT_ID('dbo.DimDepartment', 'U') IS NULL
CREATE TABLE dbo.DimDepartment (
    DepartmentKey      INT IDENTITY(1,1) PRIMARY KEY,
    DepartmentId       UNIQUEIDENTIFIER NOT NULL UNIQUE,   -- new_department
    Name               NVARCHAR(200) NOT NULL,
    Code               NVARCHAR(50) NULL,
    LeadPersonId       UNIQUEIDENTIFIER NULL,
    IsActive           BIT NOT NULL DEFAULT 1
);
GO

IF OBJECT_ID('dbo.DimFunction', 'U') IS NULL
CREATE TABLE dbo.DimFunction (
    FunctionKey        INT IDENTITY(1,1) PRIMARY KEY,
    FunctionId         UNIQUEIDENTIFIER NOT NULL UNIQUE,   -- new_functions
    Name               NVARCHAR(200) NOT NULL,
    Code               NVARCHAR(50) NULL,
    DepartmentId       UNIQUEIDENTIFIER NULL
);
GO

IF OBJECT_ID('dbo.DimPerson', 'U') IS NULL
CREATE TABLE dbo.DimPerson (
    PersonKey          INT IDENTITY(1,1) PRIMARY KEY,
    PersonId           UNIQUEIDENTIFIER NOT NULL UNIQUE,   -- new_people
    SystemUserId       UNIQUEIDENTIFIER NULL,
    Name               NVARCHAR(200) NOT NULL,
    Email              NVARCHAR(320) NULL,
    RoleNames          NVARCHAR(200) NULL,                 -- admin;availability_moderator;demand_moderator;user
    Title              NVARCHAR(200) NULL,
    DepartmentId       UNIQUEIDENTIFIER NULL,
    FunctionId         UNIQUEIDENTIFIER NULL,
    WeeklyHours        TINYINT NULL,
    FtePercent         DECIMAL(5,2) NULL,
    IsActive           BIT NOT NULL DEFAULT 1
);
GO

IF OBJECT_ID('dbo.DimProject', 'U') IS NULL
CREATE TABLE dbo.DimProject (
    ProjectKey         INT IDENTITY(1,1) PRIMARY KEY,
    ProjectId          UNIQUEIDENTIFIER NOT NULL UNIQUE,   -- new_projects
    Name               NVARCHAR(200) NOT NULL,
    Code               NVARCHAR(50) NULL,
    ProblemStatement   NVARCHAR(MAX) NULL,
    Status             NVARCHAR(100) NULL,
    PriorityScore      DECIMAL(9,2) NULL,
    StartDate          DATE NULL,
    EndDate            DATE NULL,
    ManagerPersonId    UNIQUEIDENTIFIER NULL,
    DepartmentId       UNIQUEIDENTIFIER NULL,
    RequestId          UNIQUEIDENTIFIER NULL
);
GO

IF OBJECT_ID('dbo.DimWeek', 'U') IS NULL
CREATE TABLE dbo.DimWeek (
    WeekIndex          SMALLINT PRIMARY KEY,               -- 0-based position in the encoded array
    WeekStartDate      DATE NOT NULL,
    IsoYear            SMALLINT NOT NULL,
    IsoWeek            TINYINT NOT NULL
);
GO

IF OBJECT_ID('dbo.DimNonProjectDemandCategory', 'U') IS NULL
CREATE TABLE dbo.DimNonProjectDemandCategory (
    CategoryId         UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    Name               NVARCHAR(200) NOT NULL UNIQUE,
    IsActive           BIT NOT NULL DEFAULT 1,
    CreatedOn          DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedOn          DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF COL_LENGTH('dbo.DimNonProjectDemandCategory', 'Examples') IS NOT NULL
    ALTER TABLE dbo.DimNonProjectDemandCategory DROP COLUMN Examples;
GO

MERGE dbo.DimNonProjectDemandCategory AS target
USING (VALUES
    ('c1000001-0000-4000-8000-000000000001', N'Production Support'),
    ('c1000002-0000-4000-8000-000000000002', N'Administrative / Development'),
    ('c1000003-0000-4000-8000-000000000003', N'Testing / Lab Support'),
    ('c1000004-0000-4000-8000-000000000004', N'Engineering & Technical Support'),
    ('c1000005-0000-4000-8000-000000000005', N'Operational Services'),
    ('c1000006-0000-4000-8000-000000000006', N'CI / Optimization'),
    ('c1000007-0000-4000-8000-000000000007', N'Quality'),
    ('c1000008-0000-4000-8000-000000000008', N'EHS'),
    ('c1000009-0000-4000-8000-000000000009', N'Just Do Its'),
    ('c1000010-0000-4000-8000-000000000010', N'Functional Projects'),
    ('c1000011-0000-4000-8000-000000000011', N'SPOT Projects')
) AS source (CategoryId, Name)
ON target.CategoryId = source.CategoryId
WHEN NOT MATCHED THEN
    INSERT (CategoryId, Name) VALUES (source.CategoryId, source.Name)
WHEN MATCHED THEN
    UPDATE SET Name = source.Name, UpdatedOn = SYSUTCDATETIME();
GO

IF OBJECT_ID('dbo.DimNonProjectDemandSubcategory', 'U') IS NULL
CREATE TABLE dbo.DimNonProjectDemandSubcategory (
    SubcategoryId      UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    CategoryId         UNIQUEIDENTIFIER NOT NULL,
    Name               NVARCHAR(200) NOT NULL,
    IsActive           BIT NOT NULL DEFAULT 1,
    CreatedByPersonId  UNIQUEIDENTIFIER NULL,
    CreatedOn          DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedOn          DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_NonProjectDemandSubcategory_Category FOREIGN KEY (CategoryId)
        REFERENCES dbo.DimNonProjectDemandCategory (CategoryId),
    CONSTRAINT UQ_NonProjectDemandSubcategory UNIQUE (CategoryId, Name)
);
GO

MERGE dbo.DimNonProjectDemandSubcategory AS target
USING (VALUES
    ('c2000001-0000-4000-8000-000000000001', 'c1000001-0000-4000-8000-000000000001', N'Batch Execution'),
    ('c2000002-0000-4000-8000-000000000002', 'c1000001-0000-4000-8000-000000000001', N'Manufacturing Operations'),
    ('c2000003-0000-4000-8000-000000000003', 'c1000001-0000-4000-8000-000000000001', N'Floor Support'),
    ('c2000004-0000-4000-8000-000000000004', 'c1000001-0000-4000-8000-000000000001', N'Troubleshooting'),
    ('c2000005-0000-4000-8000-000000000005', 'c1000001-0000-4000-8000-000000000001', N'Production Scheduling'),
    ('c2000006-0000-4000-8000-000000000006', 'c1000001-0000-4000-8000-000000000001', N'MPS Support'),
    ('c2000007-0000-4000-8000-000000000007', 'c1000001-0000-4000-8000-000000000001', N'Material/Supply'),
    ('c2000008-0000-4000-8000-000000000008', 'c1000002-0000-4000-8000-000000000002', N'Tier Board Support'),
    ('c2000009-0000-4000-8000-000000000009', 'c1000002-0000-4000-8000-000000000002', N'Governance'),
    ('c2000010-0000-4000-8000-000000000010', 'c1000002-0000-4000-8000-000000000002', N'Reporting/KPI tracking'),
    ('c2000011-0000-4000-8000-000000000011', 'c1000002-0000-4000-8000-000000000002', N'Meetings'),
    ('c2000012-0000-4000-8000-000000000012', 'c1000002-0000-4000-8000-000000000002', N'Training/Upskilling'),
    ('c2000013-0000-4000-8000-000000000013', 'c1000002-0000-4000-8000-000000000002', N'Time Off'),
    ('c2000014-0000-4000-8000-000000000014', 'c1000002-0000-4000-8000-000000000002', N'Development activities'),
    ('c2000015-0000-4000-8000-000000000015', 'c1000003-0000-4000-8000-000000000003', N'QC & Sample Testing'),
    ('c2000016-0000-4000-8000-000000000016', 'c1000003-0000-4000-8000-000000000003', N'Method Development'),
    ('c2000017-0000-4000-8000-000000000017', 'c1000003-0000-4000-8000-000000000003', N'Analytical/Lab Support'),
    ('c2000018-0000-4000-8000-000000000018', 'c1000003-0000-4000-8000-000000000003', N'Stability/Environmental'),
    ('c2000019-0000-4000-8000-000000000019', 'c1000003-0000-4000-8000-000000000003', N'QA Batch Review'),
    ('c2000020-0000-4000-8000-000000000020', 'c1000004-0000-4000-8000-000000000004', N'Preventative/Corrective Maintenance'),
    ('c2000021-0000-4000-8000-000000000021', 'c1000004-0000-4000-8000-000000000004', N'Work Orders'),
    ('c2000022-0000-4000-8000-000000000022', 'c1000004-0000-4000-8000-000000000004', N'Equipment Troubleshooting'),
    ('c2000023-0000-4000-8000-000000000023', 'c1000004-0000-4000-8000-000000000004', N'Break/Fix'),
    ('c2000024-0000-4000-8000-000000000024', 'c1000004-0000-4000-8000-000000000004', N'Validation Maintenance'),
    ('c2000025-0000-4000-8000-000000000025', 'c1000004-0000-4000-8000-000000000004', N'Qualification'),
    ('c2000026-0000-4000-8000-000000000026', 'c1000004-0000-4000-8000-000000000004', N'Feasibility Assessments'),
    ('c2000027-0000-4000-8000-000000000027', 'c1000004-0000-4000-8000-000000000004', N'Ad Hoc SME Support'),
    ('c2000028-0000-4000-8000-000000000028', 'c1000005-0000-4000-8000-000000000005', N'Manufacturing Sciences Floor Support'),
    ('c2000029-0000-4000-8000-000000000029', 'c1000005-0000-4000-8000-000000000005', N'Material Qualification / Suppliers'),
    ('c2000030-0000-4000-8000-000000000030', 'c1000005-0000-4000-8000-000000000005', N'Regulatory Request'),
    ('c2000031-0000-4000-8000-000000000031', 'c1000005-0000-4000-8000-000000000005', N'Document Revisions'),
    ('c2000032-0000-4000-8000-000000000032', 'c1000006-0000-4000-8000-000000000006', N'CI Initiatives'),
    ('c2000033-0000-4000-8000-000000000033', 'c1000006-0000-4000-8000-000000000006', N'Process Improvements'),
    ('c2000034-0000-4000-8000-000000000034', 'c1000006-0000-4000-8000-000000000006', N'Cost Reductions'),
    ('c2000035-0000-4000-8000-000000000035', 'c1000006-0000-4000-8000-000000000006', N'Yield Improvements'),
    ('c2000036-0000-4000-8000-000000000036', 'c1000006-0000-4000-8000-000000000006', N'AOS Maturity'),
    ('c2000037-0000-4000-8000-000000000037', 'c1000006-0000-4000-8000-000000000006', N'Waste Reduction'),
    ('c2000038-0000-4000-8000-000000000038', 'c1000007-0000-4000-8000-000000000007', N'Non-Project Change Controls'),
    ('c2000039-0000-4000-8000-000000000039', 'c1000007-0000-4000-8000-000000000007', N'CAPAs'),
    ('c2000040-0000-4000-8000-000000000040', 'c1000007-0000-4000-8000-000000000007', N'Investigations'),
    ('c2000041-0000-4000-8000-000000000041', 'c1000007-0000-4000-8000-000000000007', N'Deviations'),
    ('c2000042-0000-4000-8000-000000000042', 'c1000007-0000-4000-8000-000000000007', N'Agency Commitments'),
    ('c2000043-0000-4000-8000-000000000043', 'c1000007-0000-4000-8000-000000000007', N'Regulatory Audits'),
    ('c2000044-0000-4000-8000-000000000044', 'c1000008-0000-4000-8000-000000000008', N'EHS CAPAs'),
    ('c2000045-0000-4000-8000-000000000045', 'c1000008-0000-4000-8000-000000000008', N'Environmental Compliance'),
    ('c2000046-0000-4000-8000-000000000046', 'c1000009-0000-4000-8000-000000000009', N'BetterWay'),
    ('c2000047-0000-4000-8000-000000000047', 'c1000009-0000-4000-8000-000000000009', N'Minor Document Updates'),
    ('c2000048-0000-4000-8000-000000000048', 'c1000009-0000-4000-8000-000000000009', N'Quick Wins'),
    ('c2000049-0000-4000-8000-000000000049', 'c1000010-0000-4000-8000-000000000010', N'Automation Improvements'),
    ('c2000050-0000-4000-8000-000000000050', 'c1000011-0000-4000-8000-000000000011', N'Tech Transfers'),
    ('c2000051-0000-4000-8000-000000000051', 'c1000011-0000-4000-8000-000000000011', N'Asset Replacements'),
    ('c2000052-0000-4000-8000-000000000052', 'c1000011-0000-4000-8000-000000000011', N'Building Modifications'),
    ('c2000053-0000-4000-8000-000000000053', 'c1000011-0000-4000-8000-000000000011', N'Automation Systems')
) AS source (SubcategoryId, CategoryId, Name)
ON target.SubcategoryId = source.SubcategoryId
WHEN NOT MATCHED THEN
    INSERT (SubcategoryId, CategoryId, Name) VALUES (source.SubcategoryId, source.CategoryId, source.Name)
WHEN MATCHED THEN
    UPDATE SET CategoryId = source.CategoryId, Name = source.Name, UpdatedOn = SYSUTCDATETIME();
GO

/* ---------- Central fact-adjacent table ---------- */

IF OBJECT_ID('dbo.FactRequest', 'U') IS NULL
CREATE TABLE dbo.FactRequest (
    RequestKey         INT IDENTITY(1,1) PRIMARY KEY,
    RequestId          UNIQUEIDENTIFIER NOT NULL UNIQUE,   -- cr714_requests
    Title              NVARCHAR(200) NOT NULL,
    ProblemStatement   NVARCHAR(MAX) NULL,
    BusinessCase       NVARCHAR(MAX) NULL,
    ExpectedBenefit    NVARCHAR(MAX) NULL,
    Status             NVARCHAR(100) NULL,
    SubmittedOn        DATETIME2(0) NULL,
    RequesterPersonId  UNIQUEIDENTIFIER NULL,
    DepartmentId       UNIQUEIDENTIFIER NULL,
    CategoryId         UNIQUEIDENTIFIER NULL,
    PriorityScore      DECIMAL(9,2) NULL,
    ProjectId          UNIQUEIDENTIFIER NULL
);
GO

/* ---------- Facts: encoded weekly arrays ---------- */
/* 1333 positions * 2 digits = 2666 characters. */

IF OBJECT_ID('dbo.FactAvailability', 'U') IS NULL
CREATE TABLE dbo.FactAvailability (
    AvailabilityKey    INT IDENTITY(1,1) PRIMARY KEY,
    CapacityId         UNIQUEIDENTIFIER NOT NULL UNIQUE,   -- new_capacity
    PersonId           UNIQUEIDENTIFIER NOT NULL,
    DepartmentId       UNIQUEIDENTIFIER NULL,
    AvailabilityHours  VARCHAR(2666) NOT NULL DEFAULT '',
    WeeklyBaseline     TINYINT NULL,
    UpdatedOn          DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_FactAvailability_Digits CHECK (AvailabilityHours NOT LIKE '%[^0-9]%')
);
GO

IF OBJECT_ID('dbo.FactDemand', 'U') IS NULL
CREATE TABLE dbo.FactDemand (
    DemandKey          INT IDENTITY(1,1) PRIMARY KEY,
    DemandId           UNIQUEIDENTIFIER NOT NULL UNIQUE,   -- new_demand
    ProjectId          UNIQUEIDENTIFIER NOT NULL,
    PersonId           UNIQUEIDENTIFIER NULL,
    FunctionId         UNIQUEIDENTIFIER NULL,
    DemandHours        VARCHAR(2666) NOT NULL DEFAULT '',
    StartWeek          SMALLINT NULL,
    EndWeek            SMALLINT NULL,
    Status             NVARCHAR(100) NULL,
    UpdatedOn          DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_FactDemand_Digits CHECK (DemandHours NOT LIKE '%[^0-9]%')
);
GO

IF OBJECT_ID('dbo.FactNonProjectDemand', 'U') IS NULL
CREATE TABLE dbo.FactNonProjectDemand (
    NonProjectDemandId UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    CategoryId         UNIQUEIDENTIFIER NOT NULL,
    SubcategoryId      UNIQUEIDENTIFIER NULL,
    PersonId           UNIQUEIDENTIFIER NOT NULL,
    DepartmentId       UNIQUEIDENTIFIER NULL,
    DemandHours        VARCHAR(2666) NOT NULL DEFAULT REPLICATE('00', 1333),
    CreatedOn          DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedOn          DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_NonProjectDemand_Category FOREIGN KEY (CategoryId)
        REFERENCES dbo.DimNonProjectDemandCategory (CategoryId),
    CONSTRAINT FK_NonProjectDemand_Subcategory FOREIGN KEY (SubcategoryId)
        REFERENCES dbo.DimNonProjectDemandSubcategory (SubcategoryId),
    CONSTRAINT CK_NonProjectDemand_Length CHECK (LEN(DemandHours) = 2666),
    CONSTRAINT CK_NonProjectDemand_Digits CHECK (DemandHours NOT LIKE '%[^0-9]%')
);
GO

IF COL_LENGTH('dbo.FactNonProjectDemand', 'SubcategoryId') IS NULL
    ALTER TABLE dbo.FactNonProjectDemand ADD SubcategoryId UNIQUEIDENTIFIER NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_NonProjectDemand_Subcategory')
    ALTER TABLE dbo.FactNonProjectDemand ADD CONSTRAINT FK_NonProjectDemand_Subcategory
        FOREIGN KEY (SubcategoryId) REFERENCES dbo.DimNonProjectDemandSubcategory (SubcategoryId);
GO

IF EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = 'UQ_NonProjectDemand_PersonCategory')
    ALTER TABLE dbo.FactNonProjectDemand DROP CONSTRAINT UQ_NonProjectDemand_PersonCategory;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_NonProjectDemand_PersonSubcategory')
    CREATE UNIQUE INDEX UQ_NonProjectDemand_PersonSubcategory
        ON dbo.FactNonProjectDemand (PersonId, SubcategoryId)
        WHERE SubcategoryId IS NOT NULL;
GO

/* ---------- Prioritization ---------- */

IF OBJECT_ID('dbo.DimCategory', 'U') IS NULL
CREATE TABLE dbo.DimCategory (
    CategoryKey        INT IDENTITY(1,1) PRIMARY KEY,
    CategoryId         UNIQUEIDENTIFIER NOT NULL UNIQUE,   -- cr714_categories
    Name               NVARCHAR(200) NOT NULL,
    Weight             DECIMAL(6,2) NULL
);
GO

IF OBJECT_ID('dbo.DimQuestion', 'U') IS NULL
CREATE TABLE dbo.DimQuestion (
    QuestionKey        INT IDENTITY(1,1) PRIMARY KEY,
    QuestionId         UNIQUEIDENTIFIER NOT NULL UNIQUE,   -- cr714_questions
    QuestionText       NVARCHAR(2000) NOT NULL,
    CategoryId         UNIQUEIDENTIFIER NULL,
    Weight             DECIMAL(6,2) NOT NULL DEFAULT 1,
    Sequence           SMALLINT NOT NULL DEFAULT 0,
    AnswerType         NVARCHAR(50) NOT NULL DEFAULT 'score',
    IsActive           BIT NOT NULL DEFAULT 1
);
GO

IF OBJECT_ID('dbo.FactAnswer', 'U') IS NULL
CREATE TABLE dbo.FactAnswer (
    AnswerKey          INT IDENTITY(1,1) PRIMARY KEY,
    AnswerId           UNIQUEIDENTIFIER NOT NULL UNIQUE,   -- cr714_answers
    QuestionId         UNIQUEIDENTIFIER NOT NULL,
    RequestId          UNIQUEIDENTIFIER NOT NULL,
    AnswerValue        NVARCHAR(2000) NULL,
    Score              DECIMAL(6,2) NULL,
    Comment            NVARCHAR(2000) NULL,
    CONSTRAINT UQ_FactAnswer UNIQUE (QuestionId, RequestId)
);
GO

/* ---------- Indexes ---------- */

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_DimPerson_Department')
    CREATE INDEX IX_DimPerson_Department ON dbo.DimPerson (DepartmentId) INCLUDE (Name, FunctionId);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_FactDemand_Project')
    CREATE INDEX IX_FactDemand_Project ON dbo.FactDemand (ProjectId) INCLUDE (PersonId, DemandHours);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_FactDemand_Person')
    CREATE INDEX IX_FactDemand_Person ON dbo.FactDemand (PersonId) INCLUDE (ProjectId, DemandHours);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_NonProjectDemand_Person')
    CREATE INDEX IX_NonProjectDemand_Person ON dbo.FactNonProjectDemand (PersonId) INCLUDE (CategoryId, SubcategoryId, DepartmentId, DemandHours);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_NonProjectDemand_Department')
    CREATE INDEX IX_NonProjectDemand_Department ON dbo.FactNonProjectDemand (DepartmentId) INCLUDE (PersonId, CategoryId, DemandHours);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_FactAvailability_Person')
    CREATE INDEX IX_FactAvailability_Person ON dbo.FactAvailability (PersonId) INCLUDE (AvailabilityHours);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_FactRequest_Priority')
    CREATE INDEX IX_FactRequest_Priority ON dbo.FactRequest (PriorityScore DESC) INCLUDE (Title, Status);
GO
