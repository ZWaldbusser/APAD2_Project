import { beforeEach, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import { request } from "../services/http";

vi.mock("../services/http", () => ({ request: vi.fn() }));
// Legacy third-party alerts are replaced by inline feedback in this slice.
vi.mock("sweetalert2", () => ({ default: { fire: vi.fn(async () => ({})) } }));
const response = (body, status = 200) =>
  new Response(JSON.stringify(body), { status });
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState({}, "", "/login");
  request.mockReset();
});

test.each([
  [401, "Credentials not accepted"],
  [429, "Too many attempts"],
  [503, "Login unavailable"],
])(
  "login status %s has actionable feedback and no automatic retry",
  async (status, title) => {
    request.mockResolvedValue(response({}, status));
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByLabelText("Username"), "staff");
    await user.type(
      screen.getByLabelText("Password", { exact: true }),
      "fixture-password",
    );
    await user.click(
      screen.getByRole("button", { name: "Log in", exact: true }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(title);
    expect(request).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("token")).toBeNull();
  },
);

test("login prevents repeat submissions and fails closed on a malformed success", async () => {
  let resolve;
  request.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const user = userEvent.setup();
  render(<App />);
  await user.type(screen.getByLabelText("Username"), "staff");
  await user.type(
    screen.getByLabelText("Password", { exact: true }),
    "fixture-password",
  );
  await user.dblClick(
    screen.getByRole("button", { name: "Log in", exact: true }),
  );
  expect(request).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "Logging in…" })).toBeDisabled();
  resolve(response({ accessToken: "not-a-completed-mfa-session" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Unexpected login response",
  );
  expect(localStorage.getItem("token")).toBeNull();
  expect(sessionStorage.getItem("mfaToken")).toBeNull();
});

test("registration submits the chosen agency once and confirms without authenticating", async () => {
  window.history.replaceState({}, "", "/register");
  request.mockResolvedValue(
    response(
      { user: { id: 8, username: "new.staff", agencyCode: "DAL" } },
      201,
    ),
  );
  const user = userEvent.setup();
  render(<App />);
  await user.selectOptions(screen.getByLabelText("Agency"), "DAL");
  await user.type(screen.getByLabelText("Username"), "new.staff");
  await user.type(
    screen.getByLabelText("Password", { exact: true }),
    "fixture-password",
  );
  await user.type(
    screen.getByLabelText("Confirm password"),
    "fixture-password",
  );
  await user.click(
    screen.getByRole("button", { name: "Create account", exact: true }),
  );
  expect(
    await screen.findByRole("heading", { name: "You’re ready to log in" }),
  ).toBeInTheDocument();
  expect(request).toHaveBeenCalledWith(
    "users",
    "/api/users-service/register",
    expect.objectContaining({
      body: {
        agencyCode: "DAL",
        username: "new.staff",
        password: "fixture-password",
      },
      auth: false,
    }),
  );
  expect(localStorage.getItem("token")).toBeNull();
  expect(sessionStorage.getItem("mfaToken")).toBeNull();
});

test("setup stays pre-authenticated, hides the key and does not duplicate setup under StrictMode", async () => {
  sessionStorage.setItem("mfaToken", "fixture-challenge");
  window.history.replaceState({}, "", "/2fa/setup");
  request.mockResolvedValue(
    response({
      qrCodeDataUrl: "data:image/svg+xml,%3Csvg/%3E",
      secret: "isolated-setup-key",
    }),
  );
  const user = userEvent.setup();
  render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  expect(
    await screen.findByRole("img", { name: /QR code/ }),
  ).toBeInTheDocument();
  expect(request).toHaveBeenCalledTimes(1);
  expect(screen.queryByText("isolated-setup-key")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /Show Setup Key/ }));
  expect(screen.getByText("isolated-setup-key")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Hide Setup Key" }));
  expect(screen.queryByText("isolated-setup-key")).not.toBeInTheDocument();
  expect(JSON.stringify({ ...sessionStorage, ...localStorage })).not.toContain(
    "isolated-setup-key",
  );
  expect(localStorage.getItem("token")).toBeNull();
});

