import { beforeEach, expect, test, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ResourceRental from "../pages/ResourceRental";
import { hardware } from "../services";

vi.mock("../services", () => ({ hardware: {
  getProjectHardware: vi.fn(), checkin: vi.fn(), checkout: vi.fn(), responseData: vi.fn(),
} }));

const item = { hardware_id: "H1", name: "Laptops", allocated: 10, checkedOut: 3, available: 7 };
beforeEach(() => {
  vi.resetAllMocks();
  hardware.getProjectHardware.mockResolvedValue([item]);
  hardware.responseData.mockResolvedValue({});
});
function openEquipment() {
  render(<MemoryRouter initialEntries={["/projects/P1/resources?orgId=AUS"]}>
    <Routes><Route path="/projects/:projectId/resources" element={<ResourceRental />} /></Routes>
  </MemoryRouter>);
}

test.each([
  ["checkin", "Check In", "Check-in", 3, 1, 9, "in"],
  ["checkout", "Check Out", "Check-out", 7, 5, 5, "out"],
])("%s accepts only valid quantities and refreshes inventory after success", async (action, buttonName, fieldName, limit, checkedOut, available, direction) => {
  const user = userEvent.setup();
  openEquipment();
  const input = await screen.findByRole("spinbutton", { name: `${fieldName} quantity for Laptops` });
  const button = screen.getByRole("button", { name: buttonName });
  expect(button).toBeDisabled();
  await user.type(input, String(limit + 1));
  expect(button).toBeDisabled();
  await user.clear(input);
  await user.type(input, "1.5");
  expect(button).toBeDisabled();
  await user.clear(input);
  await user.type(input, "2");
  expect(button).toBeEnabled();
  hardware.getProjectHardware.mockResolvedValue([{ ...item, checkedOut, available }]);
  await user.click(button);
  expect(hardware[action]).toHaveBeenCalledExactlyOnceWith({ name: "Laptops", hardwareId: "H1", quantity: 2, projectId: "P1", orgId: "AUS" });
  expect(await screen.findByRole("status")).toHaveTextContent(`2 units of Laptops checked ${direction}.`);
  expect(input).toHaveValue(null);
  expect(button).toBeDisabled();
  expect(within(screen.getByRole("table")).getByText(`Up to ${available} available`)).toBeInTheDocument();
});

test("unavailable actions explain why they are disabled", async () => {
  hardware.getProjectHardware.mockResolvedValue([{ ...item, checkedOut: 0, available: 0 }]);
  openEquipment();
  expect(await screen.findByText("Nothing to return")).toBeInTheDocument();
  expect(screen.getByText("None available")).toBeInTheDocument();
  for (const input of screen.getAllByRole("spinbutton")) expect(input).toBeDisabled();
  expect(screen.getByRole("button", { name: "Check In" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Check Out" })).toBeDisabled();
});
