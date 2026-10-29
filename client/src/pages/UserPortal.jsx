import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getCurrentUser } from "../services/users";
import "../styles/ProjectDashboard.css";

function UserPortal() {
  const [username, setUsername] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    async function loadUser() {
      const user = await getCurrentUser();
      if (!user) {
        navigate("/login");
        return;
      }
      setUsername(user.userid);
    }
    loadUser();
  }, [navigate]);

  return (
    <div>
      <main className="page-main">
        <div className="projects-header">
          <h2>User Portal</h2>
        </div>

        <div className="project-list">
          <div className="project-row">
            <span>Username</span>
            <span>{username}</span>
          </div>
        </div>
      </main>
    </div>
  );
}

export default UserPortal;