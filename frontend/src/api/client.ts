import axios from 'axios';
import { useAuthStore } from '../store/authStore';
import type {
  Answer,
  AuthUser,
  CapacityRow,
  DemandRow,
  Department,
  DirectoryUser,
  Lookup,
  NetCapacity,
  NonProjectDemandCategory,
  NonProjectDemandRow,
  NonProjectDemandSubcategory,
  Person,
  PortfolioSummary,
  PrioritizationModel,
  Project,
  ProjectRequest,
  Question,
  RankedRequest,
  ScoringCategory,
  Role,
  Skill,
  SkillCategory,
  PersonSkill,
  TeamMember,
} from '../types';

export const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((config) => {
  const { token, viewAsToken } = useAuthStore.getState();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  if (viewAsToken) config.headers['X-ClearPath-View-As'] = viewAsToken;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) useAuthStore.getState().logout();
    return Promise.reject(error);
  },
);

export function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    return (error.response?.data as { error?: string })?.error ?? error.message;
  }
  return error instanceof Error ? error.message : 'Unexpected error.';
}

export const authApi = {
  users: (search?: string) => api.get<DirectoryUser[]>('/auth/users', { params: { search } }).then((r) => r.data),
  session: (userId: string) => api.get<{ token: string; user: AuthUser }>('/auth/session', { params: { userId } }).then((r) => r.data),
  viewAs: (personId: string) => api.post<{ viewAsToken: string; user: AuthUser }>('/auth/view-as', { personId }).then((r) => r.data),
  me: () => api.get<{ user: AuthUser }>('/auth/me').then((r) => r.data.user),
};

export type WritePayload = Record<string, unknown>;

export const peopleApi = {
  list: (params?: { departmentId?: string; functionId?: string; search?: string; active?: boolean }) =>
    api.get<Person[]>('/people', { params }).then((r) => r.data),
  get: (id: string) => api.get<Person>(`/people/${id}`).then((r) => r.data),
  create: (body: WritePayload) => api.post<{ id: string }>('/people', body).then((r) => r.data),
  update: (id: string, body: WritePayload) => api.patch(`/people/${id}`, body).then((r) => r.data),
  setRoles: (id: string, roles: Role[]) => api.patch(`/people/${id}`, { role: roles.join(';') }).then((r) => r.data),
  remove: (id: string) => api.delete(`/people/${id}`),
};

export const departmentsApi = {
  list: () => api.get<Department[]>('/departments').then((r) => r.data),
  get: (id: string) => api.get<Department>(`/departments/${id}`).then((r) => r.data),
  team: (id: string) => api.get<TeamMember[]>(`/departments/${id}/team`).then((r) => r.data),
  create: (body: WritePayload) => api.post<{ id: string }>('/departments', body).then((r) => r.data),
  update: (id: string, body: WritePayload) => api.patch(`/departments/${id}`, body).then((r) => r.data),
  remove: (id: string) => api.delete(`/departments/${id}`),
};

export const projectsApi = {
  list: (params?: { managerPersonId?: string; departmentId?: string; search?: string }) =>
    api.get<Project[]>('/projects', { params }).then((r) => r.data),
  get: (id: string) => api.get<Project>(`/projects/${id}`).then((r) => r.data),
  team: (id: string) => api.get<DemandRow[]>(`/projects/${id}/team`).then((r) => r.data),
  create: (body: WritePayload) => api.post<{ id: string }>('/projects', body).then((r) => r.data),
  update: (id: string, body: WritePayload) => api.patch(`/projects/${id}`, body).then((r) => r.data),
  remove: (id: string) => api.delete(`/projects/${id}`),
};

export const requestsApi = {
  list: (params?: { mine?: boolean; departmentId?: string; status?: string }) =>
    api.get<ProjectRequest[]>('/requests', { params }).then((r) => r.data),
  get: (id: string) => api.get<ProjectRequest>(`/requests/${id}`).then((r) => r.data),
  create: (body: WritePayload) => api.post<{ id: string }>('/requests', body).then((r) => r.data),
  update: (id: string, body: WritePayload) => api.patch(`/requests/${id}`, body).then((r) => r.data),
  promote: (id: string) => api.post<{ projectId: string }>(`/requests/${id}/promote`).then((r) => r.data),
};

