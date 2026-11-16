import { useCallback } from "react";
import { Link } from "react-router-dom";
import { hardware } from "../services";
import { useRead } from "../hooks/useRead";
import { isIdentifier, projectPath } from "../projectContext";

export default function ProjectEquipment({ project }) {
  const load = useCallback(async () => {
    const rows = await hardware.getProjectHardware(project.projectId);
    if (
      !Array.isArray(rows) ||
      !rows.every(
        (row) =>
          row &&
          isIdentifier(row.hardware_id) &&
          typeof row.allocated === "number" &&
          Number.isFinite(row.allocated),
      )
    )
      throw new Error("Invalid allocation response");
    return rows;
  }, [project.projectId]);
  const resource = useRead(load, JSON.stringify([project.orgId, project.projectId]));

  return (
    <section className="workspace-panel workspace-equipment">
      <div className="workspace-section-heading">
        <div>
          <h2>Equipment allocations</h2>
          <p className="workspace-muted">Resources assigned to this project.</p>
        </div>
        <Link
          className="workspace-button secondary"
          to={projectPath(project, "/resources")}
        >
          Manage equipment
        </Link>
      </div>
      {resource.status === "loading" ? (
        <p role="status">Loading equipment allocations…</p>
      ) : resource.status === "error" ? (
        <div>
          <p role="alert">
            Equipment unavailable. Your project details are still available.
          </p>
          <button className="workspace-button secondary" onClick={resource.retry}>
            Retry equipment
          </button>
        </div>
      ) : resource.value.length === 0 ? (
        <p>No equipment allocated yet.</p>
      ) : (
        <div className="workspace-table-wrap">
          <table>
            <caption className="workspace-sr-only">
              Equipment allocated to {project.projectName}
            </caption>
            <thead>
              <tr>
                <th scope="col">Hardware ID</th>
                <th scope="col">Allocated units</th>
              </tr>
            </thead>
            <tbody>
              {resource.value.map((row) => (
                <tr key={row.hardware_id}>
                  <td>{row.hardware_id}</td>
                  <td>{row.allocated}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
