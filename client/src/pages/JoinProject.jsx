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
      const res = await projects.joinProject({
        orgId: currentUser.agencyCode,
        projectId: projectID.trim(),
        userId: String(currentUser.id),
      });
      const data = await res.json();

      if (!res.ok || data?.success !== true) {
        setError(data?.errorMessage || "Could not join project");
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

          <label htmlFor="join-agency">Agency</label>
          <input id="join-agency" value={currentUser?.agencyCode || ""} readOnly />

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
