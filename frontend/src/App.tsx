import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastProvider } from './components/Toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import LoginPage from './pages/LoginPage';
import Layout from './components/Layout';
import DashboardPage from './pages/DashboardPage';
import ProjectsPage from './pages/ProjectsPage';
import ProjectDetailPage from './pages/ProjectDetailPage';
import ExecutionsPage from './pages/ExecutionsPage';
import UsersPage from './pages/UsersPage';
import SchedulerPage from './pages/SchedulerPage';
import IntegrationsPage from './pages/IntegrationsPage';
import ExecutionDetailPage from './pages/ExecutionDetailPage';
import ScriptsPage from './pages/ScriptsPage';
import TestCaseEditorPage from './pages/TestCaseEditorPage';
import ReportsPage from './pages/ReportsPage';
import TestCasesPage from './pages/TestCasesPage';
import AgentsPage from './pages/AgentsPage';
import TestPlansPage from './pages/TestPlansPage';
import EnvironmentsPage from './pages/EnvironmentsPage';
import ProjectMembersPage from './pages/ProjectMembersPage';
import AuditPage from './pages/AuditPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div className="flex h-screen items-center justify-center"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="projects/:projectId" element={<ProjectDetailPage />} />
        <Route path="executions" element={<ExecutionsPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="executions/:execId" element={<ExecutionDetailPage />} />
        <Route path="scheduler" element={<SchedulerPage />} />
        <Route path="integrations" element={<IntegrationsPage />} />
        <Route path="scripts" element={<ScriptsPage />} />
        <Route path="testcases" element={<TestCasesPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="agents" element={<AgentsPage />} />
        <Route path="suites/:suiteId/testcases/:tcId/editor" element={<TestCaseEditorPage />} />
        <Route path="projects/:projectId/plans" element={<TestPlansPage />} />
        <Route path="projects/:projectId/environments" element={<EnvironmentsPage />} />
        <Route path="projects/:projectId/members" element={<ProjectMembersPage />} />
        <Route path="audit" element={<AuditPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <AppRoutes />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
