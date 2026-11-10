import { useEffect, useRef, useState } from "react";
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useWorkspace } from "../context/WorkspaceContext";
import { agencyNames } from "../projectContext";
import { USE_MOCKS } from "../config";
import MockScenarioPicker from "../mocks/MockScenarioPicker";
import "../styles/Workspace.css";

function Icon({ name }) {
  const paths = {
    projects: (
      <>
        <rect x="3" y="6" width="18" height="14" rx="2" />
        <path d="M3 10h18M8 6V4h8v2" />
      </>
    ),
    overview: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    account: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
      </>
    ),
  };
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

export default function WorkspaceLayout() {
  const profile = useWorkspace();
  const { logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const main = useRef(null);
  const menu = useRef(null);
  const priorPath = useRef(location.pathname);
  const agency = profile.value?.agencyCode;
  const title = location.pathname.startsWith("/projects")
    ? "Projects"
    : {
        "/visualization": "Overview",
        "/userportal": "Account",
        "/createproject": "Create project",
        "/joinproject": "Join project",
      }[location.pathname] || "Workspace";

  useEffect(() => {
    if (priorPath.current !== location.pathname) main.current?.focus();
    priorPath.current = location.pathname;
    document.title = `${title} · HaaS Hub`;
  }, [location.pathname, title]);

  return (
    <div className="workspace">
      <a className="workspace-skip" href="#workspace-content">
        Skip to main content
      </a>
      <aside
        className="workspace-sidebar"
        onKeyDown={(event) => {
          if (event.key === "Escape" && open) {
            setOpen(false);
            menu.current?.focus();
          }
        }}
      >
        <Link
          to="/projects"
          className="workspace-brand"
          onClick={() => setOpen(false)}
        >
          <span className="workspace-brand-mark" aria-hidden="true">
            H
          </span>
          <span>
            HaaS Hub<small>CIVIC WORKSPACE</small>
          </span>
        </Link>
        <button
          ref={menu}
          className="workspace-menu"
          aria-expanded={open}
          aria-controls="workspace-navigation"
          onClick={() => setOpen(!open)}
        >
          {open ? "Close menu" : "Open menu"}
        </button>
        <div
          id="workspace-navigation"
          className={`workspace-sidebar-content${open ? " is-open" : ""}`}
        >
          <p className="workspace-nav-label">WORKSPACE</p>
          <nav aria-label="Workspace">
            <NavLink to="/visualization" onClick={() => setOpen(false)}>
              <Icon name="overview" />
              Overview
            </NavLink>
            <NavLink to="/projects" onClick={() => setOpen(false)}>
              <Icon name="projects" />
              Projects
            </NavLink>
          </nav>
          <div className="workspace-sidebar-bottom">
            <p className="workspace-nav-label">AGENCY</p>
            <p className="workspace-agency-name">
              {agencyNames[agency] ||
                (profile.status === "loading"
                  ? "Loading agency…"
                  : "Agency unavailable")}
            </p>
            <NavLink to="/userportal" onClick={() => setOpen(false)}>
              <Icon name="account" />
              Account
            </NavLink>
            <button
              className="workspace-logout"
              onClick={() => {
                logout();
                navigate("/login");
              }}
            >
              Log out
            </button>
          </div>
        </div>
      </aside>
      <div className="workspace-body">
        <header className="workspace-topbar">
          <div>
            <span className="workspace-muted">Workspace</span>
            <span aria-hidden="true"> / </span>
            <strong>{title}</strong>
          </div>
          <Link to="/userportal" className="workspace-account">
            <span className="workspace-avatar" aria-hidden="true">
              {(profile.value?.name || "?").slice(0, 1).toUpperCase()}
            </span>
            <span>{profile.value?.name || "Account"}</span>
          </Link>
        </header>
        {USE_MOCKS && (
          <div className="workspace-sample">
            <strong>Sample workspace</strong>
            <span>Local fixtures · changes reset on reload</span>
            {import.meta.env.DEV && <MockScenarioPicker />}
          </div>
        )}
        <div
          ref={main}
          id="workspace-content"
          className="workspace-content"
          tabIndex={-1}
        >
          <Outlet />
        </div>
        <footer className="workspace-footer">
          HaaS Hub <span>Public resources. Shared purpose.</span>
        </footer>
      </div>
    </div>
  );
}
