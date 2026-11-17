import { beforeEach, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import { request } from "../services/http";

vi.mock("../services/http", () => ({ request: vi.fn() }));

const profile = { id: 7, username: "staff", agencyCode: "DAL" };
const catalog = [
  { id: "HW001", name: "Workstations", unallocated: 8, version: 3 },
  { id: "HW002", name: "Network kits", unallocated: 5, version: 4 },
];
const response = (data, status = 200) =>
  new Response(JSON.stringify(data), { status });
const createCalls = () =>
  request.mock.calls.filter(
    ([service, path]) =>
      service === "projects" && path === "/projects/create_project",
  );

beforeEach(() => {
  localStorage.setItem("token", "fixture-access");
  sessionStorage.clear();
  window.history.replaceState({}, "", "/createproject");
  request.mockReset();
  request.mockImplementation(async (service, path) => {
    if (service === "users") return response({ user: profile });
    if (service === "hardware") return response(catalog);
    if (path === "/projects/create_project") return response({ success: true });
    return response({ errorMessage: "Not found" }, 404);
  });
});

async function fillDetails(user) {
  await screen.findByLabelText("Project ID");
  await user.type(screen.getByLabelText("Project ID"), "CIVIC-26");
  await user.type(screen.getByLabelText("Project name"), "Library refresh");
  await user.type(
    screen.getByLabelText("Description"),
    "Replace public workstations.",
  );
  await user.type(screen.getByLabelText("Budget (USD)"), "5000");
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: /^Create project$/i }),
    ).toBeEnabled(),
  );
}

test("creation without hardware uses the account agency and canonical ID and confirms the created project", async () => {
  const user = userEvent.setup();
  render(<App />);
  await fillDetails(user);
  await user.click(screen.getByRole("button", { name: /^Create project$/i }));
  expect(
    await screen.findByRole("heading", { name: "Project created" }),
  ).toBeInTheDocument();
  expect(createCalls()).toEqual([
    [
      "projects",
      "/projects/create_project",
      {
        method: "POST",
        body: {
          orgId: "DAL",
          projectId: "CIVIC-26",
          projectName: "Library refresh",
          projectDesc: "Replace public workstations.",
          creatorId: "7",
          budget: 5000,
          hardwareList: [],
        },
      },
    ],
  ]);
  expect(screen.getByRole("link", { name: "View project" })).toHaveAttribute(
    "href",
    "/projects/CIVIC-26?orgId=DAL",
  );
  expect(
    request.mock.calls.some(
      ([service, , options]) =>
        service === "hardware" &&
        options?.method === "POST" &&
        options?.body?.quantity !== undefined,
    ),
  ).toBe(false);
});

