import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Login from "./pages/Login";
import AuthEntryPage from "./pages/AuthEntryPage";
import CreateUser from "./pages/CreateUser";
import ForgotPassword from "./pages/ForgotPassword";
import UserPortal from "./pages/UserPortal";
import CreateProject from "./pages/CreateProject";
import JoinProject from "./pages/JoinProject";
import AuthLayout from "./components/AuthLayout";
import ResourceRental from "./pages/ResourceRental";
import ProjectDashboard from "./pages/ProjectDashboard";
import TwoFactorSetup from "./pages/TwoFactorSetup";
import EnterCode from "./pages/EnterCode";
import Integration from "./pages/Integration";
import ProjectDetail from "./pages/ProjectDetail";
import WorkspaceProvider from "./context/WorkspaceProvider";
import WorkspaceLayout from "./components/WorkspaceLayout";

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AuthLayout />}>
            <Route path="/" element={<AuthEntryPage />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<CreateUser />} />
            <Route path="/forgotpassword" element={<ForgotPassword />} />
            <Route path="/2fa/setup" element={<TwoFactorSetup />} />
            <Route path="/2fa/verify" element={<EnterCode />} />
          </Route>
          <Route
            element={
              <ProtectedRoute>
                <WorkspaceProvider>
                  <WorkspaceLayout />
                </WorkspaceProvider>
              </ProtectedRoute>
            }
          >
            <Route path="/integration" element={<Integration />} />
            <Route
              path="/visualization"
              element={<Navigate replace to="/integration" />}
            />
            <Route path="/projects" element={<ProjectDashboard />} />
            <Route path="/userportal" element={<UserPortal />} />
            <Route path="/createproject" element={<CreateProject />} />
            <Route path="/joinproject" element={<JoinProject />} />
            <Route path="/projects/:projectId" element={<ProjectDetail />} />
            <Route
              path="/projects/:projectId/resources"
              element={<ResourceRental />}
            />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
