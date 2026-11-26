import { beforeEach, expect, test, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import { request } from "../services/http";

vi.mock("../services/http", () => ({ request: vi.fn() }));

const profile = { id: "0007", username: "agency-staff", agencyCode: "AUS" };
const response = (data, status = 200) =>
  new Response(JSON.stringify(data), { status });
let records;

beforeEach(() => {
  records = [
    {
      orgId: "AUS",
      projectId: "P1",
      projectName: "Library refresh",
      joined_users: ["other-user", "0007"],
    },
    {
      orgId: "AUS",
      projectId: "P2",
      projectName: "Field operations",
      joined_users: ["other-user"],
    },
  ];
  localStorage.setItem("token", "isolated-access-token");
  window.history.replaceState({}, "", "/projects");
  request.mockReset();
  request.mockImplementation(async (service, path, options) => {
    if (service === "users") return response({ user: profile });
    if (service === "hardware") return response([]);
    if (path === "/projects/join_project") {
      records
        .find((p) => p.projectId === options.body.projectId)
        .joined_users.push(options.body.userId);
      return response({ success: true });
    }
    if (path === "/projects/search_project") {
      const query = options.body;
      return response({
        projectList: records.filter(
          (p) =>
            (!query.projectId || p.projectId === query.projectId) &&
            (!query.userId || p.joined_users.includes(query.userId)),
        ),
      });
    }
    const id = decodeURIComponent(path.split("/").pop().split("?")[0]);
    const p = records.find((record) => record.projectId === id);
    return p
      ? response({
          projectInfo: {
            ...p,
            projectDesc: "Public services",
            creatorId: "other-user",
            budget: 100,
          },
        })
      : response({ error: "Not found" }, 404);
  });
});

test("My projects requests the canonical membership filter and excludes other memberships", async () => {
  render(<App />);
  expect(
    await screen.findByRole("link", { name: "Library refresh" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: "Field operations" }),
  ).not.toBeInTheDocument();
  expect(request).toHaveBeenCalledWith("projects", "/projects/search_project", {
    method: "POST",
    body: { orgId: "AUS", projectId: null, userId: "0007" },
  });
});

test("discovery keeps the search and offers a contextual join without losing equipment access", async () => {
  const user = userEvent.setup();
  render(<App />);
  await screen.findByRole("link", { name: "Library refresh" });
  await user.type(screen.getByRole("searchbox"), "Field");
  await user.click(screen.getByRole("link", { name: "Discover projects" }));
  expect(
    await screen.findByRole("link", { name: "Field operations" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("searchbox")).toHaveValue("Field");
  expect(
    screen
      .getByRole("link", { name: "Join Field operations" })
      .getAttribute("href"),
  ).toContain("projectId=P2&orgId=AUS");
  expect(
    screen.getByRole("link", { name: "Manage equipment for Field operations" }),
  ).toHaveAttribute("href", "/projects/P2/resources?orgId=AUS");
});

test.each([
  ["agency", "Field", "Cancel"],
  ["agency", "Field & resources", "← Back to projects"],
  ["mine", "Library", "Cancel"],
])(
  "header Join project returns to the same %s view and search %s via %s",
  async (view, search, exit) => {
    const user = userEvent.setup();
    window.history.replaceState(
      {},
      "",
      `/projects?${new URLSearchParams({ view, q: search })}`,
    );
    render(<App />);
    expect(await screen.findByRole("searchbox")).toHaveValue(search);
    await user.click(
      screen.getByRole("link", { name: "Join project", exact: true }),
    );
    await screen.findByRole("button", { name: "Find project" });
    await user.click(screen.getByRole("link", { name: exit, exact: true }));
    expect(await screen.findByRole("searchbox")).toHaveValue(search);
    expect(new URLSearchParams(window.location.search).get("view")).toBe(view);
    expect(
      screen.getByRole("link", {
        name: view === "agency" ? "Discover projects" : "My projects",
        exact: true,
      }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      request.mock.calls.some(([, path]) => path === "/projects/join_project"),
    ).toBe(false);
  },
);

test("canceling a contextual join review sends no write and restores focus", async () => {
  const user = userEvent.setup();
  window.history.replaceState({}, "", "/joinproject?projectId=P2&orgId=AUS");
  render(<App />);
  const join = await screen.findByRole("button", {
    name: "Join project",
    exact: true,
  });
  await user.click(join);
  const dialog = await screen.findByRole("dialog", {
    name: "Join Field operations?",
  });
  await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(join).toHaveFocus();
  expect(
    request.mock.calls.some(([, path]) => path === "/projects/join_project"),
  ).toBe(false);
});

test("confirmed join uses canonical IDs then reads real membership and refreshes My projects", async () => {
  const user = userEvent.setup();
  window.history.replaceState({}, "", "/joinproject?projectId=P2&orgId=AUS");
  render(<App />);
  await user.click(
    await screen.findByRole("button", { name: "Join project", exact: true }),
  );
  const dialog = await screen.findByRole("dialog", {
    name: "Join Field operations?",
  });
  expect(
    request.mock.calls.some(([, path]) => path === "/projects/join_project"),
  ).toBe(false);
  await user.click(
    within(dialog).getByRole("button", { name: "Join project" }),
  );
  await waitFor(() => expect(window.location.pathname).toBe("/projects/P2"));
  expect(request).toHaveBeenCalledWith("projects", "/projects/join_project", {
    method: "POST",
    body: { orgId: "AUS", projectId: "P2", userId: "0007" },
  });
  expect(await screen.findByText("You’re a member")).toBeInTheDocument();
  await user.click(
    screen.getByRole("link", { name: "Back to projects", exact: true }),
  );
  expect(
    await screen.findByRole("link", { name: "Field operations" }),
  ).toBeInTheDocument();
});

test("canceling leave keeps membership, sends no write and restores the trigger", async () => {
  const user = userEvent.setup();
  window.history.replaceState({}, "", "/projects/P1?orgId=AUS");
  render(<App />);
  const leave = await screen.findByRole("button", { name: "Leave project" });
  await user.click(leave);
  const dialog = await screen.findByRole("dialog", {
    name: "Leave Library refresh?",
  });
  await user.click(
    within(dialog).getByRole("button", { name: "Stay in project" }),
  );
  expect(leave).toHaveFocus();
  expect(
    request.mock.calls.some(([, path]) => path === "/projects/leave_project"),
  ).toBe(false);
  expect(screen.getByText("You’re a member")).toBeInTheDocument();
});

test("a pending leave cannot be double-submitted or dismissed and its result refreshes My projects", async () => {
  const user = userEvent.setup();
  const provider = request.getMockImplementation();
  let finish;
  request.mockImplementation((service, path, options) =>
    path === "/projects/leave_project"
      ? new Promise((resolve) => {
          finish = resolve;
        })
      : provider(service, path, options),
  );
  window.history.replaceState({}, "", "/projects/P1?orgId=AUS");
  render(<App />);
  await user.click(
    await screen.findByRole("button", { name: "Leave project" }),
  );
  const dialog = await screen.findByRole("dialog");
  await user.dblClick(
    within(dialog).getByRole("button", { name: "Leave project" }),
  );
  expect(
    within(dialog).getByRole("button", { name: "Stay in project" }),
  ).toBeDisabled();
  await user.keyboard("{Escape}");
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(
    request.mock.calls.filter(([, path]) => path === "/projects/leave_project"),
  ).toHaveLength(1);
  records[0].joined_users = ["other-user"];
  await act(async () => finish(response({ success: true })));
  expect(
    await screen.findByRole("heading", { name: "No projects joined yet" }),
  ).toBeInTheDocument();
  expect(screen.getByText(/Leave request saved/)).toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: "Library refresh" }),
  ).not.toBeInTheDocument();
});

test("a duplicate join keeps project context and refreshes membership without another write", async () => {
  const user = userEvent.setup();
  const provider = request.getMockImplementation();
  request.mockImplementation((service, path, options) =>
    path === "/projects/join_project"
      ? Promise.resolve(response({ errorMessage: "Already joined" }, 409))
      : provider(service, path, options),
  );
  window.history.replaceState({}, "", "/joinproject?projectId=P2&orgId=AUS");
  render(<App />);
  await user.click(await screen.findByRole("button", { name: "Join project" }));
  await user.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: "Join project",
    }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Membership changed",
  );
  expect(screen.getByRole("dialog")).toHaveTextContent("P2");
  expect(screen.getByRole("alert")).toHaveFocus();
  records[1].joined_users.push("0007");
  await user.click(screen.getByRole("button", { name: "Refresh membership" }));
  expect(
    await screen.findByText("You’re already a member."),
  ).toBeInTheDocument();
  expect(
    request.mock.calls.filter(([, path]) => path === "/projects/join_project"),
  ).toHaveLength(1);
});