test("setup outage offers a manual retry and expired setup offers login instead", async () => {
  sessionStorage.setItem("mfaToken", "fixture-challenge");
  window.history.replaceState({}, "", "/2fa/setup");
  request
    .mockResolvedValueOnce(response({}, 503))
    .mockResolvedValueOnce(response({}, 401));
  const user = userEvent.setup();
  render(<App />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Setup unavailable",
  );
  expect(request).toHaveBeenCalledTimes(1);
  await user.click(screen.getByRole("button", { name: "Retry setup" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Verification session ended",
  );
  expect(
    screen.queryByRole("button", { name: "Retry setup" }),
  ).not.toBeInTheDocument();
  expect(sessionStorage.getItem("mfaToken")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Back to login" }));
  expect(
    await screen.findByRole("heading", { name: "Log in" }),
  ).toBeInTheDocument();
});

test("OTP paste keeps leading zeroes and missing access token never authenticates", async () => {
  sessionStorage.setItem("mfaToken", "fixture-challenge");
  window.history.replaceState({}, "", "/2fa/verify");
  request.mockResolvedValue(response({}));
  const user = userEvent.setup();
  render(<App />);
  const code = screen.getByLabelText("Authentication Code");
  expect(code).toHaveAttribute("autocomplete", "one-time-code");
  expect(code).toHaveAttribute("inputmode", "numeric");
  await user.click(code);
  await user.paste("012345");
  expect(code).toHaveValue("012345");
  await user.click(screen.getByRole("button", { name: "Verify", exact: true }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Verification result unavailable",
  );
  expect(request).toHaveBeenCalledWith(
    "users",
    "/api/users-service/2fa/verify",
    expect.objectContaining({
      body: { code: "012345" },
      auth: false,
      headers: { Authorization: "Bearer fixture-challenge" },
    }),
  );
  expect(localStorage.getItem("token")).toBeNull();
  expect(window.location.pathname).toBe("/2fa/verify");
});

test("account outage stays on account and retries, with unknown agency never shown as verified", async () => {
  localStorage.setItem("token", "fixture-access");
  window.history.replaceState({}, "", "/userportal");
  request
    .mockResolvedValueOnce(response({}, 503))
    .mockResolvedValueOnce(
      response({ user: { id: 7, username: "staff", agencyCode: "UNKNOWN" } }),
    );
  const user = userEvent.setup();
  render(<App />);
  expect(
    await screen.findByRole("heading", { name: "Account unavailable" }),
  ).toBeInTheDocument();
  expect(window.location.pathname).toBe("/userportal");
  await user.click(screen.getByRole("button", { name: "Retry account" }));
  expect(await screen.findByText("Status unavailable")).toBeInTheDocument();
  expect(screen.getAllByText("Agency unavailable").length).toBeGreaterThan(0);
  expect(screen.queryByText("UNKNOWN")).not.toBeInTheDocument();
});

test("a missing MFA session returns to login with guidance", async () => {
  window.history.replaceState({}, "", "/2fa/verify");
  render(<App />);
  expect(
    await screen.findByRole("heading", { name: "Log in" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent(
    "verification session ended",
  );
  expect(request).not.toHaveBeenCalled();
});

test("registration explains required fields inline and never submits invalid account details", async () => {
  const user = userEvent.setup();
  window.history.replaceState({}, "", "/register");
  render(<App />);
  await user.click(screen.getByRole("button", { name: /^create account$/i }));
  const summary = await screen.findByRole("alert");
  expect(summary).toHaveFocus();
  expect(screen.getByRole("combobox", { name: "Agency" })).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  expect(screen.getByLabelText("Password", { exact: true })).toHaveAttribute(
    "autocomplete",
    "new-password",
  );
  expect(request).not.toHaveBeenCalled();
});

test("a rejected MFA code has inline guidance and keeps the temporary session outside the workspace", async () => {
  sessionStorage.setItem("mfaToken", "fixture-challenge");
  window.history.replaceState({}, "", "/2fa/verify");
  request.mockResolvedValue(response({ error: "Invalid code" }, 401));
  const user = userEvent.setup();
  render(<App />);
  await user.type(screen.getByPlaceholderText("Enter 6-digit code"), "012345");
  await user.click(screen.getByRole("button", { name: "Verify", exact: true }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Code not accepted",
  );
  expect(localStorage.getItem("token")).toBeNull();
  expect(sessionStorage.getItem("mfaToken")).toBe("fixture-challenge");
  expect(window.location.pathname).toBe("/2fa/verify");
});

test("Forgot Password stays visible and explains unavailable recovery without collecting or submitting a new password", async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole("link", { name: "Forgot Password?" }));
  expect(
    await screen.findByRole("heading", {
      name: "Password recovery is not available",
    }),
  ).toBeInTheDocument();
  expect(screen.queryByLabelText(/new password/i)).not.toBeInTheDocument();
  expect(request).not.toHaveBeenCalled();
  expect(screen.getByRole("link", { name: "Back to login" })).toHaveAttribute(
    "href",
    "/login",
  );
});

test("account uses the verified profile and signs out locally, clearing both token types", async () => {
  localStorage.setItem("token", "fixture-access");
  sessionStorage.setItem("mfaToken", "stale-challenge");
  window.history.replaceState({}, "", "/userportal");
  request.mockResolvedValue(
    response({
      user: {
        id: 7,
        username: "staff",
        agencyCode: "AUS",
        twoFactorEnabled: true,
      },
    }),
  );
  const user = userEvent.setup();
  render(<App />);
  expect(
    await screen.findByRole("heading", { name: "Your account" }),
  ).toBeInTheDocument();
  expect(await screen.findByText("Enabled")).toBeInTheDocument();
  expect(screen.getAllByText("staff").length).toBeGreaterThan(0);
  expect(screen.getByText("7")).toBeInTheDocument();
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  await user.click(
    screen.getByRole("button", { name: "Sign out on this device" }),
  );
  expect(
    await screen.findByRole("heading", { name: "Log in" }),
  ).toBeInTheDocument();
  expect(localStorage.getItem("token")).toBeNull();
  expect(sessionStorage.getItem("mfaToken")).toBeNull();
  expect(screen.getByRole("status")).toHaveTextContent(
    "signed out on this device",
  );
  expect(request.mock.calls.every(([, path]) => path.endsWith("/me"))).toBe(
    true,
  );
});

test("a Users outage has focused inline guidance without blaming credentials, with usable autofill labels", async () => {
  request.mockResolvedValue(response({ error: "Unavailable" }, 503));
  const user = userEvent.setup();
  render(<App />);
  await user.type(screen.getByPlaceholderText("Enter username"), "staff");
  await user.type(
    screen.getByPlaceholderText("Enter password"),
    "fixture-password",
  );
  await user.click(screen.getByRole("button", { name: /^Log ?in$/i }));
  const error = await screen.findByRole("alert");
  expect(error).toHaveTextContent("Login unavailable");
  expect(error).toHaveFocus();
  expect(error).not.toHaveTextContent(/check your credentials/i);
  expect(screen.getByLabelText("Username")).toHaveValue("staff");
  expect(screen.getByLabelText("Username")).toHaveAttribute(
    "autocomplete",
    "username",
  );
  expect(screen.getByLabelText("Password", { exact: true })).toHaveAttribute(
    "autocomplete",
    "current-password",
  );
  expect(localStorage.getItem("token")).toBeNull();
});
