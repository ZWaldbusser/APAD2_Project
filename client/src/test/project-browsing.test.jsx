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
    joined_users: ["u1"],
  },
  { orgId: "AUS", projectId: "P2", projectName: "Field operations", joined_users: [] },
];
const detail = {
  ...summaries[0],
  projectDesc: "Replace aging public terminals.",
  creatorId: "u1",
  budget: 0,
  joined_users: ["u1"],
  hardwareList: [],
};
const catalog = [{ id: "HW-live", name: "Laptops", version: 1, capacity: 100, available: 82 }];
const allocations = [{ hardware_id: "HW-live", project_id: "P1 / north", quantity: 26, out: 18 }];
const response = (data, status = 200) =>
  new Response(JSON.stringify(data), { status });

beforeEach(() => {
  localStorage.setItem("token", "mock-token.u1");
  window.history.replaceState({}, "", "/projects?view=agency");
  request.mockReset();
  request.mockImplementation(async (service, path) => {
    if (service === "users") return response({ user: profile });
    if (service === "hardware") return response(path === "/api/hardware" ? catalog : allocations);
    if (path === "/projects/search_project")
      return response({ projectList: summaries });
    return response({ projectInfo: detail });
  });
});

test("opens equipment directly from the project row with both identifiers and the current Hardware client", async () => {
  const user = userEvent.setup();
  render(<App />);
  await screen.findByRole('link', { name: detail.projectName });
  const equipment = screen.getByRole('link', { name: 'Manage equipment for Library network refresh' });
  expect(equipment).toHaveAttribute('href', '/projects/P1%20%2F%20north/resources?orgId=AUS');
  await user.click(equipment);
  expect(await screen.findByRole('heading', { name: 'Library network refresh equipment' })).toBeInTheDocument();
  expect(await screen.findByRole('region', { name: 'Laptops' })).toBeInTheDocument();
  expect(window.location.search).toBe('?orgId=AUS');
  expect(request).toHaveBeenCalledWith('hardware', '/api/listAllocations', { method: 'POST', body: { page: 1, size: 100, projectId: 'P1 / north' } });
});


test("project details read current Hardware allocations instead of embedded creation metadata", async () => {
  window.history.replaceState({}, '', '/projects/P1%20%2F%20north?orgId=AUS');
  request.mockImplementation(async (service, path) => {
    if (service === 'users') return response({ user: profile });
    if (service === 'hardware') return response(path === '/api/hardware' ? catalog : allocations);
    return response({ projectInfo: { ...detail, hardwareList: [{ hardwareId: 'stale-hardware', allocation: 999 }] } });
  });
  render(<App />);
  const table = await screen.findByRole('table', { name: 'Equipment allocated to Library network refresh' });
  expect(within(table).getByRole('cell', { name: 'HW-live' })).toBeInTheDocument();
  expect(within(table).getByRole('cell', { name: '26' })).toBeInTheDocument();
  expect(screen.queryByText('stale-hardware')).not.toBeInTheDocument();
  expect(request).toHaveBeenCalledWith('hardware', '/api/listAllocations', { method: 'POST', body: { page: 1, size: 100, projectId: 'P1 / north' } });
});

test("does not request projects or invent an agency when the profile has none", async () => {
  request.mockResolvedValue(response({ user: { id: "u1", userid: "demo" } }));
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
      ? response({ user: profile })
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
      ? response({ user: profile })
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
    within(screen.getByRole("main")).getByRole("link", { name: "Discover projects" }),
  ).toHaveAttribute("aria-current", "page");
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
        ? response({ user: profile })
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
      ? response({ user: { id: 7, username: "staff", agencyCode: "DAL" } })
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
    if (service === "users") return response({ user: profile });
    if (service === "hardware") return response(path === "/api/hardware" ? catalog : allocations);
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
      ? response({ user: profile })
      : response({ projectInfo: { ...detail, budget: 1250.75 } }),
  );
  render(<App />);
  expect(await screen.findByText("$1,250.75")).toBeInTheDocument();
});

test("reports malformed detail data as unavailable instead of crashing the workspace", async () => {
  window.history.replaceState({}, "", "/projects/P1%20%2F%20north?orgId=AUS");
  request.mockImplementation(async (service) =>
    service === "users"
      ? response({ user: profile })
      : response({
          projectInfo: { ...detail, projectDesc: { unexpected: true } },
        }),
  );
  render(<App />);
  expect(
    await screen.findByRole("heading", { name: "Project unavailable" }),
  ).toBeInTheDocument();
});

test('an independent Hardware outage leaves project details visible and retries only equipment', async () => {
  const user = userEvent.setup();
  window.history.replaceState({}, '', '/projects/P1%20%2F%20north?orgId=AUS');
  let offline = true;
  request.mockImplementation(async (service, path) => {
    if (service === 'users') return response({ user: profile });
    if (service === 'hardware') return offline ? response({ error: 'Offline' }, 503) : response(path === '/api/hardware' ? catalog : allocations);
    return response({ projectInfo: detail });
  });
  render(<App />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Equipment unavailable');
  expect(screen.getByText(detail.projectDesc)).toBeInTheDocument();
  expect(screen.queryByText('No equipment allocated yet.')).not.toBeInTheDocument();
  const projectReads = request.mock.calls.filter(([service]) => service === 'projects').length;
  offline = false;
  await user.click(screen.getByRole('button', { name: 'Retry equipment' }));
  expect(await screen.findByRole('cell', { name: 'HW-live' })).toBeInTheDocument();
  expect(request.mock.calls.filter(([service]) => service === 'projects')).toHaveLength(projectReads);
});

test('obsolete embedded equipment metadata cannot hide valid project and current Hardware details', async () => {
  window.history.replaceState({}, '', '/projects/P1%20%2F%20north?orgId=AUS');
  request.mockImplementation(async (service, path) => {
    if (service === 'users') return response({ user: profile });
    if (service === 'hardware') return response(path === '/api/hardware' ? catalog : allocations);
    return response({ projectInfo: { ...detail, hardwareList: [{ legacy: true }] } });
  });
  render(<App />);
  expect(await screen.findByRole('heading', { name: detail.projectName })).toBeInTheDocument();
  expect(await screen.findByRole('cell', { name: 'HW-live' })).toBeInTheDocument();
});
