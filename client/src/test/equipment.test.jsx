import { beforeEach, expect, test, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import { request } from "../services/http";

vi.mock("../services/http", () => ({ request: vi.fn() }));
const response = (data, status = 200) =>
  new Response(JSON.stringify(data), { status });
let out, own, offline;
beforeEach(() => {
  out = 18;
  own = 3;
  offline = false;
  localStorage.setItem("token", "equipment-fixture-token");
  window.history.replaceState({}, "", "/projects/P1/resources?orgId=AUS");
  request.mockReset();
  request.mockImplementation(async (service, path, options) => {
    if (service === "users")
      return response({
        user: { id: "0007", username: "staff", agencyCode: "AUS" },
      });
    if (service === "projects")
      return response({
        projectInfo: {
          orgId: "AUS",
          projectId: "P1",
          projectName: "Library refresh",
          joined_users: ["0007"],
        },
      });
    if (path === "/api/hardware/checkouts")
      return response({
        items: [
          {
            id: "C1",
            hardware_id: "H1",
            project_id: "P1",
            quantity: 5,
            returned: 5 - own,
            outstanding: own,
          },
        ],
        total: 1,
      });
    if (path === "/api/hardware/checkout") {
      out += options.body.quantity;
      own += options.body.quantity;
      return response({ message: "Checkout successful" });
    }
    if (path === "/api/hardware/checkin") {
      out -= options.body.quantity;
      own -= options.body.quantity;
      return response({ message: "Check-in successful" });
    }
    if (offline) return response({ error: "Offline" }, 503);
    if (path === "/api/hardware")
      return response({
        items: [
          {
            id: "H1",
            name: "Laptops",
            total: 100,
            reserved: 80,
            out: 50,
            available: 50,
            unallocated: 20,
            status: "active",
          },
        ],
        total: 1,
      });
    if (path === "/api/listAllocations")
      return response({
        items: [{ hardware_id: "H1", project_id: "P1", quantity: 26, out }],
        total: 1,
      });
    return response({ error: "Unsupported" }, 404);
  });
});

async function openDrawer(user, action = "Check out") {
  await user.click(
    await screen.findByRole("button", { name: `${action} Laptops` }),
  );
  return screen.getByRole("dialog");
}
async function reviewQuantity(user, dialog, quantity, action = "checkout") {
  await user.clear(within(dialog).getByLabelText("Quantity"));
  await user.type(within(dialog).getByLabelText("Quantity"), String(quantity));
  await user.click(
    within(dialog).getByRole("button", { name: `Review ${action}` }),
  );
}

test.each([0, -1, 1.5, 9])(
  "checkout quantity %s is rejected before review or writes",
  async (quantity) => {
    const user = userEvent.setup();
    render(<App />);
    const dialog = await openDrawer(user);
    await reviewQuantity(user, dialog, quantity);
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      "between 1 and 8",
    );
    expect(
      within(dialog).queryByRole("button", { name: "Confirm checkout" }),
    ).not.toBeInTheDocument();
    expect(writes()).toHaveLength(0);
  },
);

test("checkout 2 and return 1 refresh provider-backed project and own counts", async () => {
  const user = userEvent.setup();
  render(<App />);
  let dialog = await openDrawer(user);
  await reviewQuantity(user, dialog, 2);
  await user.click(
    within(dialog).getByRole("button", { name: "Confirm checkout" }),
  );
  expect(await screen.findByText(/Checkout saved/)).toBeInTheDocument();
  await waitFor(() =>
    expect(screen.getByRole("region", { name: "Laptops" })).toHaveTextContent(
      "20",
    ),
  );
  const card = screen.getByRole("region", { name: "Laptops" });
  expect(within(card).getByText("6")).toBeInTheDocument();
  expect(writes()[0][2].body).toEqual({
    name: "Laptops",
    hardwareId: "H1",
    quantity: 2,
    projectId: "P1",
    orgId: "AUS",
  });
  dialog = await openDrawer(user, "Return");
  await reviewQuantity(user, dialog, 1, "return");
  expect(
    within(dialog).getByText("19 checked out · 7 ready in project"),
  ).toBeInTheDocument();
  await user.click(
    within(dialog).getByRole("button", { name: "Confirm return" }),
  );
  expect(await screen.findByText(/Return saved/)).toBeInTheDocument();
  expect(await screen.findByText(/4 units outstanding/)).toBeInTheDocument();
});

