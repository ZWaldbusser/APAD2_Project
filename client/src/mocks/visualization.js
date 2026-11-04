// Mock Visualization service.
//
// PLACEHOLDER DATA. The pipeline team has not given us a contract yet.
// The metrics come from the other mocks, so the page shows real numbers in
// mock mode. The "pipelines" list is example data only.

import { db, ok, requireUser } from "./db";

export const visualizationRoutes = [
  ["GET", /^\/api\/visualization$/, (_m, _b, token) => {
    const { userId, error } = requireUser(token);
    if (error) return error;

    const myProjects = db.projects.filter((p) => p.users.includes(userId));
    const capacity = db.hardware.reduce((sum, h) => sum + h.capacity, 0);
    const available = db.hardware.reduce((sum, h) => sum + h.available, 0);

    return ok({
      generatedAt: new Date().toISOString(),
      metrics: [
        { key: "projects", label: "My Projects", value: myProjects.length },
        { key: "hwCapacity", label: "Hardware Capacity", value: capacity },
        { key: "hwOut", label: "Units Checked Out", value: capacity - available },
        { key: "hwAvailable", label: "Units Available", value: available },
      ],
      hardware: db.hardware.map(({ name, capacity: cap, available: avail }) => ({
        name,
        capacity: cap,
        available: avail,
      })),
      pipelines: [
        { id: "pipeline-a", name: "Example Pipeline A", status: "not_connected", lastRun: null },
        { id: "pipeline-b", name: "Example Pipeline B", status: "not_connected", lastRun: null },
      ],
    });
  }],
];
