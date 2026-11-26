import { beforeEach, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import { request } from "../services/http";
import Swal from "sweetalert2";

vi.mock("../services/http", () => ({ request: vi.fn() }));
vi.mock("sweetalert2", () => ({
  default: { fire: vi.fn(async () => ({ isConfirmed: true })) },
}));
const json = (data) => new Response(JSON.stringify(data));
beforeEach(() => {
  localStorage.setItem("token", "fixture-access");
  sessionStorage.clear();
  request.mockReset();
  Swal.fire.mockClear();
  request.mockImplementation(async (service, path) => {
    if (service === "users")
      return json({ user: { id: 7, username: "staff", agencyCode: "AUS" } });
    if (path.endsWith("/join_project") || path.endsWith("/leave_project"))
      return json({
        success: false,
        errorMessage: "Membership change declined",
      });
    if (path.startsWith("/projects/P1"))
      return json({
        projectInfo: {
          orgId: "AUS",
          projectId: "P1",
          projectName: "Library",
          projectDesc: "Purpose",
          creatorId: "7",
          budget: 100,
          hardwareList: [],
          joined_users: ["7"],
        },
      });
    if (service === "hardware") return json([]);
    return json({ projectList: [] });
  });
});

test.each(["join", "leave"])(
  "a declined %s response keeps current context and shows no success",
  async (action) => {
    window.history.replaceState(
      {},
      "",
      action === "join" ? "/joinproject" : "/projects/P1?orgId=AUS",
    );
    const user = userEvent.setup();
    render(<App />);
    if (action === "join") {
      await user.type(screen.getByPlaceholderText("Enter project ID"), "P1");
      await user.click(
        await screen.findByRole("button", {
          name: "Join Project",
          exact: true,
        }),
      );
      expect(
        await screen.findByText("Membership change declined"),
      ).toBeInTheDocument();
      expect(window.location.pathname).toBe("/joinproject");
    } else {
      await user.click(
        await screen.findByRole("button", {
          name: "Leave project",
          exact: true,
        }),
      );
      await waitFor(() =>
        expect(Swal.fire).toHaveBeenCalledWith(
          expect.objectContaining({
            icon: "error",
            text: "Membership change declined",
          }),
        ),
      );
      expect(Swal.fire).not.toHaveBeenCalledWith(
        expect.objectContaining({ icon: "success" }),
      );
      expect(window.location.pathname).toBe("/projects/P1");
    }
  },
);
