IF OBJECT_ID(N'dbo.RequestWorkflowCompletions', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.RequestWorkflowCompletions (
    RequestId INT NOT NULL,
    Stage NVARCHAR(100) NOT NULL,
    CompletedAt DATETIME2(3) NOT NULL,
    CONSTRAINT PK_RequestWorkflowCompletions PRIMARY KEY (RequestId, Stage)
  );
END;