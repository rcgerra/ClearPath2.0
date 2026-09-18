import { AuditedEntity, LegacyEntity, LegacyEntityInput, WeekValue } from './common';

export interface DirectoryUser extends LegacyEntity {
  DirectoryUserId: number;
  AzureAdObjectId: string | null;
  Email: string | null;
  DisplayName: string;
  JobTitle: string | null;
  IsDisabled: boolean;
}

export interface DirectoryUserInput extends LegacyEntityInput {
  AzureAdObjectId?: string | null;
  Email?: string | null;
  DisplayName: string;
  JobTitle?: string | null;
  IsDisabled?: boolean;
}

export interface FunctionEntity extends LegacyEntity {
  FunctionId: number;
  Abbreviation: string | null;
  Name: string;
}

export interface FunctionInput extends LegacyEntityInput {
  Abbreviation?: string | null;
  Name: string;
}

export interface Site extends LegacyEntity {
  SiteId: number;
  Abbreviation: string | null;
  Name: string;
}

export interface SiteInput extends LegacyEntityInput {
  Abbreviation?: string | null;
  Name: string;
}

export interface Location extends LegacyEntity {
  LocationId: number;
  Abbreviation: string | null;
  Name: string;
}

export interface LocationInput extends LegacyEntityInput {
  Abbreviation?: string | null;
  Name: string;
}

export interface Program extends LegacyEntity {
  ProgramId: number;
  Abbreviation: string | null;
  Name: string;
  LongName: string | null;
  Purpose: string | null;
  Subprogram: string | null;
}

export interface ProgramInput extends LegacyEntityInput {
  Abbreviation?: string | null;
  Name: string;
  LongName?: string | null;
  Purpose?: string | null;
  Subprogram?: string | null;
}

export interface Skillset extends LegacyEntity {
  SkillsetId: number;
  Name: string;
  Description: string | null;
}

export interface SkillsetInput extends LegacyEntityInput {
  Name: string;
  Description?: string | null;
}

export interface Department extends LegacyEntity {
  DepartmentId: number;
  FunctionId: number | null;
  DepartmentLeadUserId: number | null;
  Name: string;
  Code: string | null;
  SiteName: string | null;
}

export interface DepartmentInput extends LegacyEntityInput {
  FunctionId?: number | null;
  DepartmentLeadUserId?: number | null;
  Name: string;
  Code?: string | null;
  SiteName?: string | null;
}

export interface Person extends LegacyEntity {
  PersonId: number;
  DepartmentId: number | null;
  DirectoryUserId: number | null;
  Name: string;
  EmployeeTypeCode: string | null;
  LeadNote: string | null;
  WeeklyHours: number | null;
  FtePercent: number | null;
}

export interface PersonInput extends LegacyEntityInput {
  DepartmentId?: number | null;
  DirectoryUserId?: number | null;
  Name: string;
  EmployeeTypeCode?: string | null;
  LeadNote?: string | null;
  WeeklyHours?: number | null;
  FtePercent?: number | null;
}

export interface PersonSkillset {
  PersonId: number;
  SkillsetId: number;
  CreatedDate: Date;
  ModifiedDate: Date;
}

export interface PersonSkillsetInput {
  PersonId: number;
  SkillsetId: number;
}

export interface DepartmentDelegate {
  DepartmentId: number;
  DirectoryUserId: number;
  CreatedDate: Date;
  ModifiedDate: Date;
}

export interface DepartmentDelegateInput {
  DepartmentId: number;
  DirectoryUserId: number;
}

export interface Request extends LegacyEntity {
  RequestId: number;
  ProgramId: number | null;
  SponsorUserId: number | null;
  RequesterPersonId: number | null;
  DelegatePersonId: number | null;
  DepartmentId: number | null;
  CategoryId: number | null;
  ProjectId: number | null;
  Name: string;
  Title: string | null;
  ShortTitle: string | null;
  SpotId: string | null;
  Phase: string | null;
  ProblemStatement: string | null;
  BusinessCase: string | null;
  ExpectedBenefit: string | null;
  CurrentState: string | null;
  DesiredFutureState: string | null;
  AdditionalInformation: string | null;
  Impact: string | null;
  HowDiscovered: string | null;
  Disposition: string | null;
  Status: string | null;
  SubmittedOn: Date | null;
  PriorityScore: number | null;
  ProjectType: string | null;
  WorkflowStep: string | null;
  WhenNeeded: string | null;
  WhenNeededJustification: string | null;
  SponsorNameFlat: string | null;
}

