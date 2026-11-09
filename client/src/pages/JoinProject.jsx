import { useEffect, useState } from "react";
import "../styles/Login.css";
import { useNavigate } from "react-router-dom";
import { users, projects } from "../services";

function JoinProject() {
  const [projectID, setProjectID] = useState("");
  const [currentUser, setCurrentUser] = useState(null);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    async function loadUser() {
      const user = await users.getCurrentUser();
      if (!user) {
        navigate("/login");
        return;
      }
      setCurrentUser(user);
    }
    loadUser();
  }, [navigate]);

  const handleJoin = async () => {
    setError("");
    if (!projectID.trim()) {
      setError("Project ID is required");
      return;
    }

    try {
      // Look up the project first to get the creatorId
      const detailRes = await projects.getProject(projectID.trim());
      if (detailRes.status === 404) {
        setError("Project not found");
        return;
      }
      if (!detailRes.ok) {
        setError("Could not look up project");
        return;
      }
      const detailData = await detailRes.json();
      const projectInfo = detailData.projectInfo || detailData;

      const res = await projects.joinProject({
        projectId: projectID.trim(),
        projectCreatorId: projectInfo.projectCreatorId,
        userId: currentUser.userid || currentUser.id,
      });
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409) {
          setError(data.detail || "You are already a member of this project");
        } else if (res.status === 404) {
          setError(data.detail || "Project not found");
        } else {
          setError(data.detail || data.errorMessage || "Could not join project");
        }
        return;
      }

      navigate("/projects");
    } catch {
      setError("Could not reach server");
    }
  };

  return (
    <div>
      <main className="login-page">
        <div className="login-box">
          <h1>Join Project</h1>

          <label>Project ID</label>
          <input
            type="text"
            placeholder="Enter project ID"
            value={projectID}
            onChange={(e) => setProjectID(e.target.value)}
          />

          {error && <p className="error-text">{error}</p>}

          <button onClick={handleJoin} disabled={!currentUser}>Join Project</button>
          <button onClick={() => navigate("/projects")}>Cancel</button>
        </div>
      </main>
    </div>
  );
}

export default JoinProject;
