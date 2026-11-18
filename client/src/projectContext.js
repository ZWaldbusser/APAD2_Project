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

export const membershipIds = (project) =>
  Array.isArray(project?.joined_users) &&
  project.joined_users.every(isIdentifier)
    ? project.joined_users.map(String)
    : null;

export const projectListReturn = (value) =>
  typeof value === "string" &&
  (value === "/projects" || value.startsWith("/projects?"))
    ? value
    : "/projects";

export const projectJoinPath = (project, returnTo = "/projects?view=agency") =>
  `/joinproject?${new URLSearchParams({
    projectId: project.projectId,
    orgId: project.orgId,
    returnTo: projectListReturn(returnTo),
  })}`;

export const isProjectSummary = (project) =>
  project &&
  typeof project.projectId === "string" &&
  project.projectId.trim() !== "" &&
  typeof project.projectName === "string" &&
  project.projectName.trim() !== "" &&
  Object.hasOwn(agencyNames, project.orgId);

export const hasDisplayableDetails = (project) =>
  (project.projectDesc == null || typeof project.projectDesc === "string") &&
  (project.creatorId == null || isIdentifier(project.creatorId));
