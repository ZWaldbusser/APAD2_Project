// Shared HTTP layer for all backend services.
//
// Every call from the frontend goes through request(). It decides:
//   - mock mode or real mode (config.USE_MOCKS)
//   - which base URL to use (one for each service)
//   - the auth header
//   - 401 handling
//
// It always returns a standard fetch Response, so pages can keep using
// res.ok, res.status and res.json() in both modes.

import { SERVICE_URLS, USE_MOCKS, MOCK_DELAY_MS } from "../config";
import { handleMockRequest } from "../mocks";

export function getToken() {
  try {
    return localStorage.getItem("token");
  } catch {
    return null;
  }
}

function handleUnauthorized(res) {
  if (res.status === 401 && window.location.pathname !== "/login") {
    localStorage.removeItem("token");
    window.location.href = "/login";
  }
}

/**
 * @param {"users"|"projects"|"hardware"} service  Service that owns the route
 * @param {string} path                            Route path, e.g. "/api/projects"
 * @param {{method?: string, body?: object, auth?: boolean, headers?: object}} [options]
 *        body is a plain object. request() converts it to JSON.
 *        auth=false means "do not redirect on 401" (login, signup, etc.).
 * @returns {Promise<Response>}
 */
export async function request(service, path, options = {}) {
  const { method = "GET", body, auth = true, headers = {} } = options;
  const token = getToken();

  let res;
  if (USE_MOCKS) {
    res = await mockFetch(service, method, path, body, token);
  } else {
    const baseUrl = SERVICE_URLS[service];
    if (baseUrl === undefined) throw new Error(`Unknown service: ${service}`);
    res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token && { Authorization: `Bearer ${token}` }),
        ...headers,
      },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
  }

  if (auth) handleUnauthorized(res);
  return res;
}

async function mockFetch(service, method, path, body, token) {
  await new Promise((r) => setTimeout(r, MOCK_DELAY_MS));
  const { status, data } = handleMockRequest(service, method, path, body, token);
  console.debug(`[mock:${service}] ${method} ${path} -> ${status}`);
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
