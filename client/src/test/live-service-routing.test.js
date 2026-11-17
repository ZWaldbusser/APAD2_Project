import { afterEach, beforeEach, expect, test, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("VITE_USE_MOCKS", "true");
  vi.stubEnv("VITE_USE_VISUALIZATION_MOCKS", "true");
  vi.stubEnv("VITE_API_BASE_URL", "");
  localStorage.setItem("token", "test-access-token");
});

test("Overview uses its configured endpoint unless its separate sample option is enabled", async () => {
  vi.stubEnv("VITE_USE_VISUALIZATION_MOCKS", "false");
  const expected = new Response(
    JSON.stringify({ metrics: [], hardware: [], pipelines: [] }),
  );
  const transport = vi.fn().mockResolvedValue(expected);
  vi.stubGlobal("fetch", transport);
  const { getVisualization } = await import("../services/visualization");
  expect(await getVisualization()).toBe(expected);
  expect(transport).toHaveBeenCalledExactlyOnceWith(
    "/api/visualization",
    expect.objectContaining({ method: "GET" }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  localStorage.clear();
});

test.each([
  ["users", "/api/users-service/me", {}, "/api/users-service/me", "GET"],
  [
    "projects",
    "/projects/search_project",
    { method: "POST", body: { orgId: "AUS", projectId: null } },
    "/api/projects-service/projects/search_project",
    "POST",
  ],
  [
    "hardware",
    "/api/hardware",
    { method: "POST", body: { page: 1, size: 100 } },
    "/api/hardware",
    "POST",
  ],
])(
  "%s always reaches the adapter even if an old global mock flag remains set",
  async (service, path, options, expectedUrl, expectedMethod) => {
    const expected = new Response(JSON.stringify({ from: "adapter" }), {
      status: service === "hardware" ? 503 : 200,
    });
    const transport = vi.fn().mockResolvedValue(expected);
    vi.stubGlobal("fetch", transport);
    const { request } = await import("../services/http");
    expect(await request(service, path, options)).toBe(expected);
    expect(transport).toHaveBeenCalledExactlyOnceWith(
      expectedUrl,
      expect.objectContaining({
        method: expectedMethod,
        headers: expect.objectContaining({
          Authorization: "Bearer test-access-token",
        }),
        ...(options.body && { body: JSON.stringify(options.body) }),
      }),
    );
  },
);
