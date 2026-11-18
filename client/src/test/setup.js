import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// Keep UI tests independent of the external Inbox SDK and real subscribers.
vi.mock("@novu/react", () => ({ Inbox: () => null }));

afterEach(cleanup);