export const demandApi = {
  list: (params?: { projectId?: string; personId?: string; mine?: boolean }) =>
    api.get<DemandRow[]>('/demand', { params }).then((r) => r.data),
  create: (body: {
    projectId: string;
    personId?: string;
    functionId?: string;
    name?: string;
    startWeek?: number;
    endWeek?: number;
    hoursPerWeek?: number;
    weeks?: number[];
  }) => api.post<{ id: string }>('/demand', body).then((r) => r.data),
  setWeeks: (id: string, body: { week?: number; startWeek?: number; endWeek?: number; hours: number }) =>
    api.patch<{ id: string; weeks: number[] }>(`/demand/${id}/weeks`, body).then((r) => r.data),
  update: (id: string, body: WritePayload) => api.patch(`/demand/${id}`, body).then((r) => r.data),
  remove: (id: string) => api.delete(`/demand/${id}`),
};

export const nonProjectDemandApi = {
  categories: () =>
    api.get<NonProjectDemandCategory[]>('/non-project-demand/categories').then((response) => response.data),
  createCategory: (name: string) =>
    api.post<{ id: string }>('/non-project-demand/categories', { name }).then((response) => response.data),
  updateCategory: (id: string, body: { name?: string; isActive?: boolean }) =>
    api.patch<{ id: string }>(`/non-project-demand/categories/${id}`, body).then((response) => response.data),
  subcategories: (categoryId?: string) =>
    api.get<NonProjectDemandSubcategory[]>('/non-project-demand/subcategories', { params: { categoryId } }).then((response) => response.data),
  createSubcategory: (body: { categoryId: string; name: string }) =>
    api.post<{ id: string }>('/non-project-demand/subcategories', body).then((response) => response.data),
  updateSubcategory: (id: string, body: { name?: string; isActive?: boolean }) =>
    api.patch<{ id: string }>(`/non-project-demand/subcategories/${id}`, body).then((response) => response.data),
  list: (params?: { personId?: string; departmentId?: string }) =>
    api.get<NonProjectDemandRow[]>('/non-project-demand', { params }).then((response) => response.data),
  create: (body: { subcategoryId: string; personId: string; departmentId?: string; description: string }) =>
    api.post<{ id: string }>('/non-project-demand', body).then((response) => response.data),
  setWeeks: (id: string, body: { week?: number; startWeek?: number; endWeek?: number; hours: number }) =>
    api.patch<{ id: string; weeks: number[] }>(`/non-project-demand/${id}/weeks`, body).then((response) => response.data),
  update: (id: string, body: { isActive?: boolean; description?: string }) =>
    api.patch<{ id: string }>(`/non-project-demand/${id}`, body).then((response) => response.data),
  remove: (id: string) => api.delete(`/non-project-demand/${id}`),
};

export const skillsApi = {
  categories: () => api.get<SkillCategory[]>('/skills/categories').then((response) => response.data),
  createCategory: (name: string) => api.post<{ id: string }>('/skills/categories', { name }).then((response) => response.data),
  updateCategory: (id: string, body: { name?: string; isActive?: boolean }) =>
    api.patch<{ id: string }>(`/skills/categories/${id}`, body).then((response) => response.data),
  list: (categoryId?: string) => api.get<Skill[]>('/skills', { params: { categoryId } }).then((response) => response.data),
  create: (body: { categoryId: string; name: string }) => api.post<{ id: string }>('/skills', body).then((response) => response.data),
  update: (id: string, body: { name?: string; isActive?: boolean }) =>
    api.patch<{ id: string }>(`/skills/${id}`, body).then((response) => response.data),
  personSkills: (personId: string) => api.get<PersonSkill[]>(`/skills/people/${personId}`).then((response) => response.data),
  addPersonSkill: (personId: string, skillId: string) =>
    api.post<{ id: string }>(`/skills/people/${personId}`, { skillId }).then((response) => response.data),
  removePersonSkill: (personId: string, skillId: string) => api.delete(`/skills/people/${personId}/${skillId}`),
};

