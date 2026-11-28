import { afterEach, expect, test, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Integration from "../pages/Integration";
import LiveHardwareInventory from "../components/LiveHardwareInventory";
import { WorkspaceContext } from "../context/WorkspaceContext";
import { request } from "../services/http";

vi.mock("../services/http", () => ({ request: vi.fn() }));
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const hardware = {
  id: "H1", name: "Field laptops", category: "Computers", status: "active",
  total: 100, reserved: 70, out: 20, available: 80, unallocated: 30,
};
afterEach(() => request.mockReset());

test("verified workspace reads live shared counts without presenting them as agency allocations", async () => {
  request.mockImplementation(async (service, path) => {
    if (service === "hardware" && path === "/api/hardware") return json([hardware]);
    if (service === "projects") return json({ projectList: [] });
    return json({}, 404);
  });
  render(
    <WorkspaceContext.Provider value={{ status: "ready", value: { id: "0007", agencyCode: "AUS" } }}>
      <Integration />
    </WorkspaceContext.Provider>,
  );
  const inventory = await screen.findByRole("region", { name: "Live shared hardware inventory" });
  const pool = await within(inventory).findByRole("article", { name: "Field laptops" });
  expect(pool).toHaveTextContent("Available80");
  expect(pool).toHaveTextContent("Reserved70");
  expect(pool).toHaveTextContent("Checked out20");
  expect(pool).toHaveTextContent("Unallocated30");
  expect(inventory).toHaveTextContent("Shared stock across agencies");
  expect(inventory).toHaveTextContent("Source timestamp: Not provided");
  expect(screen.getByText("Agency comparison unavailable")).toBeInTheDocument();
});

test("manual inventory refresh stays pending and a failure retains earlier counts and receipt time", async () => {
  const user = userEvent.setup();
  let finish;
  request.mockResolvedValueOnce(json([hardware])).mockImplementationOnce(
    () => new Promise((resolve) => { finish = resolve; }),
  );
  render(<LiveHardwareInventory />);
  await screen.findByRole("article", { name: "Field laptops" });
  await user.dblClick(screen.getByRole("button", { name: "Refresh inventory" }));
  expect(screen.getByRole("button", { name: "Refreshing inventory…" })).toBeDisabled();
  expect(screen.getByText(/Showing the previous inventory response/)).toBeInTheDocument();
  const receipt = document.querySelector("time").getAttribute("datetime");
  await act(async () => finish(json({}, 503)));
  expect(await screen.findByRole("alert")).toHaveTextContent("Inventory refresh failed");
  expect(screen.getByRole("article", { name: "Field laptops" })).toHaveTextContent("Available80");
  expect(document.querySelector("time")).toHaveAttribute("datetime", receipt);
  expect(request).toHaveBeenCalledTimes(2);
});

test("invalid counts and duplicate IDs are held back while valid zero stock remains visible", async () => {
  request.mockResolvedValue(json([
    hardware,
    { ...hardware, id: "zero", name: "Empty pool", total: 0, reserved: 0, out: 0, available: 0, unallocated: 0 },
    { ...hardware, id: "bad", name: "Invalid counts", out: 120 },
    { ...hardware, id: "duplicate", name: "Ambiguous pool" },
    { ...hardware, id: "duplicate", name: "Ambiguous pool" },
    { ...hardware, id: "missing", name: "Missing category", category: undefined },
  ]));
  render(<LiveHardwareInventory />);
  await screen.findByRole("article", { name: "Field laptops" });
  expect(screen.queryByRole("article", { name: "Invalid counts" })).not.toBeInTheDocument();
  expect(screen.queryByRole("article", { name: "Ambiguous pool" })).not.toBeInTheDocument();
  expect(screen.queryByRole("article", { name: "Missing category" })).not.toBeInTheDocument();
  expect(screen.getByRole("article", { name: "Empty pool" })).toHaveTextContent("Available0");
  expect(screen.getByText(/4 records could not be displayed/)).toBeInTheDocument();
});

test("an incomplete paginated response is unavailable rather than a smaller inventory", async () => {
  request.mockResolvedValueOnce(json({ items: [hardware], total: 2, page: 1, size: 1 }))
    .mockResolvedValueOnce(json({ items: [], total: 2, page: 2, size: 1 }));
  render(<LiveHardwareInventory />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Shared inventory unavailable");
  expect(screen.queryByRole("article")).not.toBeInTheDocument();
  expect(screen.queryByText("No hardware pools returned.")).not.toBeInTheDocument();
});

test("all inventory pages are loaded before displaying shared hardware pools", async () => {
  request.mockResolvedValueOnce(json({ items: [hardware], total: 2, page: 1, size: 1 }))
    .mockResolvedValueOnce(json({ items: [{ ...hardware, id: "H2", name: "Field tablets", status: "damaged" }], total: 2, page: 2, size: 1 }));
  render(<LiveHardwareInventory />);
  expect(await screen.findByRole("article", { name: "Field tablets" })).toHaveTextContent("Damaged");
  expect(screen.getByRole("article", { name: "Field laptops" })).toBeInTheDocument();
  expect(request).toHaveBeenCalledWith("hardware", "/api/hardware", {
    method: "POST", body: { page: 2, size: 100 },
  });
});

test("initial outage and successful empty inventory have different recovery states", async () => {
  const user = userEvent.setup();
  request.mockResolvedValueOnce(json({}, 503)).mockResolvedValueOnce(json([]));
  render(<LiveHardwareInventory />);
  expect(await screen.findByRole("alert")).toHaveTextContent("No counts are available");
  expect(screen.queryByText("No hardware pools returned.")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Refresh inventory" }));
  expect(await screen.findByText("No hardware pools returned.")).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("failed later pages cannot replace the last complete inventory response", async () => {
  const user = userEvent.setup();
  request.mockResolvedValueOnce(json([hardware]))
    .mockResolvedValueOnce(json({ items: [{ ...hardware, id: "new", name: "Incomplete replacement" }], total: 2, page: 1, size: 1 }))
    .mockResolvedValueOnce(json({}, 503));
  render(<LiveHardwareInventory />);
  await screen.findByRole("article", { name: "Field laptops" });
  await user.click(screen.getByRole("button", { name: "Refresh inventory" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Showing an earlier response");
  expect(screen.getByRole("article", { name: "Field laptops" })).toBeInTheDocument();
  expect(screen.queryByRole("article", { name: "Incomplete replacement" })).not.toBeInTheDocument();
});

test("unusable rows are unavailable rather than an empty inventory or zero stock", async () => {
  request.mockResolvedValue(json([
    null, { ...hardware, total: Number.MAX_SAFE_INTEGER + 1 },
    { ...hardware, id: "status", status: "constructor" },
  ]));
  render(<LiveHardwareInventory />);
  expect(await screen.findByText(/No usable hardware pools returned/)).toBeInTheDocument();
  expect(screen.queryByRole("article")).not.toBeInTheDocument();
  expect(screen.queryByText("No hardware pools returned.")).not.toBeInTheDocument();
});

test("inventory waits for the workspace to establish the signed-in agency", async () => {
  request.mockResolvedValue(json({}, 404));
  render(
    <WorkspaceContext.Provider value={{ status: "loading" }}>
      <Integration />
    </WorkspaceContext.Provider>,
  );
  expect(await screen.findByText("Verifying your account…")).toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "Live shared hardware inventory" })).not.toBeInTheDocument();
  expect(request.mock.calls.some(([service]) => service === "hardware")).toBe(false);
});

test.each([
  { page: 1, total: 2 },
  { page: 2, total: 3 },
])("inconsistent page metadata %j stops the inventory read", async (metadata) => {
  request.mockResolvedValueOnce(json({ items: [hardware], total: 2, page: 1, size: 1 }))
    .mockResolvedValueOnce(json({ items: [{ ...hardware, id: "H2" }], size: 1, ...metadata }));
  render(<LiveHardwareInventory />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Shared inventory unavailable");
  expect(request).toHaveBeenCalledTimes(2);
});
