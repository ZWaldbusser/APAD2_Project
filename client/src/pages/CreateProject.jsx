import { useEffect, useState } from "react";
import "../styles/Login.css";
import { useNavigate } from "react-router-dom";
import { users, projects } from "../services";

function CreateProject() {
  const [projectID, setProjectID] = useState("");
  const [projectName, setProjectName] = useState("");
  const [description, setDescription] = useState("");
  const [owner, setOwner] = useState(null);
  const [error, setError] = useState("");

  // Availability check state
  const [idStatus, setIdStatus] = useState("idle"); // idle | checking | available | taken
  const navigate = useNavigate();

  useEffect(() => {
    async function loadUser() {
      const user = await users.getCurrentUser();
      if (!user) {
        navigate("/login");
        return;
      }
      setOwner(user.id);
    }
    loadUser();
  }, [navigate]);

  // Debounced uniqueness check whenever projectID changes
  useEffect(() => {
    if (!projectID) {
      setIdStatus("idle");
      return;
    }

    setIdStatus("checking");
    const timeoutId = setTimeout(async () => {
      try {
        // Backend should expose a cheap existence check.
        // e.g. GET /api/projects/:id returns 404 if free, 200 if taken.
        const res = await projects.getProject(projectID);
        if (res.status === 404) {
          setIdStatus("available");
        } else if (res.ok) {
          setIdStatus("taken");
        } else {
          // Unexpected error — don't block the user, let submit-time check catch it
          setIdStatus("idle");
        }
      } catch {
        setIdStatus("idle");
      }
    }, 400); // debounce delay

    return () => clearTimeout(timeoutId);
  }, [projectID]);

  const handleCreate = async () => {
    setError("");

    if (!projectID) {
      setError("Project ID is required");
      return;
    }
    if (idStatus === "taken") {
      setError("Project ID must be unique");
      return;
    }

    try {
      const res = await projects.createProject({
        projectID,
        name: projectName,
        description,
      });
      const data = await res.json();

      if (!res.ok) {
        // Backend is the final source of truth for uniqueness —
        // handle the race where someone else grabbed the ID between
        // the check above and this submit.
        if (res.status === 409) {
          setIdStatus("taken");
          setError("Project ID must be unique");
        } else {
          setError(data.error || "Could not create project");
        }
        return;
      }

      navigate("/projects");
    } catch (err) {
      setError("Could not reach server");
    }
  };

  const idHelperText = {
    idle: "",
    checking: "Checking availability...",
    available: "Available",
    taken: "Project ID must be unique",
  }[idStatus];

  const idHelperClass = {
    idle: "",
    checking: "helper-text",
    available: "helper-text success-text",
    taken: "error-text",
  }[idStatus];

  const canSubmit = owner && projectID && idStatus !== "taken" && idStatus !== "checking";

  return (
    <div>
      <main className="login-page">
        <div className="login-box">
          <h1>Create Project</h1>

          <label>Project ID</label>
          <input
            type="text"
            placeholder="Enter a unique project ID"
            value={projectID}
            onChange={(e) => setProjectID(e.target.value.trim())}
          />
          {idHelperText && <p className={idHelperClass}>{idHelperText}</p>}

          <label>Project Name</label>
          <input
            type="text"
            placeholder="Enter project name"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
          />

          <label>Description</label>
          <input
            type="text"
            placeholder="Enter description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          {error && <p className="error-text">{error}</p>}

          <button onClick={handleCreate} disabled={!canSubmit}>Create Project</button>
          <button onClick={() => navigate("/projects")}>Cancel</button>
        </div>
      </main>
    </div>
  );
}

export default CreateProject;