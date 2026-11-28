// Shared HTTP layer for all backend services.

import { SERVICE_URLS } from "../config";
import { recordFreshness } from "./freshness";

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
    sessionStorage.removeItem("mfaToken");
    sessionStorage.setItem("authNotice", "session-ended");
    window.location.href = "/login";
  }
}

/**
 * @param {"users"|"projects"|"hardware"|"visualization"} service  Service that owns the route
 * @param {string} path                            Route path, e.g. "/api/projects"
 * @param {{method?: string, body?: object, auth?: boolean, headers?: object}} [options]
 *        body is a plain object. request() converts it to JSON.
 *        auth=false means "do not redirect on 401" (login, signup, etc.).
 * @returns {Promise<Response>}
 */
export async function request(service, path, options = {}) {
  const { method = "GET", body, auth = true, headers = {} } = options;
  const token = getToken();

  const baseUrl = SERVICE_URLS[service];
  if (baseUrl === undefined) throw new Error(`Unknown service: ${service}`);
  const res = await fetch(
    `${baseUrl}${service === "projects" ? "/api/projects-service" : ""}${path}`,
    {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    },
  );

  if (auth && service === "users") handleUnauthorized(res);
  if (res.ok && (service === "hardware" || service === "projects")) {
    try {
      const payload = await res.clone().json();
      if (token === getToken()) {
        recordFreshness(JSON.stringify([service, path, method, body]), service, payload.meta);
      }
    } catch {
      // The consumer handles malformed responses. Preserve the original body.
    }
  }
  return res;
}
