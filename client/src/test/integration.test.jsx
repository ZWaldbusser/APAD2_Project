import { afterEach, expect, test, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import { request } from "../services/http";

vi.mock("../services/http", () => ({
  request: vi.fn(),
  getToken: () => localStorage.getItem("token"),
}));

const json = (data, status = 200) => new Response(JSON.stringify(data), { status });

afterEach(() => {
  localStorage.clear();
  request.mockReset();
});

test("legacy Visualization opens Integration and ranks vendors even when summary data is unavailable", async () => {
  localStorage.setItem("token", "integration-test");
  window.history.replaceState({}, "", "/visualization");
  request.mockImplementation(async (service, path) => {
    if (service === "users") return json({ user: { id: "0007", agencyCode: "AUS" } });
    if (path === "/api/visualization") return json({ error: "Not found" }, 404);
    if (path === "/projects/search_project") {
      return json({ projectList: [
        { orgId: "AUS", projectId: "P1", projectName: "Library", joined_users: ["0007"] },
        { orgId: "AUS", projectId: "P2", projectName: "Other", joined_users: ["0009"] },
      ] });
    }
    if (path === "/api/hardware") return json([{ id: "H1", name: "Desktop PC", available: 0 }]);
    if (path === "/api/integration/vendor-rankings") {
      return json({
        projectName: "Library",
        projectBudget: "1000.00",
        hardwareName: "Desktop PC",
        quantity: 10,
        availability: "unavailable",
        benchmark: { status: "priced", estimate: { low: "750.00", typical: "900.00", high: "1200.00" } },
        rankedVendors: [
          {
            vendor: "Preferred vendor",
            unitPrice: "80",
            priceBasis: "category",
            commodities: ["Desktop computers"],
            priceRecordCount: 2,
            estimatedTotal: "800.00",
            differenceFromTypical: "-100.00",
            withinBudget: true,
            recommended: true,
          },
          {
            vendor: "Certified supplier",
            unitPrice: "85",
            priceBasis: "category",
            commodities: ["Desktop computers, Environmentally certified"],
            priceRecordCount: 1,
            estimatedTotal: "850.00",
            differenceFromTypical: "-50.00",
            withinBudget: true,
            recommended: false,
          },
          {
            vendor: "Over-budget certified supplier",
            unitPrice: "120",
            priceBasis: "category",
            commodities: ["Desktop computers, Environmentally certified"],
            priceRecordCount: 1,
            estimatedTotal: "1200.00",
            differenceFromTypical: "300.00",
            withinBudget: false,
            overBudgetBy: "200.00",
            recommended: false,
          },
        ],
        unpricedVendors: ["Vendor with no comparable price"],
        excludedRecordCount: 1,
        procurementTags: [{
          tag: "Environmentally certified",
          vendors: ["Certified supplier", "Over-budget certified supplier"],
        }],
      });
    }
    throw new Error(`Unexpected request for ${path}`);
  });

  render(<App />);
  expect(await screen.findByRole("heading", { name: "Integration", level: 1 })).toBeInTheDocument();
  expect(window.location.pathname).toBe("/integration");
  expect(screen.getByRole("heading", { name: "Alternate vendor rankings" })).toBeInTheDocument();
  expect(screen.queryByLabelText("Procurement tag")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Integration" })).toHaveAttribute("href", "/integration");
  expect(await screen.findByText("Summary metrics unavailable.")).toBeInTheDocument();

  const user = userEvent.setup();
  await user.selectOptions(await screen.findByLabelText("Project"), "P1");
  expect(screen.queryByRole("option", { name: "Other (P2)" })).not.toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText("Hardware"), "H1");
  const quantity = screen.getByLabelText("Quantity");
  await user.clear(quantity);
  await user.type(quantity, "10");
  await user.click(screen.getByRole("button", { name: "Compare vendors" }));

  expect(await screen.findByText("Preferred vendor")).toBeInTheDocument();
  expect(screen.getByText("Lowest in-budget estimate")).toBeInTheDocument();
  expect(screen.getByText("Category estimate · 2 price records")).toBeInTheDocument();
  expect(screen.getByText("Procurement commodity: Desktop computers")).toBeInTheDocument();
  expect(screen.getByText("1 record did not match the selected model or known commodity categories.")).toBeInTheDocument();
  expect(screen.getByText("$100.00 below the typical estimate")).toBeInTheDocument();
  expect(screen.getByText("Vendor with no comparable price")).toBeInTheDocument();

  const rankings = screen.getByRole("region", { name: "Alternate vendor rankings" });
  const preference = within(rankings).getByLabelText("Procurement tag");
  const project = within(rankings).getByLabelText("Project");
  expect(preference.closest("form")).toBe(project.closest("form"));
  expect(preference.closest("div").previousElementSibling).toBe(project.closest("label"));
  const list = within(screen.getByRole("list", { name: "Ranked vendors" }));
  expect(list.getAllByRole("listitem")[0]).toHaveTextContent("Preferred vendor");

  await user.selectOptions(preference, "Environmentally certified");
  const [first, second, third] = list.getAllByRole("listitem");
  expect(first).toHaveTextContent("Certified supplier");
  expect(first).toHaveTextContent("$850.00 estimated");
  expect(second).toHaveTextContent("Preferred vendor");
  expect(second).toHaveTextContent("$800.00 estimated");
  expect(third).toHaveTextContent("Over-budget certified supplier");
  expect(screen.getByText("Vendor with no comparable price")).toBeInTheDocument();
  expect(screen.getByRole("option", { name: "Desktop PC (out of stock)" })).toBeInTheDocument();

  await user.selectOptions(preference, "");
  expect(list.getAllByRole("listitem")[0]).toHaveTextContent("Preferred vendor");
  expect(request.mock.calls.filter(([, path]) => path === "/api/integration/vendor-rankings")).toHaveLength(1);
  expect(request).toHaveBeenCalledWith("hardware", "/api/integration/vendor-rankings", {
    method: "POST",
    body: { projectId: "P1", hardwareId: "H1", quantity: 10 },
  });
});

test("retry reloads only the service that failed to populate the ranking form", async () => {
  localStorage.setItem("token", "integration-test");
  window.history.replaceState({}, "", "/integration");
  let projectRequests = 0;
  request.mockImplementation(async (service, path) => {
    if (service === "users") return json({ user: { id: "0007", agencyCode: "AUS" } });
    if (path === "/api/visualization") return json({ metrics: [], hardware: [], pipelines: [] });
    if (path === "/api/hardware") return json([{ id: "H1", name: "Desktop PC", available: 0 }]);
    if (path === "/projects/search_project") {
      projectRequests += 1;
      return projectRequests === 1
        ? json({ error: "Projects unavailable" }, 503)
        : json({ projectList: [
            { orgId: "AUS", projectId: "P1", projectName: "Library", joined_users: ["0007"] },
          ] });
    }
    throw new Error(`Unexpected request for ${path}`);
  });

  render(<App />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Could not load your projects from the Projects service.",
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByLabelText("Project")).toBeInTheDocument();
  expect(screen.getByRole("option", { name: "Desktop PC (out of stock)" })).toBeInTheDocument();
  expect(projectRequests).toBe(2);
  expect(request.mock.calls.filter(([, path]) => path === "/api/hardware")).toHaveLength(1);
});

test("selecting in-stock hardware reports stock status after comparison", async () => {
  localStorage.setItem("token", "integration-test");
  window.history.replaceState({}, "", "/integration");
  request.mockImplementation(async (service, path) => {
    if (service === "users") return json({ user: { id: "0007", agencyCode: "AUS" } });
    if (path === "/api/visualization") return json({ metrics: [], hardware: [], pipelines: [] });
    if (path === "/projects/search_project") {
      return json({ projectList: [
        { orgId: "AUS", projectId: "P1", projectName: "Library", joined_users: ["0007"] },
      ] });
    }
    if (path === "/api/hardware") {
      return json([{ id: "M1", name: "ASUS ROG Swift OLED Monitor", available: 2 }]);
    }
    if (path === "/api/integration/vendor-rankings") {
      return json({
        projectName: "Library",
        projectBudget: "1000.00",
        hardwareName: "ASUS ROG Swift OLED Monitor",
        quantity: 1,
        availability: "available",
        benchmark: { status: "unpriced" },
        rankedVendors: [],
        unpricedVendors: [],
      });
    }
    throw new Error(`Unexpected request for ${path}`);
  });

  render(<App />);
  const user = userEvent.setup();
  await user.selectOptions(await screen.findByLabelText("Hardware"), "M1");
  expect(request.mock.calls.some(([, path]) => path === "/api/integration/vendor-rankings")).toBe(false);

  await user.selectOptions(screen.getByLabelText("Project"), "P1");
  await user.click(screen.getByRole("button", { name: "Compare vendors" }));
  expect(await screen.findByText("Hardware has stock. Alternate vendor records are available for out-of-stock items.")).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Supplier links" })).not.toBeInTheDocument();
  expect(screen.queryByText("Recommended")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Procurement tag")).not.toBeInTheDocument();
});
