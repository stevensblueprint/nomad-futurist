import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdminUsersForm from "./AdminUsersForm";

const { getCurrentUser, fetchAuthSession } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  fetchAuthSession: vi.fn(),
}));

vi.mock("../../lib/amplify", () => ({}));
vi.mock("aws-amplify/auth", () => ({
  getCurrentUser,
  fetchAuthSession,
  signOut: vi.fn(),
}));

const fetchMock = vi.fn();

function sessionWithGroups(groups: string[]) {
  return {
    tokens: {
      idToken: {
        payload: { "cognito:groups": groups },
        toString: () => "id-token",
      },
    },
  };
}

describe("AdminUsersForm", () => {
  beforeEach(() => {
    getCurrentUser.mockReset();
    fetchAuthSession.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("asks for sign-in when there is no session", async () => {
    getCurrentUser.mockRejectedValue(new Error("no user"));
    render(<AdminUsersForm />);
    expect(await screen.findByText("Sign in required.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to sign in" })).toHaveAttribute("href", "/sign-in");
    expect(screen.queryByLabelText("Email address")).not.toBeInTheDocument();
  });

  it("blocks signed-in users who are not Admins", async () => {
    getCurrentUser.mockResolvedValue({ username: "user" });
    fetchAuthSession.mockResolvedValue(sessionWithGroups(["Mentors"]));
    render(<AdminUsersForm />);
    expect(await screen.findByText("Admin access required.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Email address")).not.toBeInTheDocument();
  });

  it("submits the email, role, and bearer token for an Admin", async () => {
    const user = userEvent.setup();
    getCurrentUser.mockResolvedValue({ username: "admin" });
    fetchAuthSession.mockResolvedValue(sessionWithGroups(["Admin"]));
    fetchMock.mockResolvedValue({ status: 201, json: async () => ({ message: "User invitation sent." }) });

    render(<AdminUsersForm />);
    await user.type(await screen.findByLabelText("Email address"), "staff@example.com");
    await user.selectOptions(screen.getByLabelText("Role"), "TechnicalStaff");
    await user.click(screen.getByRole("button", { name: "Send invitation" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/users",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer id-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: "staff@example.com", role: "TechnicalStaff" }),
      }),
    );
    expect(await screen.findByText("Invitation sent.")).toBeInTheDocument();
    expect(screen.getByLabelText("Email address")).toHaveValue("");
    expect(screen.getByLabelText("Role")).toHaveValue("");
  });

  it("shows Session expired when the submit-time session refresh fails", async () => {
    const user = userEvent.setup();
    getCurrentUser.mockResolvedValue({ username: "admin" });
    fetchAuthSession
      .mockResolvedValueOnce(sessionWithGroups(["Admin"]))
      .mockRejectedValueOnce(new Error("expired"));

    render(<AdminUsersForm />);
    await user.type(await screen.findByLabelText("Email address"), "staff@example.com");
    await user.selectOptions(screen.getByLabelText("Role"), "TechnicalStaff");
    await user.click(screen.getByRole("button", { name: "Send invitation" }));

    expect(await screen.findByText("Session expired. Sign in again.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the duplicate-account message", async () => {
    const user = userEvent.setup();
    getCurrentUser.mockResolvedValue({ username: "admin" });
    fetchAuthSession.mockResolvedValue(sessionWithGroups(["Admin"]));
    fetchMock.mockResolvedValue({ status: 409, json: async () => ({ message: "exists" }) });

    render(<AdminUsersForm />);
    await user.type(await screen.findByLabelText("Email address"), "staff@example.com");
    await user.selectOptions(screen.getByLabelText("Role"), "Mentors");
    await user.click(screen.getByRole("button", { name: "Send invitation" }));

    expect(await screen.findByText("An account already exists for this email.")).toBeInTheDocument();
  });

  it("shows a network error when the server is unreachable", async () => {
    const user = userEvent.setup();
    getCurrentUser.mockResolvedValue({ username: "admin" });
    fetchAuthSession.mockResolvedValue(sessionWithGroups(["Admin"]));
    fetchMock.mockRejectedValue(new Error("offline"));

    render(<AdminUsersForm />);
    await user.type(await screen.findByLabelText("Email address"), "staff@example.com");
    await user.selectOptions(screen.getByLabelText("Role"), "TechnicalStaff");
    await user.click(screen.getByRole("button", { name: "Send invitation" }));

    expect(await screen.findByText("Unable to reach the server.")).toBeInTheDocument();
  });

  it("shows a generic error when the server returns non-JSON", async () => {
    const user = userEvent.setup();
    getCurrentUser.mockResolvedValue({ username: "admin" });
    fetchAuthSession.mockResolvedValue(sessionWithGroups(["Admin"]));
    fetchMock.mockResolvedValue({
      status: 500,
      json: async () => {
        throw new Error("not json");
      },
    });

    render(<AdminUsersForm />);
    await user.type(await screen.findByLabelText("Email address"), "staff@example.com");
    await user.selectOptions(screen.getByLabelText("Role"), "TechnicalStaff");
    await user.click(screen.getByRole("button", { name: "Send invitation" }));

    expect(await screen.findByText("Unable to provision the user.")).toBeInTheDocument();
  });

  it("labels the provision roles", async () => {
    getCurrentUser.mockResolvedValue({ username: "admin" });
    fetchAuthSession.mockResolvedValue(sessionWithGroups(["Admin"]));

    render(<AdminUsersForm />);
    await screen.findByLabelText("Email address");
    expect(screen.getByRole("option", { name: "Technical Staff" })).toHaveValue("TechnicalStaff");
    expect(screen.getByRole("option", { name: "Mentor" })).toHaveValue("Mentors");
  });

  it("disables the button while the request is pending", async () => {
    const user = userEvent.setup();
    getCurrentUser.mockResolvedValue({ username: "admin" });
    fetchAuthSession.mockResolvedValue(sessionWithGroups(["Admin"]));
    fetchMock.mockReturnValue(new Promise(() => {}));

    render(<AdminUsersForm />);
    await user.type(await screen.findByLabelText("Email address"), "staff@example.com");
    await user.selectOptions(screen.getByLabelText("Role"), "TechnicalStaff");
    await user.click(screen.getByRole("button", { name: "Send invitation" }));

    expect(await screen.findByRole("button", { name: "Sending..." })).toBeDisabled();
  });
});
