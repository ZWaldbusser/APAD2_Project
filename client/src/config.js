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
export const USE_MOCKS = env.VITE_USE_MOCKS === "true";
export const MOCK_DELAY_MS = Number(env.VITE_MOCK_DELAY_MS ?? 300);