test("return is limited to the current user's 3 units, not all 18 project units", async () => {
  const user = userEvent.setup();
  render(<App />);
  const dialog = await openDrawer(user, "Return");
  await reviewQuantity(user, dialog, 4, "return");
  expect(within(dialog).getByRole("alert")).toHaveTextContent(
    "between 1 and 3",
  );
  expect(writes()).toHaveLength(0);
});

test("pending confirmation cannot be double-submitted or dismissed", async () => {
  const user = userEvent.setup(),
    provider = request.getMockImplementation();
  let finish;
  request.mockImplementation((service, path, options) =>
    path === "/api/hardware/checkout"
      ? new Promise((resolve) => {
          finish = resolve;
        })
      : provider(service, path, options),
  );
  render(<App />);
  const dialog = await openDrawer(user);
  await reviewQuantity(user, dialog, 2);
  await user.dblClick(
    within(dialog).getByRole("button", { name: "Confirm checkout" }),
  );
  expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeDisabled();
  await user.keyboard("{Escape}");
  expect(dialog).toBeInTheDocument();
  expect(writes()).toHaveLength(1);
  out = 20;
  own = 5;
  await act(async () => finish(response({ message: "Checkout successful" })));
  expect(await screen.findByText(/5 units outstanding/)).toBeInTheDocument();
});

test.each([409, 403, 503, "network"])(
  "failed write %s keeps review context and refreshes before retry",
  async (status) => {
    const user = userEvent.setup(),
      provider = request.getMockImplementation();
    request.mockImplementation((service, path, options) =>
      path === "/api/hardware/checkout"
        ? status === "network"
          ? Promise.reject(new Error("Offline"))
          : Promise.resolve(response({ error: "Failed" }, status))
        : provider(service, path, options),
    );
    render(<App />);
    const dialog = await openDrawer(user);
    await reviewQuantity(user, dialog, 2);
    await user.click(
      within(dialog).getByRole("button", { name: "Confirm checkout" }),
    );
    expect(await within(dialog).findByRole("alert")).toHaveFocus();
    expect(dialog).toHaveTextContent("AUS · Project P1");
    expect(screen.queryByText(/Checkout saved/)).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: "Confirm checkout" }),
    ).not.toBeInTheDocument();
    await user.click(
      within(dialog).getByRole("button", { name: "Refresh quantities" }),
    );
    expect(
      await screen.findByRole("button", { name: "Check out Laptops" }),
    ).toBeEnabled();
    expect(writes()).toHaveLength(1);
  },
);

