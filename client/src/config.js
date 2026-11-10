// Frontend configuration.
//
// Each backend service has its own base URL. When a VITE_*_URL env var is set
// it takes precedence; otherwise the service falls back to the hardcoded
// production URL below, then to the legacy monolith URL.
//
// Vite reads VITE_* variables at BUILD time. On Heroku/Azure, change the
// config vars and then rebuild. A restart alone does not apply new values.

const env = import.meta.env;
const clean = (url) => (url || "").replace(/\/$/, "");

// Legacy single URL (monolith). Used as the last-resort fallback.
export const API_BASE_URL = clean(env.VITE_API_BASE_URL);

// Production URLs for each microservice (hardcoded defaults).
const PROD_URLS = {
  users: "",
  projects: "https://projects-api.jollypond-07d76cbc.northcentralus.azurecontainerapps.io",
  hardware: "",
};

export const SERVICE_URLS = {
  users: clean(env.VITE_USERS_URL) || PROD_URLS.users || API_BASE_URL,
  projects: clean(env.VITE_PROJECTS_URL) || PROD_URLS.projects || API_BASE_URL,
  hardware: clean(env.VITE_HARDWARE_URL) || PROD_URLS.hardware || API_BASE_URL,
  visualization: clean(env.VITE_VISUALIZATION_URL) || API_BASE_URL,
};

// Mocks are ON unless VITE_USE_MOCKS is set to "false".
// The real services do not exist yet, so the default is mock mode.
export const USE_MOCKS = env.VITE_USE_MOCKS !== "false";

// Fake network delay in mock mode (ms), so loading states are visible.
export const MOCK_DELAY_MS = Number(env.VITE_MOCK_DELAY_MS ?? 300);
