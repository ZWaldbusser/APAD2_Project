import { useCallback } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { projects as projectsApi } from "../services";
import { useWorkspace } from "../context/WorkspaceContext";
import { useRead } from "../hooks/useRead";
import {
  agencyNames,
  isProjectSummary,
  membershipIds,
  projectJoinPath,
  projectPath,
} from "../projectContext";
import WorkspaceState from "../components/WorkspaceState";
import "../styles/Membership.css";

function AgencyProjects({ agency, userId }) {
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const search = params.get("q") || "";
  const scope = params.get("view") === "agency" ? "agency" : "mine";
  const load = useCallback(async () => {
    const res = await projectsApi.searchProjects({
      orgId: agency,
      ...(scope === "mine" ? { userId } : {}),
    });
    if (!res.ok) throw new Error("Projects unavailable");
    const data = await res.json();
    if (
      !Array.isArray(data.projectList) ||
      !data.projectList.every(isProjectSummary)
    )
      throw new Error("Invalid projects");
    // Defense in depth; the adapter enforces the verified-agency policy.
    const agencyProjects = data.projectList.filter((p) => p.orgId === agency);
    if (
      scope === "mine" &&
      agencyProjects.some((p) => !membershipIds(p)?.includes(userId))
    )
      throw new Error("Unverified membership results");
    return agencyProjects;
  }, [agency, scope, userId]);
  const resource = useRead(load, JSON.stringify([agency, scope, userId]));
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
  const viewLink = (view) => {
    const next = new URLSearchParams(params);
    next.set("view", view);
    return `/projects?${next}`;
  };

  return (
    <>
      {location.state?.membershipNotice === "left" && (
        <p className="membership-notice" role="status">
          Leave request saved. Check your current membership in the results
          below.
        </p>
      )}
      <nav className="membership-views" aria-label="Project views">
        <Link
          to={viewLink("mine")}
          aria-current={scope === "mine" ? "page" : undefined}
        >
          My projects
        </Link>
        <Link
          to={viewLink("agency")}
          aria-current={scope === "agency" ? "page" : undefined}
        >
          Discover projects
        </Link>
      </nav>
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
          {scope === "mine"
            ? "Getting the projects you have joined."
            : "Getting projects for your agency."}
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
          title={
            scope === "mine"
              ? "No projects joined yet"
              : "No agency projects yet"
          }
          action={
            <Link
              className="workspace-button"
              to={scope === "mine" ? viewLink("agency") : "/createproject"}
            >
              {scope === "mine" ? "Browse agency projects" : "Create a project"}
            </Link>
          }
        >
          {scope === "mine"
            ? "Join a project or create one to start your team's workspace."
            : `Projects for ${agencyNames[agency]} will appear here once they’re available.`}
        </WorkspaceState>
      ) : (
        <>
          <p
            className="workspace-result-count"
            role="status"
            aria-atomic="true"
          >
            {filtered.length} {filtered.length === 1 ? "project" : "projects"}
            {term
              ? " matching your search"
              : scope === "mine"
                ? " you have joined"
                : " in your agency"}
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
            <ul
              className="workspace-project-list"
              aria-label={scope === "mine" ? "My projects" : "Agency projects"}
            >
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
                    <p>
                      {agencyNames[project.orgId]} ·{" "}
                      <span className="membership-status">
                        {membershipIds(project)?.includes(userId)
                          ? "Member"
                          : membershipIds(project)
                            ? "Not joined"
                            : "Membership unavailable"}
                      </span>
                    </p>
                  </div>
                  <div className="membership-card-actions">
                    {membershipIds(project) &&
                      !membershipIds(project).includes(userId) && (
                        <Link
                          className="workspace-button"
                          to={projectJoinPath(project, returnTo)}
                          aria-label={`Join ${project.projectName}`}
                        >
                          Join project
                        </Link>
                      )}
                    <Link
                      className="workspace-button secondary workspace-project-equipment"
                      to={projectPath(project, "/resources")}
                      aria-label={`Manage equipment for ${project.projectName}`}
                    >
                      Manage equipment
                    </Link>
                  </div>
                  <span className="workspace-card-arrow" aria-hidden="true">
                    ↗
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="workspace-data-note">
            {scope === "mine"
              ? "Only projects with your verified membership are shown."
              : "Discover projects within your verified agency."}
          </p>
        </>
      )}
    </>
  );
}

export default function ProjectDashboard() {
  const profile = useWorkspace();
  const location = useLocation();
  const agency = profile.value?.agencyCode;
  const joinPath = `/joinproject?${new URLSearchParams({ returnTo: `/projects${location.search}` })}`;
  return (
    <main className="workspace-page">
      <div className="workspace-page-heading">
        <div>
          <p className="workspace-eyebrow">YOUR AGENCY WORKSPACE</p>
          <h1>Projects</h1>
          <p>Find your team’s work. Keep public resources moving.</p>
        </div>
        <div className="workspace-actions">
          <Link className="workspace-button secondary" to={joinPath}>
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
        <AgencyProjects
          key={agency}
          agency={agency}
          userId={profile.value.id}
        />
      )}
    </main>
  );
}
