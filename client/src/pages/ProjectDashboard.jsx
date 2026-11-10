import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { projects as projectsApi } from "../services";
import "../styles/ProjectDashboard.css";

function ProjectDashboard() {
  const [projects, setProjects] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    async function loadProjects() {
      const res = await projectsApi.searchProjects();
      if (!res.ok) return;
      const data = await res.json();
      setProjects(data.projectList || []);
    }
    loadProjects();
  }, []);

  const handleCheckoutHardware = (projectId) => {
    navigate(`/projects/${encodeURIComponent(projectId)}/resources`);
  };

  const filteredProjects = projects.filter((p) => {
    const term = searchTerm.toLowerCase();
    return (
      p.projectName.toLowerCase().includes(term) ||
      p.projectId.toLowerCase().includes(term) ||
      (p.orgId || "").toLowerCase().includes(term)
    );
  });

  return (
    <div>
      <main className="page-main">
        <div className="projects-header">
          <h2>Projects</h2>
          <div>
            <button className="create-join-btn" onClick={() => navigate("/createproject")}>Create Project</button>
            <button className="create-join-btn" onClick={() => navigate("/joinproject")}>Join Project</button>
          </div>
        </div>

        <input
          className="search-bar"
          type="text"
          placeholder="Search by project name, ID, or agency..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />

        <div className="project-list">
          {filteredProjects.map((project) => (
            <div className="project-row" key={`${project.orgId}-${project.projectId}`}>
              <span
                className="project-name-link"
                onClick={() => navigate(`/projects/${project.projectId}?orgId=${project.orgId}`)}
              >
                {project.projectName}
                <span className="org-badge">{project.orgId}</span>
              </span>
              <span>
                <button className="checkout-btn" onClick={() => handleCheckoutHardware(project.projectId)}>Checkout Hardware</button>
              </span>
            </div>
          ))}
          {filteredProjects.length === 0 && searchTerm && (
            <p className="no-results">No projects match your search.</p>
          )}
        </div>
      </main>
    </div>
  );
}

export default ProjectDashboard;
