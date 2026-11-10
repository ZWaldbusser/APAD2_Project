import { BrowserRouter, Routes, Route, Outlet } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Login from "./pages/Login";
import AuthEntryPage from "./pages/AuthEntryPage";
import CreateUser from "./pages/CreateUser";
import ForgotPassword from "./pages/ForgotPassword";
import UserPortal from "./pages/UserPortal";
import CreateProject from "./pages/CreateProject";
import JoinProject from "./pages/JoinProject";
import PageHeader from "./components/PageHeader";
import ResourceRental from "./pages/ResourceRental";
import ProjectDashboard from "./pages/ProjectDashboard";
import Visualization from "./pages/Visualization";
import ProjectDetail from "./pages/ProjectDetail";
import WorkspaceProvider from "./context/WorkspaceProvider";
import WorkspaceLayout from "./components/WorkspaceLayout";

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route
            element={
              <>
                <PageHeader title="HaaS Hub" />
                <Outlet />
              </>
            }
          >
            <Route path="/" element={<AuthEntryPage />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<CreateUser />} />
            <Route path="/forgotpassword" element={<ForgotPassword />} />
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
            <Route path="/visualization" element={<Visualization />} />
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
