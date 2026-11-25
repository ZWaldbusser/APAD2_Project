// Shared HTTP layer for all backend services.

import { SERVICE_URLS } from "../config";

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

// Data-gateway freshness metadata ({source, stale, service, fetchedAt, ageSeconds}) from the BFF.
const metaListeners = new Set();
export function onDataMeta(fn) {
  metaListeners.add(fn);
  return () => metaListeners.delete(fn);
}

function publishMeta(res) {
  if (!metaListeners.size || !res.headers.get("content-type")?.includes("json")) return;
  res.clone().json().then(
    (data) => { if (data && data.meta && typeof data.meta.stale === "boolean") metaListeners.forEach((fn) => fn(data.meta)); },
    () => {},
  );
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
  if (res.ok) publishMeta(res);
  return res;
}
