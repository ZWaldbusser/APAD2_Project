import { BrowserRouter, Routes, Route } from "react-router-dom";
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

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <PageHeader title="HaaS Hub" />
        <Routes>
          <Route path="/" element={<AuthEntryPage />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<CreateUser />} />
          <Route path="/forgotpassword" element={<ForgotPassword />} />

          <Route path="/visualization" element={
            <ProtectedRoute><Visualization /></ProtectedRoute>
          } />
          <Route path="/projects" element={
            <ProtectedRoute><ProjectDashboard /></ProtectedRoute>
          } />
          <Route path="/userportal" element={
            <ProtectedRoute><UserPortal /></ProtectedRoute>
          } />
          <Route path="/createproject" element={
            <ProtectedRoute><CreateProject /></ProtectedRoute>
          } />
          <Route path="/joinproject" element={
            <ProtectedRoute><JoinProject /></ProtectedRoute>
          } />
          <Route path="/projects/:projectId" element={
            <ProtectedRoute><ProjectDetail /></ProtectedRoute>
          } />
          <Route path="/projects/:projectId/resources" element={
            <ProtectedRoute><ResourceRental /></ProtectedRoute>
          } />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;