export interface RequestInput extends LegacyEntityInput {
  ProgramId?: number | null;
  SponsorUserId?: number | null;
  RequesterPersonId?: number | null;
  DelegatePersonId?: number | null;
  DepartmentId?: number | null;
  CategoryId?: number | null;
  ProjectId?: number | null;
  Name: string;
  Title?: string | null;
  ShortTitle?: string | null;
  SpotId?: string | null;
  Phase?: string | null;
  ProblemStatement?: string | null;
  BusinessCase?: string | null;
  ExpectedBenefit?: string | null;
  CurrentState?: string | null;
  DesiredFutureState?: string | null;
  AdditionalInformation?: string | null;
  Impact?: string | null;
  HowDiscovered?: string | null;
  Disposition?: string | null;
  Status?: string | null;
  SubmittedOn?: Date | null;
  PriorityScore?: number | null;
  IsActive?: boolean;
  ProjectType?: string | null;
  WorkflowStep?: string | null;
  WhenNeeded?: string | null;
  WhenNeededJustification?: string | null;
  SponsorNameFlat?: string | null;
}

export interface Project extends LegacyEntity {
  ProjectId: number;
  RequestId: number | null;
  SiteId: number | null;
  ProgramId: number | null;
  DepartmentId: number | null;
  ProjectManagerUserId: number | null;
  SponsorUserId: number | null;
  DelegateUserId: number | null;
  Name: string;
  Code: string | null;
  SpotId: string | null;
  Description: string | null;
  ProblemStatement: string | null;
  StatusCode: string | null;
  MustDo: boolean | null;
  Started: boolean | null;
  PriorityScore: number | null;
  StartDate: string | null;
  EndDate: string | null;
  LastCheckIn: string | null;
  LastUpdatedDate: Date | null;
}

export interface ProjectInput extends LegacyEntityInput {
  RequestId?: number | null;
  SiteId?: number | null;
  ProgramId?: number | null;
  DepartmentId?: number | null;
  ProjectManagerUserId?: number | null;
  SponsorUserId?: number | null;
  DelegateUserId?: number | null;
  Name: string;
  Code?: string | null;
  SpotId?: string | null;
  Description?: string | null;
  IsActive?: boolean;
  ProblemStatement?: string | null;
  StatusCode?: string | null;
  MustDo?: boolean | null;
  Started?: boolean | null;
  PriorityScore?: number | null;
  StartDate?: string | null;
  EndDate?: string | null;
  LastCheckIn?: string | null;
  LastUpdatedDate?: Date | null;
}

export interface ProjectDelegate {
  ProjectId: number;
  DirectoryUserId: number;
  CreatedDate: Date;
  ModifiedDate: Date;
}

export interface ProjectDelegateInput {
  ProjectId: number;
  DirectoryUserId: number;
}

export interface RequestLocation {
  RequestId: number;
  LocationId: number;
  CreatedDate: Date;
  ModifiedDate: Date;
}

export interface RequestLocationInput {
  RequestId: number;
  LocationId: number;
}

export interface ScoringCategory extends LegacyEntity {
  CategoryId: number;
  Name: string;
  CategoryType: string;
  CategoryWeight: number | null;
  Notes: string | null;
}

export interface ScoringCategoryInput extends LegacyEntityInput {
  Name: string;
  CategoryType: string;
  CategoryWeight?: number | null;
  Notes?: string | null;
}

export interface ScoringQuestion extends LegacyEntity {
  QuestionId: number;
  CategoryId: number;
  Name: string;
  Metric: string | null;
  Subtitle: string | null;
  HelpText: string | null;
  Required: boolean;
  QuestionWeight: number | null;
}

export interface ScoringQuestionInput extends LegacyEntityInput {
  CategoryId: number;
  Name: string;
  Metric?: string | null;
  Subtitle?: string | null;
  HelpText?: string | null;
  Required?: boolean;
  QuestionWeight?: number | null;
}

