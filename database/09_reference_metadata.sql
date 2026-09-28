IF OBJECT_ID(N'dbo.ReferenceMetadata', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ReferenceMetadata (
        TableName NVARCHAR(40) NOT NULL,
        RecordId NVARCHAR(36) NOT NULL,
        SiteId NVARCHAR(36) NULL,
        Location NVARCHAR(200) NULL,
        LeadPersonId NVARCHAR(36) NULL,
        SponsorPersonId NVARCHAR(36) NULL,
        AssistantLeadPersonIds NVARCHAR(MAX) NULL,
        MissionStatement NVARCHAR(4000) NULL,
        CONSTRAINT PK_ReferenceMetadata PRIMARY KEY (TableName, RecordId)
    );
END;

IF COL_LENGTH('dbo.ReferenceMetadata', 'Location') IS NULL
    ALTER TABLE dbo.ReferenceMetadata ADD Location NVARCHAR(200) NULL;