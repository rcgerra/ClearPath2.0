export type Role = 'admin' | 'portfolio_manager' | 'availability_moderator' | 'demand_moderator' | 'intake_moderator' | 'user';

export interface AuthUser {
  userId: string;
  personId?: string;
  email: string;
  name: string;
  roles: Role[];
  departmentId?: string;
}

export interface Person {
  id: string;
  name: string;
  email?: string;
  role?: string;
  title?: string;
  employmentType?: string;
  ftePercent?: number;
  weeklyHours?: number;
  isActive?: boolean;
  userId?: string;
  departmentId?: string;
  departmentName?: string;
  functionId?: string;
  functionName?: string;
  siteName?: string;
  skillsetName?: string;
}

export interface Department {
  id: string;
  name: string;
  siteId?: string;
  code?: string;
  leadPersonId?: string;
  leadName?: string;
  delegatePersonId?: string;
  delegateName?: string;
  functionId?: string;
  functionName?: string;
  lastCheckIn?: string;
  isActive?: boolean;
}

export interface TeamMember {
  id: string;
  name: string;
  email?: string;
  role?: string;
  title?: string;
  weeklyHours?: number;
  functionName?: string;
  isActive?: boolean;
  capacityId: string | null;
  availabilityHours: string | null;
  weeklyBaseline: number | null;
}

export interface Project {
  id: string;
  name: string;
  siteId?: string;
  siteName?: string;
  code?: string;
  spotId?: string;
  description?: string;
  problemStatement?: string;
  status?: string;
  started?: boolean;
  priorityScore?: number;
  startDate?: string;
  endDate?: string;
  managerPersonId?: string;
  managerName?: string;
  sponsorPersonId?: string;
  sponsorName?: string;
  delegatePersonId?: string;
  delegateName?: string;
  isActive?: boolean;
  lastCheckIn?: string;
  programName?: string;
  departmentId?: string;
  departmentName?: string;
  requestId?: string;
}

export interface ProjectRequest {
  id: string;
  siteId?: string;
  title?: string;
  name?: string;
  shortTitle?: string;
  spotId?: string;
  phase?: string;
  disposition?: string;
  location?: string;
  neededBy?: string;
  neededByJustification?: string;
  currentState?: string;
  discoveryMethod?: string;
  impactToOperations?: string;
  desiredFutureState?: string;
  additionalInformation?: string;
  status?: string;
  submittedOn?: string;
  requesterPersonId?: string;
  requesterName?: string;
  delegatePersonId?: string;
  delegateName?: string;
  sponsorPersonId?: string;
  sponsorName?: string;
  isActive?: boolean;
  departmentId?: string;
  departmentName?: string;
  categoryId?: string;
  categoryName?: string;
  priorityScore?: number;
  prioritizationComplete?: boolean;
  projectId?: string;
  workflowCompletedAt?: Record<string, string>;
}

/** Disposition values captured on the intake form; new requests always start Pending. */
export const REQUEST_DISPOSITIONS = ['Pending', 'Endorsed', 'Not Endorsed', 'Cancelled'] as const;


export interface DemandRow {
  id: string;
  name?: string;
  projectId: string;
  projectName?: string;
  personId?: string;
  personName?: string;
  functionId?: string;
  functionName?: string;
  demandHours: string | null;
  weeks: number[];
  startWeek?: number;
  endWeek?: number;
  status?: string;
  isActive?: boolean;
  createdOn?: string;
}

export interface NonProjectDemandCategory {
  id: string;
  name: string;
  isActive: boolean;
}

export interface SkillCategory {
  id: string;
  name: string;
  isActive: boolean;
}

export interface Skill {
  id: string;
  categoryId: string;
  categoryName: string;
  name: string;
  isActive: boolean;
}

export interface PersonSkill {
  id: string;
  skillId: string;
  skillName: string;
  categoryId: string;
  categoryName: string;
}

export interface NonProjectDemandSubcategory {
  id: string;
  categoryId: string;
  name: string;
  isActive: boolean;
}

export interface NonProjectDemandRow {
  id: string;
  categoryId: string;
  categoryName: string;
  subcategoryId?: string;
  subcategoryName?: string;
  personId: string;
  departmentId?: string;
  description?: string;
  weeks: number[];
  pastWeeks?: number[];
  isActive?: boolean;
}

