// Mock Projects service — matches the new Project microservice API contract.

import { db, ok, err, requireUser } from "./db";

const findProject = (projectId) => db.projects.find((p) => p.projectID === projectId);

export const projectsRoutes = [
  // Search projects: POST /projects/search_project
  ["POST", /^\/projects\/search_project$/, (_m, body, _token) => {
    let results = db.projects;

    const filterById = body?.projectId && body.projectId.trim();
    const filterByCreator = body?.projectCreatorId && body.projectCreatorId.trim();

    if (filterById) {
      results = results.filter((p) => p.projectID === filterById);
    }
    if (filterByCreator) {
      results = results.filter((p) => p.projectCreatorId === filterByCreator);
    }

    return ok({
      projectList: results.map(({ projectID, name, projectCreatorId }) => ({
        projectId: projectID,
        projectName: name,
        projectCreatorId: projectCreatorId || "unknown",
      })),
    });
  }],

  // Create project: POST /projects/create_project
  ["POST", /^\/projects\/create_project$/, (_m, body, _token) => {
    if (!body?.projectId || !body?.projectName || body.budget === undefined || !body?.projectCreatorId) {
      return err(422, "Missing required fields");
    }
    if (findProject(body.projectId)) return err(500, "Duplicate projectId");

    db.projects.push({
      id: `p${Date.now()}`,
      projectID: body.projectId,
      name: body.projectName,
      description: body.projectDesc || "",
      projectCreatorId: body.projectCreatorId,
      budget: body.budget,
      hardwareList: body.hardwareList || [],
      users: [],
      hwSets: {},
    });
    return ok({ success: true, errorMessage: "" });
  }],

  // Join project: POST /projects/join_project
  ["POST", /^\/projects\/join_project$/, (_m, body, _token) => {
    if (!body?.projectId || !body?.projectCreatorId || !body?.userId) {
      return err(422, "Missing required fields");
    }
    const project = findProject(body.projectId);
    if (!project) return { status: 404, data: { detail: "Project not found" } };
    if (project.users.includes(body.userId)) {
      return { status: 409, data: { detail: "User already joined this project" } };
    }
    project.users.push(body.userId);
    return ok({ success: true, errorMessage: "" });
  }],

  // Leave project: POST /projects/leave_project
  ["POST", /^\/projects\/leave_project$/, (_m, body, _token) => {
    if (!body?.projectId || !body?.projectCreatorId || !body?.userId) {
      return err(422, "Missing required fields");
    }
    const project = findProject(body.projectId);
    if (!project) return { status: 404, data: { detail: "Project not found" } };
    const idx = project.users.indexOf(body.userId);
    if (idx === -1) {
      return { status: 409, data: { detail: "User is not a member of this project" } };
    }
    project.users.splice(idx, 1);
    return ok({ success: true, errorMessage: "" });
  }],

  // Project detail: GET /projects/{projectId}
  ["GET", /^\/projects\/([^/]+)$/, (m) => {
    const project = findProject(decodeURIComponent(m[1]));
    if (!project) return { status: 404, data: { detail: "Project not found" } };
    return ok({
      projectInfo: {
        projectId: project.projectID,
        projectName: project.name,
        projectDesc: project.description || "",
        projectCreatorId: project.projectCreatorId || "unknown",
        budget: project.budget || 0,
        hardwareList: project.hardwareList || [],
        joined_users: project.users || [],
      },
    });
  }],
];
