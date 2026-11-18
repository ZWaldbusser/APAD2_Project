import { afterEach, expect, test, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

test("membership search sends a canonical user filter and preserves returned member IDs", async () => {
  localStorage.setItem("token", "isolated-access-token");
  const result = { projectList: [{
    orgId: "AUS", projectId: "P1", projectName: "Library", joined_users: ["0007"],
  }] };
  const transport = vi.fn().mockResolvedValue(new Response(JSON.stringify(result)));
  vi.stubGlobal("fetch", transport);
  const { searchProjects } = await import("../services/projects");
  const response = await searchProjects({ orgId: "AUS", projectId: "P1", userId: "0007" });
  expect(await response.json()).toEqual(result);
  expect(transport).toHaveBeenCalledWith(
    "/api/projects-service/projects/search_project",
    expect.objectContaining({ body: JSON.stringify({ orgId: "AUS", projectId: "P1", userId: "0007" }) }),
  );
});
