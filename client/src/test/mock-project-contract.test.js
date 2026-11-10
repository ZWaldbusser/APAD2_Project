import { afterEach, expect, test } from "vitest";
import { handleMockRequest } from "../mocks";

afterEach(() => sessionStorage.clear());

test("mock detail routing preserves the agency query rather than substituting Austin", () => {
  const result = handleMockRequest(
    "projects",
    "GET",
    "/projects/P2?orgId=DAL",
    undefined,
    "mock-token.u2",
  );
  expect(result.status).toBe(200);
  expect(result.data.projectInfo).toMatchObject({
    orgId: "DAL",
    projectId: "P2",
  });
  expect(
    handleMockRequest(
      "projects",
      "GET",
      "/projects/P1",
      undefined,
      "mock-token.u1",
    ).status,
  ).toBe(422);
});

test("local review fixtures can demonstrate an empty agency without changing seed data", () => {
  sessionStorage.setItem("haas-project-fixture", "empty");
  expect(
    handleMockRequest(
      "projects",
      "POST",
      "/projects/search_project",
      { orgId: "AUS" },
      "mock-token.u1",
    ),
  ).toEqual({ status: 200, data: { projectList: [] } });
});

test("local review fixtures distinguish unavailable service from missing detail", () => {
  sessionStorage.setItem("haas-project-fixture", "unavailable");
  expect(
    handleMockRequest(
      "projects",
      "POST",
      "/projects/search_project",
      { orgId: "AUS" },
      "mock-token.u1",
    ).status,
  ).toBe(503);
  sessionStorage.setItem("haas-project-fixture", "not-found");
  expect(
    handleMockRequest(
      "projects",
      "GET",
      "/projects/P1?orgId=AUS",
      undefined,
      "mock-token.u1",
    ).status,
  ).toBe(404);
});
