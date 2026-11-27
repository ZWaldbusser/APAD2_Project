import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { projects } from "../services";
import { useWorkspace } from "../context/WorkspaceContext";
import { useRead } from "../hooks/useRead";
import {
  agencyNames,
  isProjectSummary,
  membershipIds,
  projectListReturn,
  projectPath,
} from "../projectContext";
import WorkspaceState from "../components/WorkspaceState";
import MembershipDialog from "../components/MembershipDialog";
import { useMembershipAction } from "../hooks/useMembershipAction";
import "../styles/Membership.css";

function JoinForm({ profile, initialId, back }) {
  const navigate = useNavigate();
  const [projectId, setProjectId] = useState(initialId);
  const [target, setTarget] = useState(initialId);
  const [error, setError] = useState("");
  const [review, setReview] = useState(false);
  const field = useRef(null);
  const heading = useRef(null);
  const load = useCallback(async () => {
    if (!target) return null;
    const response = await projects.searchProjects({
      orgId: profile.agencyCode,
      projectId: target,
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error("Project lookup failed");
    const data = await response.json();
    if (
      !Array.isArray(data.projectList) ||
      !data.projectList.every(isProjectSummary) ||
      data.projectList.some(
        (p) => p.orgId !== profile.agencyCode || p.projectId !== target,
      ) ||
      data.projectList.length > 1
    )
      throw new Error("Invalid project context");
    return data.projectList[0] || null;
  }, [profile.agencyCode, target]);
  const resource = useRead(load, JSON.stringify([profile.agencyCode, target]));
  const project = resource.value;
  const current = Boolean(target && projectId.trim() === target);
  const members = membershipIds(project);
  const membership = useMembershipAction(
    "join",
    project,
    profile,
    (joined, refreshFailed) => {
      navigate(projectPath(joined), {
        state: {
          returnTo: back,
          membershipNotice: "joined",
          membershipRefreshFailed: refreshFailed,
        },
      });
    },
  );
  useEffect(() => {
    if (current && resource.status === "ready" && project)
      heading.current?.focus();
  }, [current, resource.status, project]);
  const find = (event) => {
    event.preventDefault();
    if (!projectId.trim()) {
      setError("Enter a project ID.");
      field.current.focus();
      return;
    }
    setError("");
    if (target === projectId.trim()) resource.retry();
    else setTarget(projectId.trim());
  };
  return (
    <>
      <form
        className="workspace-panel membership-form"
        onSubmit={find}
        noValidate
      >
        <h1>Join project</h1>
        <p>Find a project in your agency and review it before joining.</p>
        <div className="membership-fields">
          <div>
            <label htmlFor="join-agency">Agency</label>
            <input id="join-agency" value={profile.agencyCode} readOnly />
          </div>
          <div>
            <label htmlFor="join-project-id">
              Project ID{" "}
              <span className="membership-required" aria-hidden="true">
                *
              </span>
            </label>
            <input
              ref={field}
              id="join-project-id"
              value={projectId}
              placeholder="Enter project ID"
              required
              onChange={(event) => setProjectId(event.target.value)}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "join-error" : undefined}
            />
          </div>
        </div>
        {error && (
          <p id="join-error" className="membership-error" role="alert">
            {error}
          </p>
        )}
        <div className="membership-form-actions">
          <Link className="workspace-button secondary" to={back}>
            Cancel
          </Link>
          <button className="workspace-button" type="submit">
            Find project
          </button>
        </div>
      </form>
      {current &&
        (resource.status === "loading" ? (
          <WorkspaceState title="Finding project…" loading>
            Checking the project and your membership.
          </WorkspaceState>
        ) : resource.status === "error" ? (
          <WorkspaceState
            title="Project unavailable"
            action={
              <button className="workspace-button" onClick={resource.retry}>
                Try again
              </button>
            }
          >
            Your project ID is saved. Try again when the service is available.
          </WorkspaceState>
        ) : !project ? (
          <WorkspaceState title="Project not found">
            Check the ID for your agency and try again.
          </WorkspaceState>
        ) : (
          <section className="workspace-panel membership-review">
            <h2 ref={heading} tabIndex={-1}>
              {project.projectName}
            </h2>
            <p>
              {agencyNames[project.orgId]} · Project {project.projectId}
            </p>
            {!members ? (
              <WorkspaceState
                title="Membership unavailable"
                action={
                  <button className="workspace-button" onClick={resource.retry}>
                    Check again
                  </button>
                }
              >
                We could not confirm your membership. No join action has been
                sent.
              </WorkspaceState>
            ) : members.includes(profile.id) ? (
              <>
                <p role="status">You’re already a member.</p>
                <Link
                  className="workspace-button"
                  to={projectPath(project)}
                  state={{ returnTo: back }}
                >
                  Open project
                </Link>
              </>
            ) : (
              <>
                <p>You have not joined this project.</p>
                <button
                  className="workspace-button"
                  onClick={() => {
                    membership.reset();
                    setReview(true);
                  }}
                >
                  Join project
                </button>
              </>
            )}
          </section>
        ))}
      {review && project && (
        <MembershipDialog
          project={project}
          profile={profile}
          action="join"
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

export default function JoinProject() {
  const profile = useWorkspace();
  const [params] = useSearchParams();
  const back = projectListReturn(params.get("returnTo"));
  const initialId = (params.get("projectId") || "").trim();
  const foreign =
    params.has("orgId") && params.get("orgId") !== profile.value?.agencyCode;
  return (
    <main className="workspace-page membership-page">
      <Link className="workspace-back" to={back}>
        ← Back to projects
      </Link>
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
          We could not verify your account.
        </WorkspaceState>
      ) : !profile.value?.agencyCode || foreign ? (
        <WorkspaceState
          headingLevel={1}
          title={foreign ? "Project outside your agency" : "Agency unavailable"}
        >
          Open a project in your verified agency before joining.
        </WorkspaceState>
      ) : (
        <JoinForm
          key={JSON.stringify([
            profile.value.id,
            profile.value.agencyCode,
            initialId,
          ])}
          profile={profile.value}
          initialId={initialId}
          back={back}
        />
      )}
    </main>
  );
}
