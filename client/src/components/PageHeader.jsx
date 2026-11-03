import { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import "../styles/PageHeader.css";
import { getCurrentUser } from "../services/users";
import { useAuth } from "../context/AuthContext";

function PageHeader({ title = "HaaS Hub" }) {
  const [userName, setUserName] = useState("Guest");
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const hiddenOnRoutes = ["/", "/login", "/register", "/forgotpassword"];
  const showNav = !hiddenOnRoutes.includes(location.pathname);

  const navItems = [
    { to: "/dashboard", label: "Dashboard" },
    { to: "/projects", label: "Projects" },
    { to: "/userportal", label: "User Portal" },
    { to: "/createproject", label: "Create Project" },
    { to: "/joinproject", label: "Join Project" },
  ];

  useEffect(() => {
    async function loadUser() {
      const user = await getCurrentUser();
      if (user) {
        setUserName(user.userid);
      }
    }
    loadUser();
  }, []);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <header className="page-header">
      <div className="page-header__brand">
        <h1 className="page-header__title">{title}</h1>

        {showNav && (
          <div className="page-header__actions">
            <nav className="page-header__nav" aria-label="Header navigation">
              <span className="page-header__user-pill">Hello, {userName}</span>
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `page-header__link${isActive ? " page-header__link--active" : ""}`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>

            <button className="page-header__logout-btn" onClick={handleLogout}>
              Log out
            </button>
          </div>
        )}
      </div>

      <img
        className="page-header__logo"
        src="../src/assets/ytseal.svg"
        alt="Logo placeholder"
      />
    </header>
  );
}

export default PageHeader;