test("a vendor lookup outage leaves equipment counts and returns usable", async () => {
  const user = userEvent.setup(),
    provider = request.getMockImplementation();
  request.mockImplementation(async (service, path, options) => {
    if (path === "/api/hardware")
      return response({
        items: [
          {
            id: "H1",
            name: "Laptops",
            total: 18,
            reserved: 18,
            out: 18,
            available: 0,
            unallocated: 0,
          },
        ],
        total: 1,
      });
    if (path.endsWith("/availability"))
      return response({
        availability: "unavailable",
        alternatives: [],
        alternative_lookup_status: "temporarily_unavailable",
      });
    return provider(service, path, options);
  });
  render(<App />);
  expect(
    await screen.findByText(/Vendor alternatives are temporarily unavailable/),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Return Laptops" })).toBeEnabled();
  await user.click(screen.getByRole("button", { name: "Retry alternatives" }));
  expect(writes()).toHaveLength(0);
});

test("Back preserves quantity, keyboard stays in the drawer and Escape restores focus without writing", async () => {
  const user = userEvent.setup();
  render(<App />);
  const trigger = await screen.findByRole("button", {
    name: "Check out Laptops",
  });
  await user.click(trigger);
  const dialog = screen.getByRole("dialog");
  await reviewQuantity(user, dialog, 2);
  await user.click(
    within(dialog).getByRole("button", { name: "Back", exact: true }),
  );
  const input = within(dialog).getByLabelText("Quantity");
  expect(input).toHaveValue(2);
  expect(input).toHaveFocus();
  within(dialog)
    .getByRole("button", { name: "Close equipment drawer" })
    .focus();
  await user.tab({ shift: true });
  expect(
    within(dialog).getByRole("button", { name: "Review checkout" }),
  ).toHaveFocus();
  await user.tab();
  expect(
    within(dialog).getByRole("button", { name: "Close equipment drawer" }),
  ).toHaveFocus();
  await user.keyboard("{Escape}");
  expect(trigger).toHaveFocus();
  expect(writes()).toHaveLength(0);
});

test.each(["empty", "offline", "invalid"])(
  "%s allocation response has an honest state without write controls",
  async (state) => {
    const provider = request.getMockImplementation();
    request.mockImplementation((service, path, options) =>
      path === "/api/listAllocations"
        ? Promise.resolve(
            state === "offline"
              ? response({ error: "Offline" }, 503)
              : response({
                  items:
                    state === "empty"
                      ? []
                      : [
                          {
                            hardware_id: "H1",
                            project_id: "P1",
                            quantity: 2,
                            out: 3,
                          },
                        ],
                  total: state === "empty" ? 0 : 1,
                }),
          )
        : provider(service, path, options),
    );
    render(<App />);
    expect(
      await screen.findByRole("heading", {
        name:
          state === "empty"
            ? "No equipment allocated"
            : "Equipment unavailable",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Check out Laptops" }),
    ).not.toBeInTheDocument();
    expect(writes()).toHaveLength(0);
  },
);

test("unavailable own checkout records pause returns without hiding other equipment actions", async () => {
  const provider = request.getMockImplementation();
  request.mockImplementation((service, path, options) =>
    path === "/api/hardware/checkouts"
      ? Promise.resolve(response({ error: "Unavailable" }, 503))
      : provider(service, path, options),
  );
  render(<App />);
  expect(
    await screen.findByText(/Your outstanding quantities are unavailable/),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Return Laptops" })).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Check out Laptops" }),
  ).toBeEnabled();
});

test("a foreign agency deep link never reads equipment or offers writes", async () => {
  window.history.replaceState({}, "", "/projects/P1/resources?orgId=DAL");
  render(<App />);
  expect(
    await screen.findByRole("heading", { name: "Project outside your agency" }),
  ).toBeInTheDocument();
  expect(request.mock.calls.every(([service]) => service === "users")).toBe(
    true,
  );
});

test("outstanding checkouts include every provider page before setting the return limit", async () => {
  const user = userEvent.setup(),
    provider = request.getMockImplementation();
  request.mockImplementation((service, path, options) =>
    path === "/api/hardware/checkouts"
      ? Promise.resolve(
          response({
            items: [
              {
                id: `C${options.body.page}`,
                hardware_id: "H1",
                project_id: "P1",
                quantity: 5,
                returned: options.body.page === 1 ? 2 : 3,
                outstanding: options.body.page === 1 ? 3 : 2,
              },
            ],
            total: 2,
          }),
        )
      : provider(service, path, options),
  );
  render(<App />);
  const dialog = await openDrawer(user, "Return");
  expect(
    within(dialog).getByText(
      "You can return up to 5 of your outstanding units.",
    ),
  ).toBeInTheDocument();
  expect(request).toHaveBeenCalledWith("hardware", "/api/hardware/checkouts", {
    method: "POST",
    body: { page: 2, size: 100, projectId: "P1", orgId: "AUS" },
  });
});

test("a partially completed return failure rereads counts without claiming success or sending another return", async () => {
  const user = userEvent.setup(),
    provider = request.getMockImplementation();
  request.mockImplementation((service, path, options) => {
    if (path === "/api/hardware/checkin") {
      out = 17;
      own = 2;
      return Promise.resolve(response({ error: "Later return failed" }, 503));
    }
    return provider(service, path, options);
  });
  render(<App />);
  const dialog = await openDrawer(user, "Return");
  await reviewQuantity(user, dialog, 2, "return");
  await user.click(
    within(dialog).getByRole("button", { name: "Confirm return" }),
  );
  expect(await within(dialog).findByRole("alert")).toHaveTextContent(
    "Some returns may have completed",
  );
  await user.click(
    within(dialog).getByRole("button", { name: "Refresh quantities" }),
  );
  expect(await screen.findByText(/2 units outstanding/)).toBeInTheDocument();
  expect(screen.queryByText(/Return saved/)).not.toBeInTheDocument();
  expect(writes()).toHaveLength(1);
});

test.each([
  { alternatives: [] },
  {
    alternatives: [
      {
        vendor: "Civic supplier",
        commodity: "Laptops",
        quantity: 12,
        unit_price: 75.5,
      },
    ],
  },
])(
  "vendor results preserve service data and distinguish procurement from stock (%s)",
  async ({ alternatives }) => {
    const provider = request.getMockImplementation();
    request.mockImplementation((service, path, options) => {
      if (path === "/api/hardware")
        return Promise.resolve(
          response({
            items: [
              {
                id: "H1",
                name: "Laptops",
                total: 100,
                reserved: 100,
                out: 100,
                available: 0,
                unallocated: 0,
              },
            ],
            total: 1,
          }),
        );
      if (path.endsWith("/availability"))
        return Promise.resolve(
          response({ availability: "unavailable", alternatives }),
        );
      return provider(service, path, options);
    });
    render(<App />);
    expect(
      await screen.findByText(
        alternatives.length
          ? /Civic supplier/
          : /No vendor alternatives are available/,
      ),
    ).toBeInTheDocument();
    if (alternatives.length)
      expect(screen.getByText("Procurement quantity: 12")).toBeInTheDocument();
    expect(writes()).toHaveLength(0);
  },
);
const writes = () =>
  request.mock.calls.filter(([, path]) =>
    ["/api/hardware/checkout", "/api/hardware/checkin"].includes(path),
  );

test("equipment separates pool stock, project counts and the signed-in user's outstanding units", async () => {
  render(<App />);
  expect(
    await screen.findByRole("heading", { name: "Library refresh equipment" }),
  ).toBeInTheDocument();
  const card = await screen.findByRole("region", { name: "Laptops" });
  expect(within(card).getByText("26")).toBeInTheDocument();
  expect(within(card).getByText("18")).toBeInTheDocument();
  expect(within(card).getByText("8")).toBeInTheDocument();
  expect(within(card).getByText(/100 total/)).toBeInTheDocument();
  expect(await screen.findByText(/3 units outstanding/)).toBeInTheDocument();
});

test("checkout opens a quantity drawer; review and cancellation never write", async () => {
  const user = userEvent.setup();
  render(<App />);
  const trigger = await screen.findByRole("button", {
    name: "Check out Laptops",
  });
  await user.click(trigger);
  const dialog = await screen.findByRole("dialog", {
    name: "Check out Laptops",
  });
  await user.clear(within(dialog).getByLabelText("Quantity"));
  await user.type(within(dialog).getByLabelText("Quantity"), "2");
  await user.click(
    within(dialog).getByRole("button", { name: "Review checkout" }),
  );
  expect(
    within(dialog).getByText("20 checked out · 6 ready in project"),
  ).toBeInTheDocument();
  expect(writes()).toHaveLength(0);
  await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(trigger).toHaveFocus();
  expect(writes()).toHaveLength(0);
});
