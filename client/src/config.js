// Frontend configuration — single source of truth for all service URLs.
//
// To change a service URL:
//   1. For local dev:   set VITE_*_URL in .env or .env.local
//   2. For production:  update PROD_URLS below
//   3. For all services: set VITE_API_BASE_URL (legacy monolith fallback)
//
// Priority: env var → production URL → legacy fallback
//
// Vite reads VITE_* variables at BUILD time. On Heroku/Azure, change the
// config vars and then rebuild. A restart alone does not apply new values.

const env = import.meta.env;
const clean = (url) => (url || "").replace(/\/$/, "");

// Legacy single URL (monolith). Used as the last-resort fallback.
export const API_BASE_URL = clean(env.VITE_API_BASE_URL);

// ──────────────────────────────────────────────────────────────
// Production URLs — update here when a backend team deploys.
// Leave empty ("") until the team provides their URL.
// ──────────────────────────────────────────────────────────────
const PROD_URLS = {
  users:         "",
  projects:      "https://projects-api.jollypond-07d76cbc.northcentralus.azurecontainerapps.io",
  hardware:      "https://hardware-app.nicecoast-3095250d.westus.azurecontainerapps.io",
  visualization: "",
};

const svc = (envVar, service) => clean(envVar) || PROD_URLS[service] || API_BASE_URL;

export const SERVICE_URLS = {
  users:         svc(env.VITE_USERS_URL,          "users"),
  projects:      svc(env.VITE_PROJECTS_URL,       "projects"),
  hardware:      svc(env.VITE_HARDWARE_URL,       "hardware"),
  visualization: svc(env.VITE_VISUALIZATION_URL,  "visualization"),
};

// Mocks are ON unless VITE_USE_MOCKS is set to "false".
// The real services do not exist yet, so the default is mock mode.
export const USE_MOCKS = env.VITE_USE_MOCKS !== "false";

// Fake network delay in mock mode (ms), so loading states are visible.
export const MOCK_DELAY_MS = Number(env.VITE_MOCK_DELAY_MS ?? 300);
