import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fetchAuthSession, replace } = vi.hoisted(() => ({
  fetchAuthSession: vi.fn(),
  replace: vi.fn(),
}));
vi.mock("aws-amplify/auth", () => ({ fetchAuthSession }));
vi.mock("next/navigation", () => {
  const router = { replace };
  return { useRouter: () => router };
});

import ValidationForm from "./ValidationForm";

describe("ValidationForm", () => {
  beforeEach(() => {
    fetchAuthSession.mockReset();
    vi.stubEnv("NEXT_PUBLIC_PROJECT_API_URL", "https://api.example.test/dev");
    fetchAuthSession.mockResolvedValue({ tokens: {
      idToken: { payload: { "cognito:groups": ["TechnicalStaff"] }, toString: () => "staff-token" },
    } });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("redirects unauthenticated users without showing the form", async () => {
    fetchAuthSession.mockResolvedValue({ tokens: undefined });
    render(<ValidationForm projectId="project-123" />);
    expect(await screen.findByText("Checking your sign-in…")).toBeVisible();
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/sign-in"));
    expect(screen.queryByRole("button", { name: "Submit validation" })).not.toBeInTheDocument();
  });

  it.each([["Founders"], ["Admin"], ["Other"]])("denies an authenticated %s user", async (group) => {
    fetchAuthSession.mockResolvedValue({ tokens: { idToken: { payload: { "cognito:groups": [group] }, toString: () => "token" } } });
    render(<ValidationForm projectId="project-123" />);
    expect(await screen.findByRole("heading", { name: "Validation access required" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Submit validation" })).not.toBeInTheDocument();
  });

  it.each([["Mentors"], ["Admin", "TechnicalStaff"]])("allows a session with %s", async (...groups) => {
    fetchAuthSession.mockResolvedValue({ tokens: { idToken: { payload: { "cognito:groups": groups }, toString: () => "allowed-token" } } });
    render(<ValidationForm projectId="project-123" />);
    expect(await screen.findByRole("button", { name: "Submit validation" })).toBeVisible();
  });

  it("does not submit when the session expires after the form opens", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<ValidationForm projectId="project-123" />);
    await screen.findByRole("button", { name: "Submit validation" });
    fetchAuthSession.mockResolvedValueOnce({ tokens: undefined });
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Validation decision"), "approved");
    await user.type(screen.getByLabelText("Reviewer feedback"), "Feedback");
    await user.type(screen.getByLabelText("Questions"), "Question");
    await user.type(screen.getByLabelText("Next steps"), "Next");
    await user.click(screen.getByRole("button", { name: "Submit validation" }));
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/sign-in"));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not submit when the allowed group is removed", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<ValidationForm projectId="project-123" />);
    await screen.findByRole("button", { name: "Submit validation" });
    fetchAuthSession.mockResolvedValueOnce({ tokens: { idToken: { payload: { "cognito:groups": ["Founders"] }, toString: () => "founder-token" } } });
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Validation decision"), "approved");
    await user.type(screen.getByLabelText("Reviewer feedback"), "Feedback");
    await user.type(screen.getByLabelText("Questions"), "Question");
    await user.type(screen.getByLabelText("Next steps"), "Next");
    await user.click(screen.getByRole("button", { name: "Submit validation" }));
    expect(await screen.findByRole("heading", { name: "Validation access required" })).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([[401, "/sign-in"], [403, null]])("handles API %i without reporting success", async (status, redirect) => {
    vi.stubEnv("NEXT_PUBLIC_PROJECT_API_URL", "https://api.example.test/dev");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status })));
    render(<ValidationForm projectId="project-123" />);
    await screen.findByRole("button", { name: "Submit validation" });
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Validation decision"), "approved");
    await user.type(screen.getByLabelText("Reviewer feedback"), "Feedback");
    await user.type(screen.getByLabelText("Questions"), "Question");
    await user.type(screen.getByLabelText("Next steps"), "Next");
    await user.click(screen.getByRole("button", { name: "Submit validation" }));
    if (redirect) await vi.waitFor(() => expect(replace).toHaveBeenCalledWith(redirect));
    else expect(await screen.findByRole("heading", { name: "Validation access required" })).toBeVisible();
    expect(screen.queryByText(/Validation created successfully/)).not.toBeInTheDocument();
  });

  it("submits the validation object to the project validation endpoint", async () => {
    vi.stubEnv("NEXT_PUBLIC_PROJECT_API_URL", "https://api.example.test/dev/");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ action: "created" }), { status: 201 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<ValidationForm projectId="project-123" />);
    await screen.findByRole("button", { name: "Submit validation" });

    await user.selectOptions(screen.getByLabelText("Validation decision"), "approved");
    await user.type(screen.getByLabelText("Reviewer feedback"), "Project appears feasible.");
    await user.type(screen.getByLabelText("Questions"), "What is the delivery date?");
    await user.type(screen.getByLabelText("Next steps"), "Proceed to review.");
    await user.click(screen.getByRole("button", { name: "Submit validation" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.test/dev/validation/projects/project-123",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "staff-token" },
        body: JSON.stringify({
          decision: "approved",
          feedback: "Project appears feasible.",
          questions: "What is the delivery date?",
          nextSteps: "Proceed to review.",
        }),
      },
    );
    expect(await screen.findByText("Validation created successfully.")).toBeVisible();
    expect(screen.getByLabelText("Validation decision")).toHaveValue("");
    expect(screen.getByLabelText("Reviewer feedback")).toHaveValue("");
    expect(screen.getByLabelText("Questions")).toHaveValue("");
    expect(screen.getByLabelText("Next steps")).toHaveValue("");
  });

  it("shows a loading state and an error when the request fails", async () => {
    vi.stubEnv("NEXT_PUBLIC_PROJECT_API_URL", "https://api.example.test/dev");
    let rejectRequest: (reason: Error) => void;
    const fetchMock = vi.fn().mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectRequest = reject;
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<ValidationForm projectId="project-123" />);
    await screen.findByRole("button", { name: "Submit validation" });

    await user.selectOptions(screen.getByLabelText("Validation decision"), "approved");
    await user.type(screen.getByLabelText("Reviewer feedback"), "Project appears feasible.");
    await user.type(screen.getByLabelText("Questions"), "What is the delivery date?");
    await user.type(screen.getByLabelText("Next steps"), "Proceed to review.");
    await user.click(screen.getByRole("button", { name: "Submit validation" }));

    expect(screen.getByRole("button", { name: "Submitting validation…" })).toBeDisabled();
    rejectRequest!(new Error("Network unavailable"));

    expect(await screen.findByText("Unable to submit validation. Please try again.")).toBeVisible();
  });

  it("shows an error when the validation endpoint returns an error response", async () => {
    vi.stubEnv("NEXT_PUBLIC_PROJECT_API_URL", "https://api.example.test/dev");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 500 })));
    const user = userEvent.setup();

    render(<ValidationForm projectId="project-123" />);
    await screen.findByRole("button", { name: "Submit validation" });

    await user.selectOptions(screen.getByLabelText("Validation decision"), "approved");
    await user.type(screen.getByLabelText("Reviewer feedback"), "Project appears feasible.");
    await user.type(screen.getByLabelText("Questions"), "What is the delivery date?");
    await user.type(screen.getByLabelText("Next steps"), "Proceed to review.");
    await user.click(screen.getByRole("button", { name: "Submit validation" }));

    expect(await screen.findByText("Unable to submit validation. Please try again.")).toBeVisible();
  });

  it("shows the mock update outcome returned by the validation endpoint", async () => {
    vi.stubEnv("NEXT_PUBLIC_PROJECT_API_URL", "https://api.example.test/dev");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("{}", { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<ValidationForm projectId="project-456" />);
    await screen.findByRole("button", { name: "Submit validation" });

    await user.selectOptions(screen.getByLabelText("Validation decision"), "approved");
    await user.type(screen.getByLabelText("Reviewer feedback"), "Project appears feasible.");
    await user.type(screen.getByLabelText("Questions"), "What is the delivery date?");
    await user.type(screen.getByLabelText("Next steps"), "Proceed to review.");
    await user.click(screen.getByRole("button", { name: "Submit validation" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.test/dev/validation/projects/project-456",
      expect.objectContaining({ method: "PATCH", headers: { "Content-Type": "application/json", Authorization: "staff-token" } }),
    );
    expect(await screen.findByText("Validation updated successfully.")).toBeVisible();
  });

  it("shows a not-found state for an unknown mock project", async () => {
    render(<ValidationForm projectId="missing-project" />);

    expect(await screen.findByRole("heading", { name: "Project not found" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Submit validation" })).not.toBeInTheDocument();
  });
});
