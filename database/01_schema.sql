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
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_FactAvailability_Person')
    CREATE INDEX IX_FactAvailability_Person ON dbo.FactAvailability (PersonId) INCLUDE (AvailabilityHours);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_FactRequest_Priority')
    CREATE INDEX IX_FactRequest_Priority ON dbo.FactRequest (PriorityScore DESC) INCLUDE (Title, Status);
GO
