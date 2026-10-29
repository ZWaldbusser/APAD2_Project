// Mock Hardware service.
//
// Checkout and checkin also change the project's hwSets. In this mock the
// hardware service writes to the project data directly. In the real system
// this becomes a call between services (or two calls from the frontend).
// That decision is still open.

import { db, ok, err, requireUser } from "./db";

const findHw = (name) => db.hardware.find((h) => h.name === name);
const findProject = (projectID) => db.projects.find((p) => p.projectID === projectID);

function validate(body) {
  if (!body || body.name === undefined || body.quantity === undefined || body.projectId === undefined)
    return err(400, "name, quantity, and projectId are required");
  if (!Number.isInteger(body.quantity) || body.quantity <= 0)
    return err(400, "quantity must be a positive integer");
  return null;
}

export const hardwareRoutes = [
  ["GET", /^\/api\/hardware$/, () => ok(db.hardware.map((h) => ({ ...h })))],

  ["POST", /^\/api\/hardware\/checkout$/, (_m, body, token) => {
    const { error } = requireUser(token);
    if (error) return error;
    const invalid = validate(body);
    if (invalid) return invalid;

    const hw = findHw(body.name);
    if (!hw) return err(400, "Hardware set not found");
    if (hw.available < body.quantity) return err(400, "Not enough available units");
    const project = findProject(body.projectId);
    if (!project) return err(404, "Project not found");

    hw.available -= body.quantity;
    project.hwSets[body.name] = (project.hwSets[body.name] || 0) + body.quantity;
    return ok({ message: "Checkout successful" });
  }],

  ["POST", /^\/api\/hardware\/checkin$/, (_m, body, token) => {
    const { error } = requireUser(token);
    if (error) return error;
    const invalid = validate(body);
    if (invalid) return invalid;

    const project = findProject(body.projectId);
    if (!project) return err(404, "Project not found");
    const current = project.hwSets[body.name] || 0;
    if (current < body.quantity) return err(400, "Cannot return more than this project has checked out");
    const hw = findHw(body.name);
    if (!hw) return err(400, "Hardware set not found");

    hw.available = Math.min(hw.capacity, hw.available + body.quantity);
    project.hwSets[body.name] = current - body.quantity;
    return ok({ message: "Check-in successful" });
  }],
];
