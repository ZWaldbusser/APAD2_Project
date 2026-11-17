// Browser requests use Flask adapters; upstream URLs and credentials stay on the server.
const env = import.meta.env;
const clean = (url) => (url || "").replace(/\/$/, "");

export const API_BASE_URL = clean(env.VITE_API_BASE_URL);
export const SERVICE_URLS = {
  users: API_BASE_URL,
  projects: API_BASE_URL,
  hardware: API_BASE_URL,
  visualization: clean(env.VITE_VISUALIZATION_URL) || API_BASE_URL,
};
// Only the unconfirmed Overview aggregate may use an explicitly labelled sample.
// Users/MFA, Projects and Hardware always use the configured Flask adapters.
export const USE_VISUALIZATION_MOCKS =
  env.VITE_USE_VISUALIZATION_MOCKS === "true";

// Compatibility for the unmerged notification component in PR #22.
// This is never an environment-controlled mode and enables no app mocks.
export const USE_MOCKS = false;
