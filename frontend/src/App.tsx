import { lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import SessionGate from './components/SessionGate';
import { AuthProvider } from './contexts/AuthContext';
import HomePage from './pages/HomePage';
const AccessListPage = lazy(() => import('./pages/admin/AccessListPage'));
const AdminControlsPage = lazy(() => import('./pages/admin/AdminControlsPage'));
const AdminHome = lazy(() => import('./pages/admin/AdminHome'));
const DepartmentEditPage = lazy(() => import('./pages/admin/DepartmentEditPage'));
const DepartmentsListPage = lazy(() => import('./pages/admin/DepartmentsListPage'));
const NonProjectDemandCategoriesPage = lazy(() => import('./pages/admin/NonProjectDemandCategoriesPage'));
const PeopleListPage = lazy(() => import('./pages/admin/PeopleListPage'));
const PrioritizationModelPage = lazy(() => import('./pages/admin/PrioritizationModelPage'));
const PersonEditPage = lazy(() => import('./pages/admin/PersonEditPage'));
const ProjectEditPage = lazy(() => import('./pages/admin/ProjectEditPage'));
const ProjectsListPage = lazy(() => import('./pages/admin/ProjectsListPage'));
const RequestEditPage = lazy(() => import('./pages/admin/RequestEditPage'));
const ReferenceTablesPage = lazy(() => import('./pages/admin/ReferenceTablesPage'));
const RequestsListPage = lazy(() => import('./pages/admin/RequestsListPage'));
const SkillsPage = lazy(() => import('./pages/admin/SkillsPage'));
const DeptLeadDashboard = lazy(() => import('./pages/DeptLeadDashboard'));
const DepartmentsPage = lazy(() => import('./pages/DepartmentsPage'));
const DepartmentTeamPage = lazy(() => import('./pages/DepartmentTeamPage'));
const GovernancePage = lazy(() => import('./pages/governance/GovernancePage'));
const GovernanceDetailPage = lazy(() => import('./pages/governance/GovernanceDetailPage'));
const IndividualDashboard = lazy(() => import('./pages/IndividualDashboard'));
const OtherWorkPage = lazy(() => import('./pages/OtherWorkPage'));
const PortfolioManagementPage = lazy(() => import('./pages/PortfolioManagementPage'));
const PrioritizationPage = lazy(() => import('./pages/PrioritizationPage'));
const ProjectCapturePage = lazy(() => import('./pages/ProjectCapturePage'));
const ProjectManagerDashboard = lazy(() => import('./pages/ProjectManagerDashboard'));
const ProjectsPage = lazy(() => import('./pages/ProjectsPage'));
const ProjectTeamPage = lazy(() => import('./pages/ProjectTeamPage'));
const RequestsPage = lazy(() => import('./pages/RequestsPage'));
const SiteAssistantsPage = lazy(() => import('./pages/SiteAssistantsPage'));

export default function App() {
  return (
    <AuthProvider>
      <SessionGate>
        <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<HomePage />} />
          <Route
            path="/admin"
            element={
              <ProtectedRoute roles={['admin']}>
                <AdminHome />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/*"
            element={
              <ProtectedRoute roles={['admin']}>
                <Routes>
                  <Route path="portfolio" element={<PortfolioManagementPage />} />
                  <Route path="access" element={<AccessListPage />} />
                  <Route path="controls" element={<AdminControlsPage />} />
                  <Route path="requests" element={<RequestsListPage />} />
                  <Route path="requests/:id" element={<RequestEditPage />} />
                  <Route path="projects" element={<ProjectsListPage />} />
                  <Route path="projects/:id" element={<ProjectEditPage />} />
                  <Route path="departments" element={<DepartmentsListPage />} />
                  <Route path="departments/:id" element={<DepartmentEditPage />} />
                  <Route path="reference/:table" element={<ReferenceTablesPage />} />
                  <Route path="other-work" element={<OtherWorkPage />} />
                  <Route path="other-work/non-project-demand-categories" element={<NonProjectDemandCategoriesPage />} />
                  <Route
                    path="non-project-demand-categories"
                    element={<Navigate to="/admin/other-work/non-project-demand-categories" replace />}
                  />
                  <Route path="skills" element={<SkillsPage />} />
                  <Route path="prioritization-model" element={<PrioritizationModelPage />} />
                  <Route path="people" element={<PeopleListPage />} />
                  <Route path="people/:id" element={<PersonEditPage />} />
                </Routes>
              </ProtectedRoute>
            }
          />
          <Route path="/departments" element={<DepartmentsPage />} />
          <Route path="/departments/new" element={<DepartmentEditPage />} />
          <Route path="/departments/:id" element={<DepartmentTeamPage />} />
          <Route path="/departments/:id/edit" element={<DepartmentEditPage />} />
          <Route
            path="/department"
            element={
              <ProtectedRoute roles={['admin']}>
                <DeptLeadDashboard />
              </ProtectedRoute>
            }
          />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/new" element={<ProjectEditPage />} />
          <Route path="/projects/:id" element={<ProjectTeamPage />} />
          <Route
            path="/projects/:id/edit"
            element={
              <ProtectedRoute roles={['admin', 'portfolio_manager', 'user']}>
                <ProjectEditPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/projects/:id/team"
            element={
              <ProtectedRoute roles={['admin']}>
                <ProjectManagerDashboard />
              </ProtectedRoute>
            }
          />
          <Route path="/me" element={<IndividualDashboard />} />
          <Route path="/portfolio" element={<ProtectedRoute roles={['admin', 'portfolio_manager']}><PortfolioManagementPage /></ProtectedRoute>} />
          <Route path="/people" element={<PeopleListPage />} />
          <Route path="/people/new" element={<PersonEditPage />} />
          <Route path="/people/:id" element={<PersonEditPage />} />
          <Route path="/site/team" element={<SiteAssistantsPage />} />
          <Route path="/skills" element={<SkillsPage />} />
          <Route path="/requests" element={<RequestsPage />} />
          <Route path="/requests/:id" element={<RequestEditPage />} />
          <Route path="/capture" element={<ProjectCapturePage />} />
          <Route path="/prioritization" element={<PrioritizationPage />} />
          <Route path="/governance" element={<GovernancePage />} />
          <Route path="/governance/item/:id" element={<GovernanceDetailPage />} />
          <Route path="/governance/:stage" element={<GovernancePage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </SessionGate>
    </AuthProvider>
  );
}