test("an empty submission identifies required fields, focuses the error summary, and sends no create request", async () => {
  const user = userEvent.setup();
  render(<App />);
  const submit = await screen.findByRole("button", {
    name: /^Create project$/i,
  });
  await user.click(submit);
  expect(
    await screen.findByRole("alert", { name: "Check project details" }),
  ).toHaveFocus();
  expect(screen.getByLabelText("Project ID")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  expect(screen.getByLabelText("Project name")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  expect(screen.getByLabelText("Description")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  expect(screen.getByLabelText("Budget (USD)")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  expect(
    screen.getByRole("alert", { name: "Check project details" }),
  ).toHaveFocus();
  expect(createCalls()).toHaveLength(0);
});

test("a partial allocation failure locks the saved details and retries only failed hardware without recreating the project", async () => {
  const user = userEvent.setup();
  let networkAttempts = 0;
  request.mockImplementation(async (service, path) => {
    if (service === "users") return response({ user: profile });
    if (path === "/api/hardware") return response(catalog);
    if (path.includes("/allocations/")) {
      if (path.includes("HW002") && networkAttempts++ === 0)
        return response({ error: "Temporarily unavailable" }, 503);
      return response({ success: true });
    }
    if (path === "/projects/create_project") return response({ success: true });
    return response({}, 404);
  });
  render(<App />);
  await fillDetails(user);
  await user.clear(screen.getByLabelText("Allocate Workstations"));
  await user.type(screen.getByLabelText("Allocate Workstations"), "3");
  await user.clear(screen.getByLabelText("Allocate Network kits"));
  await user.type(screen.getByLabelText("Allocate Network kits"), "2");
  await user.click(
    screen.getByRole("button", { name: "Create project", exact: true }),
  );
  const retry = await screen.findByRole("button", {
    name: "Retry remaining allocations",
  });
  expect(
    screen.queryByText(/Creation will validate it/),
  ).not.toBeInTheDocument();
  expect(screen.getByLabelText("Project name")).toBeDisabled();
  expect(screen.getByLabelText("Allocate Network kits")).toBeDisabled();
  expect(screen.getByText("Allocation saved")).toBeInTheDocument();
  expect(createCalls()).toHaveLength(1);
  expect(createCalls()[0][2].body.hardwareList).toEqual([
    { hardwareId: "HW001", allocation: 3 },
    { hardwareId: "HW002", allocation: 2 },
  ]);
  await user.click(retry);
  expect(
    await screen.findByRole("heading", { name: "Project created" }),
  ).toBeInTheDocument();
  expect(createCalls()).toHaveLength(1);
  const writes = request.mock.calls.filter(
    ([service, path]) =>
      service === "hardware" && path.includes("/allocations/"),
  );
  expect(writes.map(([, path]) => path)).toEqual([
    "/api/hardware/HW001/allocations/CIVIC-26",
    "/api/hardware/HW002/allocations/CIVIC-26",
    "/api/hardware/HW002/allocations/CIVIC-26",
  ]);
  expect(writes[2][2].body).toMatchObject({
    orgId: "DAL",
    quantity: 2,
    expected_version: 4,
  });
});

test.each([409, 422, 503])(
  "creation failure %s preserves details, identifies the problem and performs no allocation writes",
  async (status) => {
    const user = userEvent.setup();
    request.mockImplementation(async (service, path) => {
      if (service === "users") return response({ user: profile });
      if (service === "hardware") return response(catalog);
      if (path === "/projects/create_project")
        return response(
          { errorMessage: "Service rejected the request" },
          status,
        );
      return response({}, 404);
    });
    render(<App />);
    await fillDetails(user);
    await user.click(
      screen.getByRole("button", { name: "Create project", exact: true }),
    );
    expect(
      await screen.findByRole("alert", { name: "Check project details" }),
    ).toHaveFocus();
    if (status === 409)
      expect(
        screen.getByRole("alert", { name: "Check project details" }),
      ).toHaveTextContent("Service rejected the request");
    expect(screen.getByLabelText("Project ID")).toHaveValue("CIVIC-26");
    expect(screen.getByLabelText("Description")).toHaveValue(
      "Replace public workstations.",
    );
    expect(screen.getByLabelText("Agency")).toHaveValue("DAL");
    expect(screen.getByLabelText("Project name")).toBeEnabled();
    expect(
      request.mock.calls.some(
        ([service, path]) =>
          service === "hardware" && path.includes("/allocations/"),
      ),
    ).toBe(false);
  },
);

test("pending creation prevents duplicate submissions", async () => {
  const user = userEvent.setup();
  let finish;
  request.mockImplementation(async (service, path) => {
    if (service === "users") return response({ user: profile });
    if (service === "hardware") return response(catalog);
    if (path === "/projects/create_project")
      return new Promise((resolve) => {
        finish = resolve;
      });
    return response({}, 404);
  });
  render(<App />);
  await fillDetails(user);
  await user.dblClick(
    screen.getByRole("button", { name: "Create project", exact: true }),
  );
  expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
  expect(createCalls()).toHaveLength(1);
  finish(response({ success: true }));
  await screen.findByRole("heading", { name: "Project created" });
});

test.each([
  ["Description", "   ", "Description"],
  ["Budget (USD)", "-1", "Budget (USD)"],
  ["Allocate Workstations", "9", "Allocate Workstations"],
])(
  "invalid %s is explained inline and never creates a project",
  async (label, value, invalidLabel) => {
    const user = userEvent.setup();
    render(<App />);
    await fillDetails(user);
    await user.clear(screen.getByLabelText(label));
    await user.type(screen.getByLabelText(label), value);
    await user.click(
      screen.getByRole("button", { name: "Create project", exact: true }),
    );
    expect(
      await screen.findByRole("alert", { name: "Check project details" }),
    ).toHaveFocus();
    expect(screen.getByLabelText(invalidLabel)).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(createCalls()).toHaveLength(0);
  },
);

test("an unknown profile agency cannot open a creation form or write a project", async () => {
  request.mockResolvedValue(response({ user: { id: 7, username: "staff" } }));
  render(<App />);
  expect(
    await screen.findByRole("heading", { name: "Agency unavailable" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("form", { name: "Create project" }),
  ).not.toBeInTheDocument();
  expect(request.mock.calls.every(([service]) => service === "users")).toBe(
    true,
  );
});

test("an unavailable inventory remains optional and can be retried without losing project values", async () => {
  const user = userEvent.setup();
  let offline = true;
  request.mockImplementation(async (service, path) => {
    if (service === "users") return response({ user: profile });
    if (service === "hardware")
      return offline ? response({ error: "Offline" }, 503) : response(catalog);
    if (path === "/projects/create_project") return response({ success: true });
    return response({}, 404);
  });
  render(<App />);
  await fillDetails(user);
  offline = false;
  await user.click(screen.getByRole("button", { name: "Retry hardware" }));
  expect(await screen.findByLabelText("Allocate Workstations")).toHaveValue(0);
  expect(screen.getByLabelText("Project name")).toHaveValue("Library refresh");
  await user.click(
    screen.getByRole("button", { name: "Create project", exact: true }),
  );
  await screen.findByRole("heading", { name: "Project created" });
  expect(createCalls()).toHaveLength(1);
});