export interface CapacityRow {
  id: string;
  name?: string;
  personId: string;
  personName?: string;
  departmentId?: string;
  departmentName?: string;
  availabilityHours: string | null;
  weeks: number[];
  weeklyBaseline?: number;
  notes?: string;
  isActive?: boolean;
}

export interface NetCapacity {
  personId: string;
  availability: number[];
  demand: number[];
  net: number[];
  overAllocatedWeeks: Array<{ week: number; over: number }>;
}

export interface Question {
  id: string;
  text: string;
  categoryId?: string;
  categoryName?: string;
  weight: number;
  sequence?: number;
  answerType?: string;
  isActive?: boolean;
  required?: boolean;
  metric?: string;
  helpText?: string;
  subtitle?: string;
  options: Array<{ score: 0 | 1 | 5 | 10 | 15; label: string; text: string }>;
}

export interface ScoringCategory {
  id: string;
  name: string;
  weight: number;
  parent: 'Impact' | 'Complexity';
  categoryType?: string;
  notes?: string;
  isActive?: boolean;
}

export interface PrioritizationModel {
  parentWeights: {
    Impact: number;
    Complexity: number;
  };
}

export interface Answer {
  id: string;
  questionId: string;
  questionText?: string;
  value?: string;
  score?: number;
  comment?: string;
  justification?: string;
  methodology?: string;
}

export interface RankedRequest {
  rank: number;
  id: string;
  title?: string;
  status?: string;
  priorityScore?: number;
  impactScore?: number;
  complexityScore?: number;
  financialBenefit?: number;
  quartile?: string;
  topTen?: boolean;
  departmentName?: string;
  categoryName?: string;
}

export interface Lookup {
  id: string;
  name: string;
  siteId?: string;
  leadPersonId?: string;
  sponsorPersonId?: string;
  assistantLeadPersonIds?: string[];
  missionStatement?: string;
}

/** Governance workflow stages, in the order an item moves through them. */
export const GOVERNANCE_STAGES = ['DQ Check', 'PIRT Assessment', 'SG1 Review', 'Configuration'] as const;
export type GovernanceStage = (typeof GOVERNANCE_STAGES)[number];
export const GOVERNANCE_COMPLETE_PHASE = 'Processed';

export const GOVERNANCE_STAGE_VIEWS = [
  { slug: 'dq-check', stage: 'DQ Check', label: 'DQ Check', blurb: 'Confirm the submission is complete, then send it to PIRT.' },
  { slug: 'pirt', stage: 'PIRT Assessment', label: 'PIRT Assessment', blurb: 'Assign a program and project type, then send it to SG1 Review.' },
  { slug: 'sg1', stage: 'SG1 Review', label: 'Stage Gate 1 Review', blurb: 'Record the endorsement decision, then send it to Project Creation.' },
  { slug: 'creation', stage: 'Configuration', label: 'Project Creation', blurb: 'Create the staffing plan, fileshare and SPOT record, then complete.' },
] as const satisfies ReadonlyArray<{ slug: string; stage: GovernanceStage; label: string; blurb: string }>;

export const SG1_DISPOSITIONS = ['Endorsed', 'Not Endorsed'] as const;

export interface ProjectType {
  id: string;
  name: string;
  sortOrder: number;
}

export interface GovernanceItem {
  id: string;
  title?: string;
  shortTitle?: string;
  spotId?: string;
  phase?: string;
  disposition?: string;
  status?: string;
  submittedOn?: string;
  priorityScore?: number;
  isActive?: boolean;
  projectId?: string;
  departmentId?: string;
  departmentName?: string;
  requesterPersonId?: string;
  requesterName?: string;
  sponsorPersonId?: string;
  sponsorName?: string;
  delegatePersonId?: string;
  currentState?: string;
  desiredFutureState?: string;
  impactToOperations?: string;
  additionalInformation?: string;
  neededBy?: string;
  programId?: string;
  projectType?: string;
  dqComment?: string;
  pirtComment?: string;
  sg1Comment?: string;
  creationComment?: string;
  fileshareReady?: boolean;
  spotRecordCreated?: boolean;
  cancelled?: boolean;
}

export interface DirectoryUser {
  id: string;
  personId?: string;
  fullName: string;
  email?: string;
  jobTitle?: string;
}

export interface PortfolioSummary {
  projectCount: number;
  requestCount: number;
  peopleWithCapacity: number;
  demandRows: number;
  availability: number[];
  demand: number[];
  net: number[];
}
