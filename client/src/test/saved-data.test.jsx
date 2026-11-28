import { afterEach, expect, test, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import SavedDataBanner from "../components/SavedDataBanner";
import { clearFreshness, getFreshness, recordFreshness } from "../services/freshness";
import { request } from "../services/http";

afterEach(() => {
  act(() => clearFreshness());
  vi.unstubAllGlobals();
  localStorage.clear();
});

test("saved-data banner retains warnings for other pages of the same service", () => {
  render(<SavedDataBanner />);
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  const cached = { source: "cache", stale: true, savedAt: "2026-11-28T12:00:00Z" };
  act(() => {
    recordFreshness("page1", "hardware", cached);
    recordFreshness("page2", "hardware", cached);
  });
  expect(screen.getByRole("status")).toHaveTextContent("Showing saved data");
  expect(screen.getByRole("status")).toHaveTextContent("Hardware");
  act(() => recordFreshness("page1", "hardware", { source: "live", stale: false }));
  expect(screen.getByRole("status")).toBeInTheDocument();
  act(() => recordFreshness("page2", "hardware", { source: "live", stale: false }));
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

test("transport records metadata without consuming the caller's response", async () => {
  localStorage.setItem("token", "test");
  const payload = { items: [], meta: { source: "cache", stale: true } };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(payload))));
  const response = await request("hardware", "/api/hardware");
  expect(await response.json()).toEqual(payload);
  expect(Object.values(getFreshness())).toEqual([{ service: "hardware", savedAt: undefined }]);
  clearFreshness();
  expect(getFreshness()).toEqual({});
});

test("failed responses cannot clear a stale warning", async () => {
  recordFreshness("old", "projects", { source: "cache", stale: true });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Down" }), { status: 503 })));
  await request("projects", "/projects/P1");
  expect(Object.keys(getFreshness())).toEqual(["old"]);
});