export interface QuestionOption extends AuditedEntity {
  QuestionOptionId: number;
  QuestionId: number;
  OptionCode: string;
  Label: string;
  Score: number | null;
  DisplayOrder: number | null;
}

export interface QuestionOptionInput {
  QuestionId: number;
  OptionCode: string;
  Label: string;
  Score?: number | null;
  DisplayOrder?: number | null;
}

export interface ScoringAnswer extends LegacyEntity {
  AnswerId: number;
  RequestId: number;
  QuestionId: number;
  SelectedOptionId: number | null;
  AnswerValue: string | null;
  Score: number | null;
  Comment: string | null;
}

export interface ScoringAnswerInput extends LegacyEntityInput {
  RequestId: number;
  QuestionId: number;
  SelectedOptionId?: number | null;
  AnswerValue?: string | null;
  Score?: number | null;
  Comment?: string | null;
}

export interface Capacity extends LegacyEntity {
  CapacityId: number;
  PersonId: number;
  WeeklyBaseline: number | null;
  Notes: string | null;
}

export interface CapacityInput extends LegacyEntityInput {
  PersonId: number;
  WeeklyBaseline?: number | null;
  Notes?: string | null;
}

export interface CapacityWeek extends AuditedEntity, WeekValue {
  CapacityWeekId: number;
  CapacityId: number;
}

export interface CapacityWeekInput extends WeekValue {
  CapacityId: number;
}

export interface DemandAllocation extends LegacyEntity {
  DemandAllocationId: number;
  ProjectId: number;
  PersonId: number | null;
  FunctionId: number | null;
  Name: string | null;
  StatusCode: string | null;
}

export interface DemandAllocationInput extends LegacyEntityInput {
  ProjectId: number;
  PersonId?: number | null;
  FunctionId?: number | null;
  Name?: string | null;
  StatusCode?: string | null;
}

export interface DemandWeek extends AuditedEntity, WeekValue {
  DemandWeekId: number;
  DemandAllocationId: number;
}

export interface DemandWeekInput extends WeekValue {
  DemandAllocationId: number;
}

export interface ImportRun {
  ImportRunId: string;
  StartedDate: Date;
  CompletedDate: Date | null;
  SourceDirectory: string;
  Status: string;
  RowsRead: number;
  RowsImported: number;
  RowsFailed: number;
  ErrorMessage: string | null;
}

export interface ImportRunInput {
  ImportRunId: string;
  SourceDirectory: string;
  Status: string;
}

export interface ImportError {
  ImportErrorId: number;
  ImportRunId: string;
  SourceFile: string;
  TargetTable: string | null;
  SourceRowNumber: number | null;
  LegacyDataverseId: string | null;
  ErrorMessage: string;
  RawRow: string | null;
  CreatedDate: Date;
}

export interface ImportErrorInput {
  ImportRunId: string;
  SourceFile: string;
  TargetTable?: string | null;
  SourceRowNumber?: number | null;
  LegacyDataverseId?: string | null;
  ErrorMessage: string;
  RawRow?: string | null;
}

export interface NonProjectDemandCategory extends AuditedEntity {
  CategoryId: string;
  Name: string;
}

export interface NonProjectDemandCategoryInput {
  Name: string;
}

export interface NonProjectDemandSubcategory extends AuditedEntity {
  SubcategoryId: string;
  CategoryId: string;
  Name: string;
  CreatedByPersonId: string | null;
}

export interface NonProjectDemandSubcategoryInput {
  CategoryId: string;
  Name: string;
  CreatedByPersonId?: string | null;
}

export interface NonProjectDemand extends AuditedEntity {
  NonProjectDemandId: string;
  CategoryId: string;
  SubcategoryId: string | null;
  PersonId: string;
  DepartmentId: string | null;
  Description: string | null;
  DemandHours: string;
}

export interface NonProjectDemandInput {
  CategoryId: string;
  SubcategoryId?: string | null;
  PersonId: string;
  DepartmentId?: string | null;
  Description?: string | null;
  DemandHours: string;
}
