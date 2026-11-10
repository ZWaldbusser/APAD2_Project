import { useEffect, useState } from "react";
import "../styles/Login.css";
import { useNavigate } from "react-router-dom";
import { users, projects } from "../services";

const ORG_OPTIONS = [
  { code: "AUS", label: "City of Austin" },
  { code: "DAL", label: "City of Dallas" },
  { code: "TEX", label: "State of Texas" },
];

function JoinProject() {
  const [orgId, setOrgId] = useState("AUS");
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
        orgId,
        projectId: projectID.trim(),
        userId: currentUser.userid || currentUser.id,
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.errorMessage || "Could not join project");
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

          <label>Agency</label>
          <select value={orgId} onChange={(e) => setOrgId(e.target.value)}>
            {ORG_OPTIONS.map((o) => (
              <option key={o.code} value={o.code}>{o.label} ({o.code})</option>
            ))}
          </select>

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
