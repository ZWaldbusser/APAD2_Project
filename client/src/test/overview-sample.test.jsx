import { afterEach, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import Integration from "../pages/Integration";

vi.mock("../config", () => ({
  USE_VISUALIZATION_MOCKS: true,
  SERVICE_URLS: { visualization: "" },
}));
afterEach(() => vi.unstubAllGlobals());

test("the retained Overview sample is explicitly labelled and invents no provider refresh timestamp", async () => {
  const transport = vi.fn();
  vi.stubGlobal("fetch", transport);
  render(<Integration />);
  expect(await screen.findByText("Example project count")).toBeInTheDocument();
  expect(screen.getByRole("note")).toHaveTextContent("Sample summary metrics");
  expect(screen.getByRole("note")).toHaveTextContent(
    "not live agency or inventory figures",
  );
  expect(screen.queryByText(/^Updated/)).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Reload sample" }),
  ).toBeInTheDocument();
  expect(transport).not.toHaveBeenCalled();
});
