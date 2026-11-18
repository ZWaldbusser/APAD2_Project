import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// Keep UI tests independent of the external Inbox SDK and real subscribers.
vi.mock("@novu/react", () => ({
  Inbox: () => null,
  NovuProvider: ({ children }) => children,
  useNovu: () => ({ on: () => () => {} }),
}));

// jsdom does not implement the native dialog lifecycle; browser QA checks it too.
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
}

afterEach(cleanup);
