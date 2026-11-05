import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { projects as projectsApi } from "../services";
import "../styles/ProjectDashboard.css";

function ProjectDashboard() {
  const [projects, setProjects] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    async function loadProjects() {
      const res = await projectsApi.listMyProjects();
      if (!res.ok) return;
      const data = await res.json();
      setProjects(data);
    }
    loadProjects();
  }, []);

  const handleCheckoutHardware = (projectID) => {
    navigate(`/projects/${encodeURIComponent(projectID)}/resources`);
  };

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

        <div className="project-list">
          {projects.map((project) => (
            <div className="project-row" key={project.projectID}>
              <span>{project.name}</span>
              <span>
                <button className="checkout-btn" onClick={() => handleCheckoutHardware(project.projectID)}>Checkout Hardware</button>
              </span>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

export default ProjectDashboard;
