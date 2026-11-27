import { useCallback, useState } from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { projects as projectsApi } from "../services";
import { useWorkspace } from "../context/WorkspaceContext";
import { useRead } from "../hooks/useRead";
import {
  agencyNames,
  hasDisplayableDetails,
  membershipIds,
  projectJoinPath,
  projectListReturn,
  isProjectSummary,
} from "../projectContext";
import WorkspaceState from "../components/WorkspaceState";
import ProjectEquipment from "../components/ProjectEquipment";
import MembershipDialog from "../components/MembershipDialog";
import { useMembershipAction } from "../hooks/useMembershipAction";
import "../styles/Membership.css";

function ProjectRecord({ orgId, projectId, profile, back }) {
  const navigate = useNavigate();
  const load = useCallback(async () => {
    const res = await projectsApi.getProject(projectId, orgId);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error("Project unavailable");
    const data = await res.json();
    const project = data.projectInfo || data;
    if (
      !isProjectSummary(project) ||
      !hasDisplayableDetails(project) ||
      project.projectId !== projectId ||
      project.orgId !== orgId
    )
      throw new Error("Mismatched project");
    return project;
  }, [projectId, orgId]);
  const resource = useRead(load, JSON.stringify([orgId, projectId]));
  const project = resource.value;
  const members = membershipIds(project);
  const isMember = members?.includes(profile.id);
  const [review, setReview] = useState(false);
  const membership = useMembershipAction(
    "leave",
    project,
    profile,
    (_, refreshFailed) => {
      navigate(back, {
        state: {
          membershipNotice: "left",
          membershipRefreshFailed: refreshFailed,
        },
      });
    },
  );

  if (resource.status === "loading")
    return (
      <WorkspaceState headingLevel={1} title="Loading project…" loading>
        Getting the latest project details.
      </WorkspaceState>
    );
  if (resource.status === "error")
    return (
      <WorkspaceState
        headingLevel={1}
        title="Project unavailable"
        action={
          <button className="workspace-button" onClick={resource.retry}>
            Try again
          </button>
        }
      >
        We couldn’t load this project. Try again or return to projects.
      </WorkspaceState>
    );
  if (!project)
    return (
      <WorkspaceState headingLevel={1} title="Project not found">
        Check the project ID and agency, or return to the project list.
      </WorkspaceState>
    );
  if (!members)
    return (
      <WorkspaceState
        headingLevel={1}
        title="Membership unavailable"
        action={
          <button className="workspace-button" onClick={resource.retry}>
            Try again
          </button>
        }
      >
        We couldn’t confirm your membership. Project details will be available
        once membership is confirmed.
      </WorkspaceState>
    );
  if (!isMember)
    return (
      <WorkspaceState
        headingLevel={1}
        title="Membership required"
        action={
          <div className="membership-form-actions">
            <button
              className="workspace-button secondary"
              onClick={resource.retry}
            >
              Refresh membership
            </button>
            <Link
              className="workspace-button"
              to={projectJoinPath(project, back)}
            >
              Join this project
            </Link>
          </div>
        }
      >
        You are not a member of this project. Join it through your agency to
        view its details.
      </WorkspaceState>
    );

  return (
    <>
      <div className="workspace-page-heading">
        <div>
          <p className="workspace-eyebrow">
            {agencyNames[orgId]} · {projectId}
          </p>
          <h1>{project.projectName}</h1>
          <p>Project details and shared resources, in one place.</p>
        </div>
        <span className="workspace-member-badge">You’re a member</span>
      </div>
      <div className="workspace-detail-grid">
        <section className="workspace-panel">
          <h2>Project overview</h2>
          <p className="workspace-description">
            {project.projectDesc || "No description provided."}
          </p>
          <dl className="workspace-facts">
            <div>
              <dt>Project ID</dt>
              <dd>{projectId}</dd>
            </div>
            <div>
              <dt>Agency</dt>
              <dd>
                {agencyNames[orgId]} ({orgId})
              </dd>
            </div>
            <div>
              <dt>Created by</dt>
              <dd>{project.creatorId ?? "Not provided"}</dd>
            </div>
            <div>
              <dt>Project budget</dt>
              <dd>
                {typeof project.budget === "number" &&
                Number.isFinite(project.budget)
                  ? new Intl.NumberFormat("en-US", {
                      style: "currency",
                      currency: "USD",
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 2,
                    }).format(project.budget)
                  : "Not provided"}
              </dd>
            </div>
          </dl>
        </section>
        <section className="workspace-panel">
          <h2>
            Members <span className="workspace-count">{members.length}</span>
          </h2>
          <p className="workspace-muted">
            Project members are listed by user ID.
          </p>
          <ul className="workspace-members">
            {members.map((id) => (
              <li key={id}>
                <span className="workspace-avatar" aria-hidden="true">
                  {String(id).slice(0, 1).toUpperCase()}
                </span>
                <span>{id}</span>
                {String(id) === profile.id && (
                  <span className="workspace-muted">You</span>
                )}
              </li>
            ))}
          </ul>
        </section>
        <ProjectEquipment project={project} />
      </div>
      <div className="workspace-detail-footer">
        <Link to={back} className="workspace-text-link">
          Back to projects
        </Link>
        <button
          className="workspace-button secondary"
          onClick={() => {
            membership.reset();
            setReview(true);
          }}
        >
          Leave project
        </button>
      </div>
      {review && (
        <MembershipDialog
          project={project}
          profile={profile}
          action="leave"
          onCancel={() => setReview(false)}
          onConfirm={membership.perform}
          busy={membership.busy}
          refreshing={membership.refreshing}
          error={membership.error}
          needsSignIn={membership.needsSignIn}
          onRefresh={() => {
            setReview(false);
            membership.reset();
            resource.retry();
          }}
        />
      )}
    </>
  );
}