test.each([403, 404, 409, 503, "network", "unconfirmed"])(
  "leave failure %s retains membership and offers a read-only recovery",
  async (status) => {
    const user = userEvent.setup();
    const provider = request.getMockImplementation();
    request.mockImplementation((service, path, options) => {
      if (path !== "/projects/leave_project")
        return provider(service, path, options);
      return status === "network"
        ? Promise.reject(new Error("Offline"))
        : Promise.resolve(
            response(
              { success: false },
              status === "unconfirmed" ? 200 : status,
            ),
          );
    });
    window.history.replaceState({}, "", "/projects/P1?orgId=AUS");
    render(<App />);
    await user.click(
      await screen.findByRole("button", { name: "Leave project" }),
    );
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Leave project",
      }),
    );
    expect(await screen.findByRole("alert")).not.toBeEmptyDOMElement();
    expect(screen.getByText("You’re a member")).toBeInTheDocument();
    expect(screen.queryByText(/Leave request saved/)).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Refresh membership" }),
    );
    expect(await screen.findByText("You’re a member")).toBeInTheDocument();
    expect(
      request.mock.calls.filter(
        ([, path]) => path === "/projects/leave_project",
      ),
    ).toHaveLength(1);
  },
);

test.each(["missing", "membership", "foreign"])(
  "join refuses an unverified %s context",
  async (state) => {
    if (state === "membership") records[1].joined_users = undefined;
    window.history.replaceState(
      {},
      "",
      state === "foreign"
        ? "/joinproject?projectId=P2&orgId=DAL"
        : `/joinproject?projectId=${state === "missing" ? "unknown" : "P2"}&orgId=AUS`,
    );
    render(<App />);
    expect(
      await screen.findByRole("heading", {
        name:
          state === "foreign"
            ? "Project outside your agency"
            : state === "membership"
              ? "Membership unavailable"
              : "Project not found",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Join project" }),
    ).not.toBeInTheDocument();
    expect(
      request.mock.calls.some(([, path]) => path === "/projects/join_project"),
    ).toBe(false);
    if (state === "foreign")
      expect(
        request.mock.calls.some(([service]) => service === "projects"),
      ).toBe(false);
  },
);

test("join review traps Tab, closes with Escape and never uses an edited stale project", async () => {
  const user = userEvent.setup();
  window.history.replaceState({}, "", "/joinproject?projectId=P2&orgId=AUS");
  render(<App />);
  const join = await screen.findByRole("button", { name: "Join project" });
  await user.click(join);
  const dialog = screen.getByRole("dialog");
  const cancel = within(dialog).getByRole("button", { name: "Cancel" });
  expect(cancel).toHaveFocus();
  await user.tab({ shift: true });
  expect(
    within(dialog).getByRole("button", { name: "Join project" }),
  ).toHaveFocus();
  await user.tab();
  expect(cancel).toHaveFocus();
  await user.keyboard("{Escape}");
  expect(join).toHaveFocus();
  await user.type(
    screen.getByRole("textbox", { name: "Project ID" }),
    "-changed",
  );
  expect(
    screen.queryByRole("button", { name: "Join project" }),
  ).not.toBeInTheDocument();
});

test("an expired membership session offers a sign-in link without claiming success", async () => {
  const user = userEvent.setup();
  const provider = request.getMockImplementation();
  request.mockImplementation((service, path, options) =>
    path === "/projects/join_project"
      ? Promise.resolve(response({ error: "Unauthorized" }, 401))
      : provider(service, path, options),
  );
  window.history.replaceState({}, "", "/joinproject?projectId=P2&orgId=AUS");
  render(<App />);
  await user.click(await screen.findByRole("button", { name: "Join project" }));
  await user.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: "Join project",
    }),
  );
  expect(
    await screen.findByRole("link", { name: "Sign in again" }),
  ).toHaveAttribute("href", "/login");
  expect(screen.queryByText(/Join request saved/)).not.toBeInTheDocument();
});

test.each(["join", "leave"])(
  "a provider-declined %s keeps the refreshed membership dialog and context",
  async (action) => {
    const user = userEvent.setup();
    const provider = request.getMockImplementation();
    request.mockImplementation((service, path, options) =>
      path === `/projects/${action}_project`
        ? Promise.resolve(
            response({
              success: false,
              errorMessage: "Membership change declined",
            }),
          )
        : provider(service, path, options),
    );
    window.history.replaceState(
      {},
      "",
      action === "join"
        ? "/joinproject?projectId=P2&orgId=AUS"
        : "/projects/P1?orgId=AUS",
    );
    render(<App />);
    const label = action === "join" ? "Join project" : "Leave project";
    await user.click(
      await screen.findByRole("button", { name: label, exact: true }),
    );
    const dialog = await screen.findByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: label, exact: true }),
    );
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Membership change declined",
    );
    expect(dialog).toBeInTheDocument();
    expect(window.location.pathname).toBe(
      action === "join" ? "/joinproject" : "/projects/P1",
    );
  },
);
