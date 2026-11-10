import { useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { projects as projectsApi } from "../services";
import { useWorkspace } from "../context/WorkspaceContext";
import { useRead } from "../hooks/useRead";
import { agencyNames, isProjectSummary, projectPath } from "../projectContext";
import WorkspaceState from "../components/WorkspaceState";

function AgencyProjects({ agency }) {
  const [params, setParams] = useSearchParams();
  const search = params.get("q") || "";
  const load = useCallback(async () => {
    const res = await projectsApi.searchProjects({ orgId: agency });
    if (!res.ok) throw new Error("Projects unavailable");
    const data = await res.json();
    if (
      !Array.isArray(data.projectList) ||
      !data.projectList.every(isProjectSummary)
    )
      throw new Error("Invalid projects");
    // A UI filter is not a server authorization boundary.
    return data.projectList.filter((project) => project.orgId === agency);
  }, [agency]);
  const resource = useRead(load, agency);
  const projects = resource.value || [];
  const term = search.trim().toLocaleLowerCase();
  const filtered = projects.filter(
    (project) =>
      project.projectName.toLocaleLowerCase().includes(term) ||
      project.projectId.toLocaleLowerCase().includes(term),
  );
  const updateSearch = (value) => {
    const next = new URLSearchParams(params);
    if (value) next.set("q", value);
    else next.delete("q");
    setParams(next, { replace: true });
  };
  const returnTo = `/projects${params.size ? `?${params}` : ""}`;

  return (
    <>
      <div className="workspace-list-tools">
        <div className="workspace-search">
          <label htmlFor="project-search">Search projects</label>
          <input
            id="project-search"
            type="search"
            placeholder="Search by project name or ID"
            value={search}
            onChange={(event) => updateSearch(event.target.value)}
          />
        </div>
        <span className="workspace-scope">
          Agency: <strong>{agency}</strong>
        </span>
      </div>
      {resource.status === "loading" ? (
        <WorkspaceState title="Loading projects…" loading>
          Getting projects for your agency.
        </WorkspaceState>
      ) : resource.status === "error" ? (
        <WorkspaceState
          title="Projects unavailable"
          action={
            <button className="workspace-button" onClick={resource.retry}>
              Try again
            </button>
          }
        >
          We couldn’t load your agency’s projects. Your search is saved; try
          again.
        </WorkspaceState>
      ) : projects.length === 0 ? (
        <WorkspaceState
          title="No agency projects yet"
          action={
            <Link className="workspace-button" to="/createproject">
              Create a project
            </Link>
          }
        >
          Projects for {agencyNames[agency]} will appear here once they’re
          available.
        </WorkspaceState>
      ) : (
        <>
          <p
            className="workspace-result-count"
            role="status"
            aria-atomic="true"
          >
            {filtered.length} {filtered.length === 1 ? "project" : "projects"}
            {term ? " matching your search" : " in your agency"}
          </p>
          {filtered.length === 0 ? (
            <WorkspaceState
              title="No matching projects"
              action={
                <button
                  className="workspace-button secondary"
                  onClick={() => updateSearch("")}
                >
                  Clear search
                </button>
              }
            >
              Try another project name or ID.
            </WorkspaceState>
          ) : (
            <ul className="workspace-project-list" aria-label="Agency projects">
              {filtered.map((project) => (
                <li
                  className="workspace-project-card"
                  key={JSON.stringify([project.orgId, project.projectId])}
                >
                  <div className="workspace-project-icon" aria-hidden="true">
                    <svg
                      width="26"
                      height="26"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <path d="M3 7h7l2 2h9v11H3z" />
                      <path d="M3 7V4h7l2 3" />
                    </svg>
                  </div>
                  <div className="workspace-project-summary">
                    <span className="workspace-eyebrow">
                      {project.orgId} · PROJECT {project.projectId}
                    </span>
                    <h2>
                      <Link to={projectPath(project)} state={{ returnTo }}>
                        {project.projectName}
                      </Link>
                    </h2>
                    <p>{agencyNames[project.orgId]}</p>
                  </div>
                  <span className="workspace-card-arrow" aria-hidden="true">
                    ↗
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="workspace-data-note">
            Showing agency projects. Membership is checked when you open a
            project.
          </p>
        </>
      )}
    </>
  );
}

export default function ProjectDashboard() {
  const profile = useWorkspace();
  const agency = profile.value?.agencyCode;
  return (
    <main className="workspace-page">
      <div className="workspace-page-heading">
        <div>
          <p className="workspace-eyebrow">YOUR AGENCY WORKSPACE</p>
          <h1>Projects</h1>
          <p>Find your team’s work. Keep public resources moving.</p>
        </div>
        <div className="workspace-actions">
          <Link className="workspace-button secondary" to="/joinproject">
            Join project
          </Link>
          <Link className="workspace-button" to="/createproject">
            + Create project
          </Link>
        </div>
      </div>
      {profile.status === "loading" ? (
        <WorkspaceState title="Loading workspace…" loading>
          Checking your account and agency.
        </WorkspaceState>
      ) : profile.status === "error" ? (
        <WorkspaceState
          title="Workspace unavailable"
          action={
            <button className="workspace-button" onClick={profile.retry}>
              Try again
            </button>
          }
        >
          We couldn’t verify your account. Please try again.
        </WorkspaceState>
      ) : !agency ? (
        <WorkspaceState
          title="Agency unavailable"
          action={
            <button className="workspace-button" onClick={profile.retry}>
              Check again
            </button>
          }
        >
          Your account has no supported agency. Contact your team to confirm
          your agency before browsing projects.
        </WorkspaceState>
      ) : (
        <AgencyProjects key={agency} agency={agency} />
      )}
    </main>
  );
}