export default function ProjectDetail() {
  const { projectId } = useParams();
  const [params] = useSearchParams();
  const location = useLocation();
  const profile = useWorkspace();
  const agency = profile.value?.agencyCode;
  // Legacy bare deep links use known account context, never an invented AUS.
  const orgId = params.has("orgId") ? params.get("orgId") : agency;
  const proposedBack = location.state?.returnTo;
  const back = projectListReturn(proposedBack);
  return (
    <main className="workspace-page">
      <Link className="workspace-back" to={back}>
        ← Back to projects
      </Link>
      {location.state?.membershipNotice === "joined" && (
        <p className="membership-notice" role="status">
          Join request saved. Check your current membership below.
          {location.state?.membershipRefreshFailed && (
            <>
              {" "}We couldn’t refresh My projects after the change.{" "}
              <Link to="/projects?view=mine">Open My projects to check again</Link>.
            </>
          )}
        </p>
      )}
      {profile.status === "loading" ? (
        <WorkspaceState headingLevel={1} title="Loading workspace…" loading>
          Checking your account and agency.
        </WorkspaceState>
      ) : profile.status === "error" ? (
        <WorkspaceState
          headingLevel={1}
          title="Workspace unavailable"
          action={
            <button className="workspace-button" onClick={profile.retry}>
              Try again
            </button>
          }
        >
          We couldn’t verify your account.
        </WorkspaceState>
      ) : !agency ? (
        <WorkspaceState
          headingLevel={1}
          title="Agency unavailable"
          action={
            <button className="workspace-button" onClick={profile.retry}>
              Check again
            </button>
          }
        >
          Confirm your account’s agency with your team before opening a project.
        </WorkspaceState>
      ) : !Object.hasOwn(agencyNames, orgId) ? (
        <WorkspaceState headingLevel={1} title="Agency unavailable">
          This project link has no supported agency. Open the project from your
          agency’s list.
        </WorkspaceState>
      ) : orgId !== agency ? (
        <WorkspaceState headingLevel={1} title="Project outside your agency">
          Open a project from your own agency’s list.
        </WorkspaceState>
      ) : (
        <ProjectRecord
          key={JSON.stringify([orgId, projectId])}
          orgId={orgId}
          projectId={projectId}
          profile={profile.value}
          back={back}
        />
      )}
    </main>
  );
}
