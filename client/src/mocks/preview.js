// Development-only review scenarios. These never intercept live service calls.
export function getProjectFixture() {
  if (!import.meta.env.DEV) return "standard";
  try {
    return sessionStorage.getItem("haas-project-fixture") || "standard";
  } catch {
    return "standard";
  }
}
