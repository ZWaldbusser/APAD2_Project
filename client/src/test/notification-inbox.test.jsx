import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import NotificationInbox from "../components/NotificationInbox";

const sdk = vi.hoisted(() => ({
  failed: false,
  lastProps: null,
  listeners: new Map(),
}));
const client = vi.hoisted(() => ({
  on: (event, listener) => {
    sdk.listeners.set(event, listener);
    return () => sdk.listeners.delete(event);
  },
}));
vi.mock("@novu/react", () => ({
  NovuProvider: (props) => {
    sdk.lastProps = props;
    return props.children;
  },
  useNovu: () => client,
  Inbox: (props) => {
    if (props.subscriber) sdk.lastProps = props;
    if (sdk.failed) throw new Error("SDK could not render");
    return props.renderBell({ total: 3 });
  },
}));
beforeEach(() => {
  sdk.failed = false;
  sdk.lastProps = null;
  sdk.listeners.clear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

test.each([
  "session.initialize.resolved",
  "notifications.list.resolved",
  "notifications.count.resolved",
])(
  "SDK %s failure is explained instead of looking like an empty Inbox",
  async (event) => {
    const user = userEvent.setup();
    render(<NotificationInbox userId="0007" />);
    act(() => sdk.listeners.get(event)?.({ error: new Error("Unavailable") }));
    expect(screen.getByRole("status")).toHaveTextContent(
      "Notifications unavailable",
    );
    await user.click(
      screen.getByRole("button", { name: "Retry notifications" }),
    );
    expect(
      screen.getByRole("button", { name: "Notifications, 3 unread" }),
    ).toBeInTheDocument();
  },
);
afterEach(() => vi.restoreAllMocks());

test("Inbox preserves the exact subscriber ID and shows the SDK unread total", () => {
  render(<NotificationInbox userId="0007" />);
  expect(sdk.lastProps.subscriber).toEqual({ subscriberId: "0007" });
  expect(
    screen.getByRole("button", { name: "Notifications, 3 unread" }),
  ).toBeInTheDocument();
});

test("an Inbox render failure is explained and can be retried without changing membership", async () => {
  sdk.failed = true;
  const user = userEvent.setup();
  render(<NotificationInbox userId="0007" />);
  expect(screen.getByRole("status")).toHaveTextContent(
    "Notifications unavailable",
  );
  expect(screen.queryByText("No notifications yet.")).not.toBeInTheDocument();
  sdk.failed = false;
  await user.click(screen.getByRole("button", { name: "Retry notifications" }));
  expect(
    screen.getByRole("button", { name: "Notifications, 3 unread" }),
  ).toBeInTheDocument();
});
