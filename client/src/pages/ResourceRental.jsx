import { useCallback, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { hardware, projects } from "../services";
import { useWorkspace } from "../context/WorkspaceContext";
import { useRead } from "../hooks/useRead";
import { agencyNames, isProjectSummary, projectPath } from "../projectContext";
import WorkspaceState from "../components/WorkspaceState";
import EquipmentDrawer from "../components/EquipmentDrawer";
import VendorAlternatives from "../components/VendorAlternatives";
import "../styles/ResourceRental.css";

const count = (value) => Number.isSafeInteger(value) && value >= 0;

function EquipmentInventory({ project }) {
  const [selected, setSelected] = useState(null);
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    const rows = await hardware.getProjectHardware(project.projectId);
    if (
      !rows.every(
        (row) =>
          row.project_id === project.projectId &&
          typeof row.hardware_id === "string" &&
          row.hardware_id &&
          count(row.allocated) &&
          count(row.checkedOut) &&
          row.checkedOut <= row.allocated,
      )
    )
      throw new Error("Invalid allocations");
    return rows;
  }, [project.projectId]);
  const data = useRead(load, project.projectId);
  const loadOwn = useCallback(async () => {
    const records = await hardware.getOutstandingCheckouts(
      project.projectId,
      project.orgId,
    );
    if (
      !records.every(
        (r) =>
          r.project_id === project.projectId &&
          typeof r.id === "string" &&
          typeof r.hardware_id === "string" &&
          count(r.quantity) &&
          count(r.returned) &&
          count(r.outstanding) &&
          r.returned <= r.quantity &&
          r.outstanding === r.quantity - r.returned,
      )
    )
      throw new Error("Invalid checkout records");
    return records;
  }, [project.projectId, project.orgId]);
  const own = useRead(
    loadOwn,
    JSON.stringify([project.orgId, project.projectId]),
  );
  const refresh = () => {
    data.retry();
    own.retry();
  };
  return (
    <>
      {notice && (
        <p role="status" className="equipment-notice">
          {notice}
        </p>
      )}
      <div className="equipment-toolbar">
        <p>
          Review your project’s allocation before checking equipment out or
          returning it.
        </p>
        <button
          className="workspace-button secondary"
          onClick={refresh}
          disabled={data.status === "loading"}
        >
          Refresh equipment
        </button>
      </div>
      {data.status === "loading" ? (
        <WorkspaceState title="Loading equipment…" loading>
          Getting current allocations and shared stock.
        </WorkspaceState>
      ) : data.status === "error" ? (
        <WorkspaceState
          title="Equipment unavailable"
          action={
            <button className="workspace-button" onClick={refresh}>
              Retry equipment
            </button>
          }
        >
          Your project context is saved. Refresh before making a change.
        </WorkspaceState>
      ) : data.value.length === 0 ? (
        <WorkspaceState title="No equipment allocated">
          No hardware is allocated to this project. Your team must allocate
          equipment before it can be checked out.
        </WorkspaceState>
      ) : (
        <div className="equipment-cards">
          {data.value.map((row) => {
            const stock = row.stock;
            const validStock =
              stock &&
              [stock.total, stock.available, stock.unallocated].every(count);
            const records =
              own.status === "ready"
                ? own.value.filter((r) => r.hardware_id === row.hardware_id)
                : null;
            const outstanding = records?.reduce(
              (total, r) => total + r.outstanding,
              0,
            );
            const returnLimit =
              outstanding != null && outstanding <= row.checkedOut
                ? outstanding
                : null;
            return (
              <section
                className="workspace-panel equipment-card"
                key={row.hardware_id}
                aria-label={row.name}
              >
                <div className="workspace-section-heading">
                  <div>
                    <p className="workspace-eyebrow">{row.hardware_id}</p>
                    <h2>{row.name}</h2>
                  </div>
                  <span className="equipment-badge">
                    {row.available > 0
                      ? "Ready in project"
                      : "Allocation fully checked out"}
                  </span>
                </div>
                <dl className="equipment-counts">
                  <div>
                    <dt>Project allocation</dt>
                    <dd>{row.allocated}</dd>
                  </div>
                  <div>
                    <dt>Checked out in project</dt>
                    <dd>{row.checkedOut}</dd>
                  </div>
                  <div>
                    <dt>Ready in project</dt>
                    <dd>{row.available}</dd>
                  </div>
                </dl>
                <p className="equipment-pool">
                  Shared pool:{" "}
                  {validStock
                    ? `${stock.total} total · ${stock.available} not checked out · ${stock.unallocated} unallocated`
                    : "Stock information unavailable"}
                  .
                </p>
                <p className="workspace-muted">
                  Shared stock may be reserved by other projects. Your checkout
                  limit is the remaining project allocation.
                </p>
                <div className="equipment-actions">
                  <button
                    className="workspace-button"
                    disabled={!row.available || !validStock}
                    onClick={() =>
                      setSelected({
                        row,
                        action: "checkout",
                        limit: row.available,
                      })
                    }
                  >
                    Check out {row.name}
                  </button>
                  <button
                    className="workspace-button secondary"
                    disabled={!returnLimit}
                    onClick={() =>
                      setSelected({
                        row,
                        action: "checkin",
                        limit: returnLimit,
                      })
                    }
                  >
                    Return {row.name}
                  </button>
                </div>
                {own.status === "loading" ? (
                  <p role="status">Loading your outstanding checkouts…</p>
                ) : returnLimit == null ? (
                  <p role="alert">
                    Your outstanding quantities are unavailable. Refresh
                    equipment before returning units.
                  </p>
                ) : returnLimit === 0 ? (
                  <p>You have no outstanding units to return.</p>
                ) : (
                  <details className="equipment-outstanding">
                    <summary>
                      Your outstanding checkouts ({returnLimit} units)
                    </summary>
                    <ul>
                      {records.map((r) => (
                        <li key={r.id}>
                          Checkout {r.id}: {r.quantity} borrowed · {r.returned}{" "}
                          returned · {r.outstanding} units outstanding.
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                {validStock && stock.available === 0 && (
                  <VendorAlternatives
                    project={project}
                    hardwareId={row.hardware_id}
                  />
                )}
              </section>
            );
          })}
        </div>
      )}
      {selected && (
        <EquipmentDrawer
          project={project}
          {...selected}
          onClose={() => setSelected(null)}
          onUncertain={refresh}
          onRefresh={() => {
            setSelected(null);
            refresh();
          }}
          onSaved={() => {
            setNotice(
              `${selected.action === "checkout" ? "Checkout" : "Return"} saved. Review the latest counts below.`,
            );
            setSelected(null);
            refresh();
          }}
        />
      )}
    </>
  );
}

function ProjectEquipmentPage({ projectId, orgId }) {
  const load = useCallback(async () => {
    const response = await projects.getProject(projectId, orgId);
    if (response.status === 404) return null;
    if (!response.ok) throw new Error("Project unavailable");
    const data = await response.json();
    const project = data.projectInfo || data;
    if (
      !isProjectSummary(project) ||
      project.projectId !== projectId ||
      project.orgId !== orgId
    )
      throw new Error("Invalid project context");
    return project;
  }, [projectId, orgId]);
  const project = useRead(load, JSON.stringify([orgId, projectId]));
  return project.status === "loading" ? (
    <WorkspaceState headingLevel={1} title="Loading project…" loading>
      Checking your project and agency.
    </WorkspaceState>
  ) : project.status === "error" ? (
    <WorkspaceState
      headingLevel={1}
      title="Project unavailable"
      action={
        <button className="workspace-button" onClick={project.retry}>
          Try again
        </button>
      }
    >
      We could not verify this project. No equipment changes are available.
    </WorkspaceState>
  ) : !project.value ? (
    <WorkspaceState headingLevel={1} title="Project not found">
      Return to your agency’s project list.
    </WorkspaceState>
  ) : (
    <>
      <div className="workspace-page-heading">
        <div>
          <p className="workspace-eyebrow">
            {orgId} · PROJECT {projectId}
          </p>
          <h1 id="equipment-title" tabIndex={-1}>
            {project.value.projectName} equipment
          </h1>
          <p>Resources assigned to your project.</p>
        </div>
        <Link
          className="workspace-button secondary"
          to={projectPath(project.value)}
        >
          View project details
        </Link>
      </div>
      <EquipmentInventory project={project.value} />
    </>
  );
}

export default function ResourceRental() {
  const { projectId } = useParams();
  const [params] = useSearchParams();
  const profile = useWorkspace();
  const agency = profile.value?.agencyCode;
  const orgId = params.has("orgId") ? params.get("orgId") : agency;
  return (
    <main className="workspace-page equipment-page">
      <Link className="workspace-back" to="/projects">
        ← Back to projects
      </Link>
      {profile.status === "loading" ? (
        <WorkspaceState headingLevel={1} title="Loading workspace…" loading>
          Checking your account.
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
      ) : !agency || !Object.hasOwn(agencyNames, orgId) ? (
        <WorkspaceState headingLevel={1} title="Agency unavailable">
          Confirm your agency before managing equipment.
        </WorkspaceState>
      ) : orgId !== agency ? (
        <WorkspaceState headingLevel={1} title="Project outside your agency">
          Open equipment from your agency’s project list.
        </WorkspaceState>
      ) : (
        <ProjectEquipmentPage
          key={JSON.stringify([orgId, projectId])}
          projectId={projectId}
          orgId={orgId}
        />
      )}
    </main>
  );
}
