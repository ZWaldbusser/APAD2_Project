// Mock Hardware service.
//
// Checkout and checkin also change the project's hwSets. In this mock the
// hardware service writes to the project data directly. In the real system
// this becomes a call between services (or two calls from the frontend).
// That decision is still open.

import { db, ok, err, requireUser } from "./db";
import { getProjectFixture } from "./preview";

const findHw = (name) => db.hardware.find((h) => h.name === name);
const findProject = (projectID) =>
  db.projects.find((p) => p.projectID === projectID);
const reserved = (id) =>
  db.allocations
    .filter((item) => item.hardware_id === id)
    .reduce((sum, item) => sum + item.quantity, 0);

function validate(body) {
  if (
    !body ||
    body.name === undefined ||
    body.quantity === undefined ||
    body.projectId === undefined
  )
    return err(400, "name, quantity, and projectId are required");
  if (!Number.isInteger(body.quantity) || body.quantity <= 0)
    return err(400, "quantity must be a positive integer");
  return null;
}

// Contract-shaped read fixtures for the current Hardware client. These are local
// simulations, not evidence of provider authorization or tenant isolation.
export const hardwareRoutes = [
  [
    "POST",
    /^\/api\/hardware$/,
    () =>
      ok(
        db.hardware.map((h) => ({
          ...h,
          total: h.capacity,
          reserved: reserved(h.id),
          unallocated: h.capacity - reserved(h.id),
          version: h.version ?? 1,
        })),
      ),
  ],
  [
    "POST",
    /^\/api\/listAllocations$/,
    (_m, body) => {
      const project = findProject(body?.projectId);
      if (!project) return ok([]);
      return ok(
        db.allocations
          .filter((item) => item.project_id === project.projectID)
          .map((item) => ({
            ...item,
            out:
              project.hwSets[
                db.hardware.find((h) => h.id === item.hardware_id)?.name
              ] || 0,
          })),
      );
    },
  ],
  [
    "POST",
    /^\/api\/hardware\/([^/]+)\/allocations\/([^/]+)$/,
    (match, body, token) => {
      const { error } = requireUser(token);
      if (error) return error;
      const id = decodeURIComponent(match[1]),
        projectId = decodeURIComponent(match[2]);
      const hw = db.hardware.find((item) => item.id === id);
      const project = db.projects.find(
        (item) => item.projectID === projectId && item.orgId === body?.orgId,
      );
      if (!hw || !project) return err(404, "Hardware or project not found");
      const key = `${project.orgId}/${projectId}/${id}`;
      if (
        getProjectFixture() === "allocation-partial" &&
        id === "HW002" &&
        !db.allocationFailures.includes(key)
      ) {
        db.allocationFailures.push(key);
        return err(503, "Sample allocation outage; retry this allocation");
      }
      if (body.expected_version !== (hw.version ?? 1))
        return err(409, "Inventory changed; retry with current stock");
      const existing = db.allocations.find(
        (item) => item.hardware_id === id && item.project_id === projectId,
      );
      if (
        !Number.isInteger(body.quantity) ||
        body.quantity < 0 ||
        body.quantity > hw.capacity - reserved(id) + (existing?.quantity || 0)
      )
        return err(400, "Allocation exceeds unallocated stock");
      if (existing) existing.quantity = body.quantity;
      else
        db.allocations.push({
          hardware_id: id,
          project_id: projectId,
          quantity: body.quantity,
        });
      hw.version = (hw.version ?? 1) + 1;
      return ok({ success: true });
    },
  ],
  ["GET", /^\/api\/hardware$/, () => ok(db.hardware.map((h) => ({ ...h })))],

  [
    "POST",
    /^\/api\/hardware\/checkout$/,
    (_m, body, token) => {
      const { error } = requireUser(token);
      if (error) return error;
      const invalid = validate(body);
      if (invalid) return invalid;

      const hw = findHw(body.name);
      if (!hw) return err(400, "Hardware set not found");
      if (hw.available < body.quantity)
        return err(400, "Not enough available units");
      const project = findProject(body.projectId);
      if (!project) return err(404, "Project not found");

      hw.available -= body.quantity;
      project.hwSets[body.name] =
        (project.hwSets[body.name] || 0) + body.quantity;
      return ok({ message: "Checkout successful" });
    },
  ],

  [
    "POST",
    /^\/api\/hardware\/checkin$/,
    (_m, body, token) => {
      const { error } = requireUser(token);
      if (error) return error;
      const invalid = validate(body);
      if (invalid) return invalid;

      const project = findProject(body.projectId);
      if (!project) return err(404, "Project not found");
      const current = project.hwSets[body.name] || 0;
      if (current < body.quantity)
        return err(400, "Cannot return more than this project has checked out");
      const hw = findHw(body.name);
      if (!hw) return err(400, "Hardware set not found");

      hw.available = Math.min(hw.capacity, hw.available + body.quantity);
      project.hwSets[body.name] = current - body.quantity;
      return ok({ message: "Check-in successful" });
    },
  ],
];
