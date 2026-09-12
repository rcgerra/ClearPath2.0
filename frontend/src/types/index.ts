export type Role = 'admin' | 'availability_moderator' | 'demand_moderator' | 'user';

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
  title?: string;
  name?: string;
  shortTitle?: string;
  spotId?: string;
  phase?: string;
  problemStatement?: string;
  businessCase?: string;
  expectedBenefit?: string;
  status?: string;
  submittedOn?: string;
  requesterPersonId?: string;
  requesterName?: string;
  delegatePersonId?: string;
  delegateName?: string;
  isActive?: boolean;
  departmentId?: string;
  departmentName?: string;
  categoryId?: string;
  categoryName?: string;
  priorityScore?: number;
  projectId?: string;
}

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
}

export interface Answer {
  id: string;
  questionId: string;
  questionText?: string;
  value?: string;
  score?: number;
  comment?: string;
}

export interface RankedRequest {
  rank: number;
  id: string;
  title?: string;
  status?: string;
  priorityScore?: number;
  departmentName?: string;
  categoryName?: string;
}

export interface Lookup {
  id: string;
  name: string;
}

export interface DirectoryUser {
  id: string;
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
