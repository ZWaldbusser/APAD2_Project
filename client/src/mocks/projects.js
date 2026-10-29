// Mock Projects service.

import { db, newId, ok, err, requireUser } from "./db";

const findProject = (projectID) => db.projects.find((p) => p.projectID === projectID);

export const projectsRoutes = [
  ["GET", /^\/api\/projects$/, (_m, _b, token) => {
    const { userId, error } = requireUser(token);
    if (error) return error;
    return ok(
      db.projects
        .filter((p) => p.users.includes(userId))
        // The list response has no hwSets (same as the monolith).
        .map(({ id, name, description, projectID, users }) => ({ id, name, description, projectID, users }))
    );
  }],

  ["POST", /^\/api\/projects$/, (_m, body, token) => {
    const { userId, error } = requireUser(token);
    if (error) return error;
    if (!body?.projectID || body.name === undefined || body.description === undefined)
      return err(400, "name, description, and projectID are required");
    if (findProject(body.projectID)) return err(409, "projectID already exists");
    db.projects.push({
      id: newId("p"),
      projectID: body.projectID,
      name: body.name,
      description: body.description,
      users: [userId],
      hwSets: {},
    });
    return ok({ message: "Project created", projectID: body.projectID }, 201);
  }],

  ["POST", /^\/api\/projects\/([^/]+)\/join$/, (m, _b, token) => {
    const { userId, error } = requireUser(token);
    if (error) return error;
    const project = findProject(decodeURIComponent(m[1]));
    if (!project) return err(404, "Project not found");
    if (project.users.includes(userId)) return err(409, "You are already a member of this project");
    project.users.push(userId);
    return ok({ message: "Joined project" });
  }],

  // No auth on this route in the monolith. Kept the same.
  ["GET", /^\/api\/projects\/([^/]+)$/, (m) => {
    const project = findProject(decodeURIComponent(m[1]));
    if (!project) return err(404, "Project not found");
    return ok({ ...project, hwSets: { ...project.hwSets } });
  }],
];
