// Frontend configuration.
//
// Each backend service has its own base URL. If the team adds an API gateway,
// set all three to the gateway URL. No other code needs to change.
//
// Vite reads VITE_* variables at BUILD time. On Heroku, change the config vars
// and then rebuild. A restart alone does not apply new values.

const env = import.meta.env;
const clean = (url) => (url || "").replace(/\/$/, "");

// Legacy single URL (monolith). Used as the fallback for each service.
export const API_BASE_URL = clean(env.VITE_API_BASE_URL);

export const SERVICE_URLS = {
  users: clean(env.VITE_USERS_URL) || API_BASE_URL,
  projects: clean(env.VITE_PROJECTS_URL) || API_BASE_URL,
  hardware: clean(env.VITE_HARDWARE_URL) || API_BASE_URL,
  dashboard: clean(env.VITE_DASHBOARD_URL) || API_BASE_URL,
};

// Mocks are ON unless VITE_USE_MOCKS is set to "false".
// The real services do not exist yet, so the default is mock mode.
export const USE_MOCKS = env.VITE_USE_MOCKS !== "false";

// Fake network delay in mock mode (ms), so loading states are visible.
export const MOCK_DELAY_MS = Number(env.VITE_MOCK_DELAY_MS ?? 300);
