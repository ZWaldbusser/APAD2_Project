// Mock router. Sends each request to the mock for its service.
// A route sent to the wrong service returns 404. This finds calls that
// use the wrong service name before the real services exist.

import { usersRoutes } from "./users";
import { projectsRoutes } from "./projects";
import { hardwareRoutes } from "./hardware";
import { visualizationRoutes } from "./visualization";
import { err } from "./db";

const routesByService = {
  users: usersRoutes,
  projects: projectsRoutes,
  hardware: hardwareRoutes,
  visualization: visualizationRoutes,
};

export function handleMockRequest(service, method, path, body, token) {
  const routes = routesByService[service];
  if (!routes) return err(500, `Unknown mock service: ${service}`);

  const cleanPath = path.split("?")[0];
  for (const [routeMethod, pattern, handler] of routes) {
    if (routeMethod !== method) continue;
    const match = cleanPath.match(pattern);
    if (match) return handler(match, body, token);
  }
  return err(404, `[mock:${service}] No route for ${method} ${cleanPath}`);
}
