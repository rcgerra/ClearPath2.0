import {
  AssociationRepository,
  CrudRepository,
  ListRepository,
  PartialUpdate,
  Repository,
} from './common';
import {
  Capacity,
  CapacityInput,
  CapacityWeek,
  CapacityWeekInput,
  Department,
  DepartmentDelegate,
  DepartmentDelegateInput,
  DepartmentInput,
  DemandAllocation,
  DemandAllocationInput,
  DemandWeek,
  DemandWeekInput,
  DirectoryUser,
  DirectoryUserInput,
  FunctionEntity,
  FunctionInput,
  ImportError,
  ImportErrorInput,
  ImportRun,
  ImportRunInput,
  Location,
  LocationInput,
  NonProjectDemand,
  NonProjectDemandCategory,
  NonProjectDemandCategoryInput,
  NonProjectDemandInput,
  NonProjectDemandSubcategory,
  NonProjectDemandSubcategoryInput,
  Person,
  PersonInput,
  PersonSkillset,
  PersonSkillsetInput,
  Program,
  ProgramInput,
  Project,
  ProjectDelegate,
  ProjectDelegateInput,
  ProjectInput,
  QuestionOption,
  QuestionOptionInput,
  Request,
  RequestInput,
  RequestLocation,
  RequestLocationInput,
  ScoringAnswer,
  ScoringAnswerInput,
  ScoringCategory,
  ScoringCategoryInput,
  ScoringQuestion,
  ScoringQuestionInput,
  Site,
  SiteInput,
  Skillset,
  SkillsetInput,
} from './entities';

export type StandardRepository<TEntity, TInput> =
  Repository<TEntity, TInput, PartialUpdate<TInput>, number, number> &
  ListRepository<TEntity, boolean>;

export interface DirectoryUserRepository extends StandardRepository<DirectoryUser, DirectoryUserInput> {
  findByEmail(email: string): Promise<DirectoryUser | null>;
  findByAzureAdObjectId(objectId: string): Promise<DirectoryUser | null>;
}

export interface FunctionRepository extends StandardRepository<FunctionEntity, FunctionInput> {}

export interface SiteRepository extends StandardRepository<Site, SiteInput> {}

export interface LocationRepository extends StandardRepository<Location, LocationInput> {}

export interface ProgramRepository extends StandardRepository<Program, ProgramInput> {}

export interface SkillsetRepository extends StandardRepository<Skillset, SkillsetInput> {}

export interface DepartmentRepository
  extends Repository<Department, DepartmentInput, PartialUpdate<DepartmentInput>, number, number>,
    ListRepository<Department, boolean> {}

export interface PersonRepository extends StandardRepository<Person, PersonInput> {
  findByDirectoryUserId(directoryUserId: number): Promise<Person | null>;
  listByDepartment(departmentId: number, includeInactive?: boolean): Promise<Person[]>;
}

export interface PersonSkillsetRepository
  extends AssociationRepository<PersonSkillset, PersonSkillsetInput, { PersonId: number; SkillsetId: number }> {
  listByPerson(personId: number): Promise<PersonSkillset[]>;
  listBySkillset(skillsetId: number): Promise<PersonSkillset[]>;
}

export interface DepartmentDelegateRepository
  extends AssociationRepository<DepartmentDelegate, DepartmentDelegateInput, { DepartmentId: number; DirectoryUserId: number }> {
  listByDepartment(departmentId: number): Promise<DepartmentDelegate[]>;
}

export interface RequestRepository extends StandardRepository<Request, RequestInput> {
  listByProgram(programId: number, includeInactive?: boolean): Promise<Request[]>;
  findByLegacyDataverseId(legacyId: string): Promise<Request | null>;
}

export interface ProjectRepository extends StandardRepository<Project, ProjectInput> {
  listByRequest(requestId: number, includeInactive?: boolean): Promise<Project[]>;
  listBySite(siteId: number, includeInactive?: boolean): Promise<Project[]>;
}

