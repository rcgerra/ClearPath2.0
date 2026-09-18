import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import SessionGate from './components/SessionGate';
import { AuthProvider } from './contexts/AuthContext';
import AdminDashboard from './pages/AdminDashboard';
import AccessListPage from './pages/admin/AccessListPage';
import AdminHome from './pages/admin/AdminHome';
import DepartmentEditPage from './pages/admin/DepartmentEditPage';
import DepartmentsListPage from './pages/admin/DepartmentsListPage';
import NonProjectDemandCategoriesPage from './pages/admin/NonProjectDemandCategoriesPage';
import PeopleListPage from './pages/admin/PeopleListPage';
import PersonEditPage from './pages/admin/PersonEditPage';
import ProjectEditPage from './pages/admin/ProjectEditPage';
import ProjectsListPage from './pages/admin/ProjectsListPage';
import RequestEditPage from './pages/admin/RequestEditPage';
import RequestsListPage from './pages/admin/RequestsListPage';
import SkillsPage from './pages/admin/SkillsPage';
import DeptLeadDashboard from './pages/DeptLeadDashboard';
import DepartmentsPage from './pages/DepartmentsPage';
import DepartmentTeamPage from './pages/DepartmentTeamPage';
import IndividualDashboard from './pages/IndividualDashboard';
import OtherWorkPage from './pages/OtherWorkPage';
import PrioritizationPage from './pages/PrioritizationPage';
import ProjectCapturePage from './pages/ProjectCapturePage';
import ProjectManagerDashboard from './pages/ProjectManagerDashboard';
import ProjectsPage from './pages/ProjectsPage';
import ProjectTeamPage from './pages/ProjectTeamPage';
import RequestsPage from './pages/RequestsPage';

function HomeRedirect() {
  return <Navigate to="/me" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <SessionGate>
        <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<HomeRedirect />} />
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
                  <Route path="portfolio" element={<AdminDashboard />} />
                  <Route path="access" element={<AccessListPage />} />
                  <Route path="requests" element={<RequestsListPage />} />
                  <Route path="requests/:id" element={<RequestEditPage />} />
                  <Route path="projects" element={<ProjectsListPage />} />
                  <Route path="projects/:id" element={<ProjectEditPage />} />
                  <Route path="departments" element={<DepartmentsListPage />} />
                  <Route path="departments/:id" element={<DepartmentEditPage />} />
                  <Route path="non-project-demand-categories" element={<NonProjectDemandCategoriesPage />} />
                  <Route path="other-work" element={<OtherWorkPage />} />
                  <Route path="skills" element={<SkillsPage />} />
                  <Route path="people" element={<PeopleListPage />} />
                  <Route path="people/:id" element={<PersonEditPage />} />
                </Routes>
              </ProtectedRoute>
            }
          />
          <Route path="/departments" element={<DepartmentsPage />} />
          <Route
            path="/departments/new"
            element={
              <ProtectedRoute roles={['admin']}>
                <DepartmentEditPage />
              </ProtectedRoute>
            }
          />
          <Route path="/departments/:id" element={<DepartmentTeamPage />} />
          <Route path="/departments/:id/edit" element={<DepartmentEditPage />} />
          <Route
            path="/department"
            element={
              <ProtectedRoute roles={['admin', 'availability_moderator']}>
                <DeptLeadDashboard />
              </ProtectedRoute>
            }
          />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route
            path="/projects/new"
            element={
              <ProtectedRoute roles={['admin', 'demand_moderator']}>
                <ProjectEditPage />
              </ProtectedRoute>
            }
          />
          <Route path="/projects/:id" element={<ProjectTeamPage />} />
          <Route
            path="/projects/:id/edit"
            element={
              <ProtectedRoute roles={['admin', 'demand_moderator', 'availability_moderator', 'user']}>
                <ProjectEditPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/projects/:id/team"
            element={
              <ProtectedRoute roles={['admin', 'demand_moderator']}>
                <ProjectManagerDashboard />
              </ProtectedRoute>
            }
          />
          <Route path="/me" element={<IndividualDashboard />} />
          <Route path="/people" element={<PeopleListPage />} />
          <Route path="/skills" element={<SkillsPage />} />
          <Route path="/requests" element={<RequestsPage />} />
          <Route path="/capture" element={<ProjectCapturePage />} />
          <Route path="/prioritization" element={<PrioritizationPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </SessionGate>
    </AuthProvider>
  );
}
