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

test('the equipment outage fixture leaves Projects available and does not simulate Hardware writes', () => {
  sessionStorage.setItem('haas-project-fixture', 'hardware-unavailable');
  expect(handleMockRequest('hardware', 'POST', '/api/listAllocations', { projectId: 'P1' }, 'mock-token.u1').status).toBe(503);
  expect(handleMockRequest('hardware', 'POST', '/api/hardware', {}, 'mock-token.u1').status).toBe(503);
  expect(handleMockRequest('projects', 'GET', '/projects/P1?orgId=AUS', undefined, 'mock-token.u1').status).toBe(200);
  // Writes continue to use their existing handler and validation.
  expect(handleMockRequest('hardware', 'POST', '/api/hardware/checkout', {}, 'mock-token.u1').status).toBe(400);
});
