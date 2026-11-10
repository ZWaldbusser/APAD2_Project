import { useEffect, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { projects as projectsApi, users } from "../services";
import Swal from "sweetalert2";
import "../styles/ProjectDetail.css";

function ProjectDetail() {
  const { projectId } = useParams();
  const [searchParams] = useSearchParams();
  const orgId = searchParams.get("orgId") || "AUS";
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    async function load() {
      const user = await users.getCurrentUser();
      if (!user) {
        navigate("/login");
        return;
      }
      setCurrentUser(user);

      const res = await projectsApi.getProject(projectId, orgId);
      if (res.status === 404) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      if (!res.ok) {
        setLoading(false);
        return;
      }
      const data = await res.json();
      setProject(data.projectInfo || data);
      setLoading(false);
    }
    load();
  }, [projectId, orgId, navigate]);

  const userId = currentUser?.userid || currentUser?.id;
  const isMember = project?.joined_users?.includes(userId);

  const handleLeave = async () => {
    const confirm = await Swal.fire({
      icon: "warning",
      title: "Leave Project?",
      text: "Are you sure you want to leave this project?",
      showCancelButton: true,
      confirmButtonText: "Yes, leave",
      confirmButtonColor: "#d32f2f",
    });

    if (!confirm.isConfirmed) return;

    try {
      const res = await projectsApi.leaveProject({
        orgId: project.orgId,
        projectId: project.projectId,
        userId,
      });
      const data = await res.json();

      if (!res.ok) {
        Swal.fire({
          icon: "error",
          title: "Error",
          text: data.errorMessage || "Could not leave project",
        });
        return;
      }

      await Swal.fire({
        icon: "success",
        title: "Left Project",
        text: "You have left the project.",
        timer: 1500,
        showConfirmButton: false,
      });
      navigate("/projects");
    } catch {
      Swal.fire({
        icon: "error",
        title: "Connection Error",
        text: "Could not reach server.",
      });
    }
  };

  if (loading) {
    return (
      <div>
        <main className="project-detail-main">
          <p>Loading...</p>
        </main>
      </div>
    );
  }

  if (notFound) {
    return (
      <div>
        <main className="project-detail-main">
          <p className="not-member-msg">Project not found.</p>
          <div className="project-detail-actions">
            <button className="back-btn" onClick={() => navigate("/projects")}>Back to Projects</button>
          </div>
        </main>
      </div>
    );
  }

  if (!isMember) {
    return (
      <div>
        <main className="project-detail-main">
          <p className="not-member-msg">You are not a member of this project.</p>
          <div className="project-detail-actions">
            <button className="back-btn" onClick={() => navigate("/projects")}>Back to Projects</button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div>
      <main className="project-detail-main">
        <h2>{project.projectName}</h2>

        <div className="project-detail-card">
          <p><strong>Project ID:</strong> {project.projectId}</p>
          <p><strong>Agency:</strong> {project.orgId}</p>
          <p><strong>Description:</strong> {project.projectDesc || "No description"}</p>
          <p><strong>Created by:</strong> {project.creatorId}</p>
          <p><strong>Budget:</strong> ${project.budget?.toLocaleString()}</p>
        </div>

        <div className="members-section">
          <h3>Members ({project.joined_users?.length || 0})</h3>
          {project.joined_users?.length > 0 ? (
            <ul className="members-list">
              {project.joined_users.map((user) => (
                <li key={user}>{user}</li>
              ))}
            </ul>
          ) : (
            <p>No members yet.</p>
          )}
        </div>

        {project.hardwareList?.length > 0 && (
          <div className="hardware-section">
            <h3>Hardware</h3>
            <table className="hardware-table">
              <thead>
                <tr>
                  <th>Hardware ID</th>
                  <th>Allocation</th>
                </tr>
              </thead>
              <tbody>
                {project.hardwareList.map((hw) => (
                  <tr key={hw.hardwareId}>
                    <td>{hw.hardwareId}</td>
                    <td>{hw.allocation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="project-detail-actions">
          <button className="back-btn" onClick={() => navigate("/projects")}>Back to Projects</button>
          <button className="leave-btn" onClick={handleLeave}>Leave Project</button>
        </div>
      </main>
    </div>
  );
}

export default ProjectDetail;
