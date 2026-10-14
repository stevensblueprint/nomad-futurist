import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import ValidationForm from "./ValidationForm";

describe("ValidationForm", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("submits the validation object to the project validation endpoint", async () => {
    vi.stubEnv("NEXT_PUBLIC_PROJECT_API_URL", "https://api.example.test/dev/");
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<ValidationForm projectId="project-123" />);

    await user.selectOptions(screen.getByLabelText("Validation decision"), "approved");
    await user.type(screen.getByLabelText("Reviewer feedback"), "Project appears feasible.");
    await user.type(screen.getByLabelText("Questions"), "What is the delivery date?");
    await user.type(screen.getByLabelText("Next steps"), "Proceed to review.");
    await user.click(screen.getByRole("button", { name: "Submit validation" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.test/dev/validation/projects/project-123",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision: "approved",
          feedback: "Project appears feasible.",
          questions: "What is the delivery date?",
          nextSteps: "Proceed to review.",
        }),
      },
    );
    expect(await screen.findByText("Validation submitted successfully.")).toBeVisible();
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

    await user.selectOptions(screen.getByLabelText("Validation decision"), "approved");
    await user.type(screen.getByLabelText("Reviewer feedback"), "Project appears feasible.");
    await user.type(screen.getByLabelText("Questions"), "What is the delivery date?");
    await user.type(screen.getByLabelText("Next steps"), "Proceed to review.");
    await user.click(screen.getByRole("button", { name: "Submit validation" }));

    expect(await screen.findByText("Unable to submit validation. Please try again.")).toBeVisible();
  });
});
