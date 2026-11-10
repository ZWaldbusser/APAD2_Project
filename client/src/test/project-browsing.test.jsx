import { beforeEach, expect, test, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import { request } from "../services/http";

vi.mock("../services/http", () => ({ request: vi.fn() }));

const profile = { id: "u1", userid: "demo", agencyCode: "AUS" };
const summaries = [
  {
    orgId: "AUS",
    projectId: "P1 / north",
    projectName: "Library network refresh",
  },
  { orgId: "AUS", projectId: "P2", projectName: "Field operations" },
];
const detail = {
  ...summaries[0],
  projectDesc: "Replace aging public terminals.",
  creatorId: "u1",
  budget: 0,
  joined_users: ["u1"],
  hardwareList: [],
};
const response = (data, status = 200) =>
  new Response(JSON.stringify(data), { status });

beforeEach(() => {
  localStorage.setItem("token", "mock-token.u1");
  window.history.replaceState({}, "", "/projects");
  request.mockReset();
  request.mockImplementation(async (service, path) => {
    if (service === "users") return response(profile);
    if (path === "/projects/search_project")
      return response({ projectList: summaries });
    return response({ projectInfo: detail });
  });
});

test("does not request projects or invent an agency when the profile has none", async () => {
  request.mockResolvedValue(response({ id: "u1", userid: "demo" }));
  render(<App />);
  expect(
    await screen.findByRole("heading", { name: "Agency unavailable" }),
  ).toBeInTheDocument();
  expect(request.mock.calls.some(([service]) => service === "projects")).toBe(
    false,
  );
});

test("shows loading, reports a service failure, and recovers with the saved search", async () => {
  const user = userEvent.setup();
  let finish;
  request.mockImplementation(async (service) =>
    service === "users"
      ? response(profile)
      : new Promise((resolve) => {
          finish = resolve;
        }),
  );
  render(<App />);
  expect(
    await screen.findByRole("heading", { name: "Loading projects…" }),
  ).toBeInTheDocument();
  await user.type(screen.getByRole("searchbox"), "library");
  await act(async () => finish(response({ error: "Offline" }, 503)));
  expect(
    await screen.findByRole("heading", { name: "Projects unavailable" }),
  ).toBeInTheDocument();
  expect(screen.queryByText("No agency projects yet")).not.toBeInTheDocument();
  request.mockResolvedValue(response({ projectList: summaries }));
  await user.click(screen.getByRole("button", { name: "Try again" }));
  expect(
    await screen.findByRole("link", { name: "Library network refresh" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("searchbox")).toHaveValue("library");
});

test("distinguishes an empty agency from a search with no matches", async () => {
  const user = userEvent.setup();
  render(<App />);
  await screen.findByRole("link", { name: "Library network refresh" });
  await user.type(screen.getByRole("searchbox"), "missing");
  expect(
    screen.getByRole("heading", { name: "No matching projects" }),
  ).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Clear search" }));
  expect(
    screen.getByRole("link", { name: "Library network refresh" }),
  ).toBeInTheDocument();
  // Return to this agency after its last project is removed by the provider.
  request.mockImplementation(async (service, path) =>
    service === "users"
      ? response(profile)
      : path === "/projects/search_project"
        ? response({ projectList: [] })
        : response({}, 404),
  );
  await user.click(
    screen.getByRole("link", { name: "Library network refresh" }),
  );
  await screen.findByRole("heading", { name: "Project not found" });
  await user.click(screen.getByRole("link", { name: "← Back to projects" }));
  expect(
    await screen.findByRole("heading", { name: "No agency projects yet" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("heading", { name: "No matching projects" }),
  ).not.toBeInTheDocument();
});

test("searches by name and ID, preserves both identifiers, and returns to the search", async () => {
  const user = userEvent.setup();
  render(<App />);
  const search = await screen.findByRole("searchbox", {
    name: "Search projects",
  });
  await screen.findByRole("link", { name: "Library network refresh" });
  await user.type(search, "library");
  expect(
    screen.queryByRole("link", { name: "Field operations" }),
  ).not.toBeInTheDocument();
  await user.clear(search);
  await user.type(search, "P1 / north");
  const projectLink = screen.getByRole("link", {
    name: "Library network refresh",
  });
  expect(projectLink.getAttribute("href")).toContain(
    "/projects/P1%20%2F%20north?orgId=AUS",
  );
  await user.click(projectLink);
  expect(
    await screen.findByRole("heading", { name: "Library network refresh" }),
  ).toBeInTheDocument();
  expect(screen.getByText("$0")).toBeInTheDocument();
  await user.click(screen.getByRole("link", { name: "Back to projects" }));
  expect(
    await screen.findByRole("searchbox", { name: "Search projects" }),
  ).toHaveValue("P1 / north");
  expect(request).toHaveBeenCalledWith(
    "projects",
    "/projects/search_project",
    expect.objectContaining({ body: { orgId: "AUS", projectId: null } }),
  );
  expect(
    within(screen.getByRole("main")).queryByText("My projects"),
  ).not.toBeInTheDocument();
});

test.each([
  [404, null, "Project not found"],
  [503, null, "Project unavailable"],
  [200, { ...detail, joined_users: undefined }, "Membership unavailable"],
  [200, { ...detail, joined_users: ["someone-else"] }, "Membership required"],
])(
  "detail response %s gives the right recovery state (%s)",
  async (status, project, heading) => {
    window.history.replaceState({}, "", "/projects/P1%20%2F%20north?orgId=AUS");
    request.mockImplementation(async (service) =>
      service === "users"
        ? response(profile)
        : response({ projectInfo: project }, status),
    );
    render(<App />);
    expect(
      await screen.findByRole("heading", { name: heading }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: detail.projectName }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "← Back to projects" }),
    ).toHaveAttribute("href", "/projects");
  },
);

test.each([
  ["?orgId=DAL", "Project outside your agency"],
  ["?orgId=", "Agency unavailable"],
  ["?orgId=unknown", "Agency unavailable"],
])(
  "rejects an unsupported or foreign deep-link agency %s without fetching a project",
  async (query, heading) => {
    window.history.replaceState({}, "", `/projects/P1${query}`);
    render(<App />);
    expect(
      await screen.findByRole("heading", { name: heading }),
    ).toBeInTheDocument();
    expect(request.mock.calls.some(([service]) => service === "projects")).toBe(
      false,
    );
  },
);

test("legacy bare deep links use the known account agency and canonical numeric ID", async () => {
  window.history.replaceState({}, "", "/projects/P2");
  request.mockImplementation(async (service) =>
    service === "users"
      ? response({ user_id: 7, username: "staff", agency_code: "DAL" })
      : response({
          projectInfo: {
            orgId: "DAL",
            projectId: "P2",
            projectName: "Dallas civic network",
            joined_users: ["7"],
            budget: 120,
            hardwareList: [],
          },
        }),
  );
  render(<App />);
  expect(
    await screen.findByRole("heading", { name: "Dallas civic network" }),
  ).toBeInTheDocument();
  expect(screen.getByText("You’re a member")).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Manage equipment" }),
  ).toHaveAttribute("href", "/projects/P2/resources?orgId=DAL");
  expect(request).toHaveBeenCalledWith("projects", "/projects/P2?orgId=DAL");
});

test("discards out-of-agency summaries and never opens a mismatched detail", async () => {
  const user = userEvent.setup();
  request.mockImplementation(async (service, path) => {
    if (service === "users") return response(profile);
    if (path === "/projects/search_project")
      return response({
        projectList: [
          ...summaries,
          {
            orgId: "DAL",
            projectId: "P1 / north",
            projectName: "Other agency project",
          },
        ],
      });
    return response({ projectInfo: { ...detail, orgId: "DAL" } });
  });
  render(<App />);
  await screen.findByRole("link", { name: detail.projectName });
  expect(screen.queryByText("Other agency project")).not.toBeInTheDocument();
  await user.click(screen.getByRole("link", { name: detail.projectName }));
  expect(
    await screen.findByRole("heading", { name: "Project unavailable" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByText("Replace aging public terminals."),
  ).not.toBeInTheDocument();
});

test("shows the full provider budget including cents", async () => {
  window.history.replaceState({}, "", "/projects/P1%20%2F%20north?orgId=AUS");
  request.mockImplementation(async (service) =>
    service === "users"
      ? response(profile)
      : response({ projectInfo: { ...detail, budget: 1250.75 } }),
  );
  render(<App />);
  expect(await screen.findByText("$1,250.75")).toBeInTheDocument();
});

test("reports malformed detail data as unavailable instead of crashing the workspace", async () => {
  window.history.replaceState({}, "", "/projects/P1%20%2F%20north?orgId=AUS");
  request.mockImplementation(async (service) =>
    service === "users"
      ? response(profile)
      : response({
          projectInfo: { ...detail, projectDesc: { unexpected: true } },
        }),
  );
  render(<App />);
  expect(
    await screen.findByRole("heading", { name: "Project unavailable" }),
  ).toBeInTheDocument();
});
