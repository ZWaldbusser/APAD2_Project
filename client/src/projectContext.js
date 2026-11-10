export const agencyNames = {
  AUS: "City of Austin",
  DAL: "City of Dallas",
  TEX: "State of Texas",
};

export const projectPath = (project, suffix = "") =>
  `/projects/${encodeURIComponent(project.projectId)}${suffix}?orgId=${encodeURIComponent(project.orgId)}`;

export const isIdentifier = (value) =>
  (typeof value === "string" && value.trim() !== "") ||
  (typeof value === "number" && Number.isFinite(value));

export const isProjectSummary = (project) =>
  project &&
  typeof project.projectId === "string" &&
  project.projectId.trim() !== "" &&
  typeof project.projectName === "string" &&
  project.projectName.trim() !== "" &&
  Object.hasOwn(agencyNames, project.orgId);

export const hasDisplayableDetails = (project) =>
  (project.projectDesc == null || typeof project.projectDesc === "string") &&
  (project.creatorId == null || isIdentifier(project.creatorId)) &&
  (!Array.isArray(project.hardwareList) ||
    project.hardwareList.every(
      (item) =>
        item &&
        isIdentifier(item.hardwareId) &&
        typeof item.allocation === "number" &&
        Number.isFinite(item.allocation),
    ));