export const capacityApi = {
  list: (params?: { personId?: string; departmentId?: string; mine?: boolean }) =>
    api.get<CapacityRow[]>('/capacity', { params }).then((r) => r.data),
  net: (personId: string) => api.get<NetCapacity>(`/capacity/person/${personId}/net`).then((r) => r.data),
  create: (body: { personId: string; departmentId?: string; weeklyBaseline?: number; weeks?: number[] }) =>
    api.post<{ id: string }>('/capacity', body).then((r) => r.data),
  setWeeks: (id: string, body: { week?: number; startWeek?: number; endWeek?: number; hours: number }) =>
    api.patch<{ id: string; weeks: number[] }>(`/capacity/${id}/weeks`, body).then((r) => r.data),
  update: (id: string, body: WritePayload) => api.patch(`/capacity/${id}`, body).then((r) => r.data),
  remove: (id: string) => api.delete(`/capacity/${id}`),
};

export const prioritizationApi = {
  model: () => api.get<PrioritizationModel>('/prioritization/model').then((r) => r.data),
  updateModel: (body: { impactWeight: number; complexityWeight: number }) =>
    api.patch<PrioritizationModel>('/prioritization/model', body).then((r) => r.data),
  requests: () => api.get<ProjectRequest[]>('/prioritization/requests').then((r) => r.data),
  questions: (includeInactive = false) => api.get<Question[]>('/prioritization/questions', { params: { includeInactive } }).then((r) => r.data),
  categories: () => api.get<ScoringCategory[]>('/prioritization/categories').then((r) => r.data),
  createCategory: (body: { name: string; parent: 'Impact' | 'Complexity'; weight: number; notes?: string }) =>
    api.post<{ id: string }>('/prioritization/categories', body).then((r) => r.data),
  updateCategory: (id: string, body: WritePayload) => api.patch(`/prioritization/categories/${id}`, body).then((r) => r.data),
  createQuestion: (body: WritePayload) => api.post<{ id: string }>('/prioritization/questions', body).then((r) => r.data),
  updateQuestion: (id: string, body: WritePayload) => api.patch(`/prioritization/questions/${id}`, body).then((r) => r.data),
  answers: (requestId: string) =>
    api.get<Answer[]>(`/prioritization/requests/${requestId}/answers`).then((r) => r.data),
  submit: (requestId: string, answers: Array<{ questionId: string; score: 0 | 1 | 5 | 10 | 15; justification: string; methodology?: string }>) =>
    api
      .post<{ requestId: string; quartile: string; topTen: boolean }>('/prioritization/submit', { requestId, answers })
      .then((r) => r.data),
  ranking: () => api.get<RankedRequest[]>('/prioritization/ranking').then((r) => r.data),
};

export const lookupsApi = {
  list: (table: 'functions' | 'sites' | 'skillsets' | 'programs' | 'locations' | 'adm' | 'categories') =>
    api.get<Lookup[]>(`/lookups/${table}`).then((r) => r.data),
  create: (table: string, name: string) => api.post<{ id: string }>(`/lookups/${table}`, { name }).then((r) => r.data),
};

export const usersApi = {
  search: (search?: string) => api.get<DirectoryUser[]>('/users', { params: { search } }).then((r) => r.data),
  get: (id: string) => api.get<DirectoryUser>(`/users/${id}`).then((r) => r.data),
};

export const adminApi = {
  syncUsers: (dryRun = false) =>
    api
      .post<{ scanned: number; created: number; updated: number; skipped: number }>('/admin/sync/users', { dryRun })
      .then((r) => r.data),
  connection: () => api.get('/admin/connection').then((r) => r.data),
  portfolio: () => api.get<PortfolioSummary>('/admin/portfolio-summary').then((r) => r.data),
};
