import { afterEach, expect, test, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Integration from "../pages/Integration";
import { request } from "../services/http";

vi.mock("../config", () => ({
  USE_VISUALIZATION_MOCKS: false,
  SERVICE_URLS: { visualization: "" },
}));
vi.mock("../services/http", () => ({ request: vi.fn() }));
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status });
afterEach(() => request.mockReset());

test("missing summary values stay unavailable while genuine zero remains visible", async () => {
  request.mockResolvedValue(
    json({
      metrics: [
        { key: "projects", label: "Reported projects", value: null },
        { key: "zero", label: "Reported zero", value: 0 },
      ],
      hardware: [],
      pipelines: [],
    }),
  );
  render(<Integration />);
  const cards = await screen.findByRole("region", { name: "Summary metrics" });
  expect(
    within(cards).getByRole("article", { name: "Reported projects" }),
  ).toHaveTextContent("Unavailable");
  expect(
    within(cards).getByRole("article", { name: "Reported zero" }),
  ).toHaveTextContent("0");
  expect(screen.getByText("No hardware rows returned.")).toBeInTheDocument();
  expect(screen.getByText("Agency comparison unavailable")).toBeInTheDocument();
});

test("partial malformed data is explained, unsafe stock counts have no meter and invalid dates stay unavailable", async () => {
  request.mockResolvedValue(
    json({
      metrics: [
        { key: "available", label: "Available units", value: 12 },
        null,
      ],
      hardware: [
        { name: "Invalid stock", capacity: 100, available: 120 },
        null,
      ],
      pipelines: [
        {
          name: "Unknown pipeline",
          status: "constructor",
          lastRun: "not-a-date",
        },
      ],
      generatedAt: "not-a-date",
    }),
  );
  render(<Integration />);
  expect(await screen.findByText("12")).toBeInTheDocument();
  expect(
    screen.getByText("Some summary data is unavailable"),
  ).toBeInTheDocument();
  expect(screen.getByText("Counts unavailable")).toBeInTheDocument();
  expect(screen.queryByRole("meter")).not.toBeInTheDocument();
  expect(screen.queryByText(/Invalid Date/)).not.toBeInTheDocument();
  expect(screen.getByText("Status unavailable")).toBeInTheDocument();
});

test("an initial source outage stays distinct from a successful empty response", async () => {
  request
    .mockResolvedValueOnce(json({}, 404))
    .mockResolvedValueOnce(json({ metrics: [], hardware: [], pipelines: [] }));
  const user = userEvent.setup();
  render(<Integration />);
  expect(
    await screen.findByText("Summary metrics unavailable."),
  ).toBeInTheDocument();
  expect(
    screen.queryByText("No hardware rows returned."),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Refresh summary" }));
  expect(
    await screen.findByText("No summary metrics returned."),
  ).toBeInTheDocument();
  expect(screen.getByText("No hardware rows returned.")).toBeInTheDocument();
  expect(
    screen.queryByText("Summary metrics unavailable."),
  ).not.toBeInTheDocument();
});

test("shared stock meters describe checked-out units accessibly and pending refresh does not repeat reads", async () => {
  let finish;
  request
    .mockResolvedValueOnce(
      json({
        metrics: [],
        hardware: [{ name: "Example laptops", capacity: 100, available: 80 }],
        pipelines: [],
      }),
    )
    .mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
  const user = userEvent.setup();
  render(<Integration />);
  const meter = await screen.findByRole("meter", {
    name: "Example laptops checked out",
  });
  expect(meter).toHaveAttribute("aria-valuenow", "20");
  expect(meter).toHaveAttribute("aria-valuemax", "100");
  expect(meter).toHaveAttribute(
    "aria-valuetext",
    "20 of 100 units checked out; 80 available",
  );
  expect(screen.getByText(/not your agency’s allocation/)).toBeInTheDocument();
  await user.dblClick(screen.getByRole("button", { name: "Refresh summary" }));
  expect(request).toHaveBeenCalledTimes(2);
  expect(
    screen.getByRole("button", { name: "Loading summary…" }),
  ).toBeDisabled();
  expect(screen.getByRole("status")).toHaveTextContent("previous response");
  finish(json({}, 503));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Showing an earlier response",
  );
  expect(screen.getByRole("meter")).toHaveAttribute("aria-valuenow", "20");
});

test("a failed refresh retains the earlier response and source timestamp without claiming fresh ingestion", async () => {
  request
    .mockResolvedValueOnce(
      json({
        metrics: [{ key: "hwAvailable", label: "Available units", value: 80 }],
        hardware: [],
        pipelines: [],
        generatedAt: "2026-11-20T10:00:00Z",
      }),
    )
    .mockResolvedValueOnce(json({}, 503))
    .mockResolvedValueOnce(
      json({
        metrics: [{ key: "hwAvailable", label: "Available units", value: 75 }],
        hardware: [],
        pipelines: [],
        generatedAt: "2026-11-20T10:00:00Z",
      }),
    );
  const user = userEvent.setup();
  render(<Integration />);
  expect(await screen.findByText("80")).toBeInTheDocument();
  const providerTime = document.querySelector(
    'time[datetime="2026-11-20T10:00:00Z"]',
  ).textContent;
  await user.click(screen.getByRole("button", { name: "Refresh summary" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Showing an earlier response",
  );
  expect(screen.getByText("80")).toBeInTheDocument();
  expect(
    document.querySelector('time[datetime="2026-11-20T10:00:00Z"]'),
  ).toHaveTextContent(providerTime);
  await user.click(screen.getByRole("button", { name: "Refresh summary" }));
  expect(await screen.findByText("75")).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getByText(/confirm fresh source data/)).toBeInTheDocument();
  expect(request).toHaveBeenCalledTimes(3);
});