export interface ProjectDelegateRepository
  extends AssociationRepository<ProjectDelegate, ProjectDelegateInput, { ProjectId: number; DirectoryUserId: number }> {
  listByProject(projectId: number): Promise<ProjectDelegate[]>;
}

export interface RequestLocationRepository
  extends AssociationRepository<RequestLocation, RequestLocationInput, { RequestId: number; LocationId: number }> {
  listByRequest(requestId: number): Promise<RequestLocation[]>;
}

export interface ScoringCategoryRepository extends StandardRepository<ScoringCategory, ScoringCategoryInput> {}

export interface ScoringQuestionRepository extends StandardRepository<ScoringQuestion, ScoringQuestionInput> {
  listByCategory(categoryId: number, includeInactive?: boolean): Promise<ScoringQuestion[]>;
}

export interface QuestionOptionRepository extends StandardRepository<QuestionOption, QuestionOptionInput> {
  listByQuestion(questionId: number, includeInactive?: boolean): Promise<QuestionOption[]>;
}

export interface ScoringAnswerRepository extends StandardRepository<ScoringAnswer, ScoringAnswerInput> {
  listByRequest(requestId: number, includeInactive?: boolean): Promise<ScoringAnswer[]>;
  findByRequestAndQuestion(requestId: number, questionId: number): Promise<ScoringAnswer | null>;
}

export interface CapacityRepository extends StandardRepository<Capacity, CapacityInput> {
  findByPersonId(personId: number): Promise<Capacity | null>;
}

export interface CapacityWeekRepository extends StandardRepository<CapacityWeek, CapacityWeekInput> {
  listByCapacity(capacityId: number): Promise<CapacityWeek[]>;
  upsertWeek(input: CapacityWeekInput): Promise<CapacityWeek>;
}

export interface DemandAllocationRepository extends StandardRepository<DemandAllocation, DemandAllocationInput> {
  listByProject(projectId: number, includeInactive?: boolean): Promise<DemandAllocation[]>;
  listByPerson(personId: number, includeInactive?: boolean): Promise<DemandAllocation[]>;
}

export interface DemandWeekRepository extends StandardRepository<DemandWeek, DemandWeekInput> {
  listByDemand(demandAllocationId: number): Promise<DemandWeek[]>;
  upsertWeek(input: DemandWeekInput): Promise<DemandWeek>;
}

export interface ImportRunRepository extends Repository<ImportRun, ImportRunInput, Partial<ImportRunInput>, string, ImportRun> {
  list(): Promise<ImportRun[]>;
  complete(importRunId: string, status: string, rowsRead: number, rowsImported: number, rowsFailed: number): Promise<boolean>;
}

export interface ImportErrorRepository extends Repository<ImportError, ImportErrorInput, never, number, ImportError> {
  listByRun(importRunId: string): Promise<ImportError[]>;
}

export interface NonProjectDemandCategoryRepository
  extends Repository<NonProjectDemandCategory, NonProjectDemandCategoryInput, Partial<NonProjectDemandCategoryInput>, string, string>,
    ListRepository<NonProjectDemandCategory> {}

export interface NonProjectDemandSubcategoryRepository
  extends Repository<NonProjectDemandSubcategory, NonProjectDemandSubcategoryInput, Partial<NonProjectDemandSubcategoryInput>, string, string>,
    ListRepository<NonProjectDemandSubcategory> {
  listByCategory(categoryId: string): Promise<NonProjectDemandSubcategory[]>;
}

export interface NonProjectDemandRepository
  extends Repository<NonProjectDemand, NonProjectDemandInput, Partial<NonProjectDemandInput>, string, string>,
    ListRepository<NonProjectDemand> {
  listByPerson(personId: string): Promise<NonProjectDemand[]>;
  listByDepartment(departmentId: string): Promise<NonProjectDemand[]>;
}
